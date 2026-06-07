import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ACCOUNT_TYPE } from '@/constants/accounts';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { Customer } from '@/modules/Customers/models/Customer';
import { Account } from '@/modules/Accounts/models/Account.model';
import { Item } from '@/modules/Items/models/Item';
import { ItemsApplicationService } from '@/modules/Items/ItemsApplication.service';
import { CreateItemDto } from '@/modules/Items/dtos/Item.dto';
import { Vendor } from '@/modules/Vendors/models/Vendor';
import {
  POS_BRIDGE_ITEM_CODES,
  POS_BRIDGE_ITEM_NAMES,
} from '../pos-bridge-items.constants';
import { ContactService } from '@/modules/Contacts/types/Contacts.types';

const WALK_IN_DISPLAY_NAME = 'Walk-in Customer';
const POS_VENDOR_DISPLAY_NAME = 'POS Trade Vendor';

export type SeedPosDefaultsResult = {
  success: true;
  walkInCustomerId: number;
  cashAccountId: number;
  cardAccountId: number;
  serviceChargeItemId?: number;
  discountItemId?: number;
  defaultVendorId?: number;
  inventoryAccountId?: number;
  inventoryVarianceAccountId?: number;
};

@Injectable()
export class InternalSeedPosDefaultsService {
  private readonly logger = new Logger(InternalSeedPosDefaultsService.name);

  constructor(
    private readonly cls: ClsService,
    private readonly itemsApplication: ItemsApplicationService,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(Customer.name)
    private readonly customerModel: TenantModelProxy<typeof Customer>,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,

    @Inject(Item.name)
    private readonly itemModel: TenantModelProxy<typeof Item>,

    @Inject(Vendor.name)
    private readonly vendorModel: TenantModelProxy<typeof Vendor>,
  ) {}

  private async resolveTenantContext(tenantId: number) {
    const tenant = await this.tenantModel
      .query()
      .findById(tenantId)
      .withGraphFetched('metadata');
    if (!tenant) {
      throw new NotFoundException(`No tenant found with id: ${tenantId}`);
    }

    const membership = await this.userTenantModel
      .query()
      .where({ tenantId })
      .where({ isActive: true })
      .first();

    if (!membership?.userId) {
      throw new BadRequestException(
        `No active system user membership for tenant ${tenantId}`,
      );
    }

    this.cls.set('tenantId', tenantId);
    this.cls.set('organizationId', tenant.organizationId);
    this.cls.set('userId', membership.userId);

    return tenant;
  }

  private async resolveWalkInCustomerId(currencyCode: string): Promise<number> {
    const existing = await this.customerModel()
      .query()
      .where('displayName', WALK_IN_DISPLAY_NAME)
      .first();

    if (existing?.id) {
      return Number(existing.id);
    }

    const created = await this.customerModel()
      .query()
      .insertAndFetch({
        contactService: ContactService.Customer,
        contactType: 'individual',
        displayName: WALK_IN_DISPLAY_NAME,
        currencyCode,
        active: true,
        balance: 0,
        openingBalance: 0,
        openingBalanceExchangeRate: 1,
        note: '',
      });

    return Number(created.id);
  }

  private async resolveDefaultVendorId(currencyCode: string): Promise<number> {
    const existing = await this.vendorModel()
      .query()
      .where('displayName', POS_VENDOR_DISPLAY_NAME)
      .first();

    if (existing?.id) {
      return Number(existing.id);
    }

    const created = await this.vendorModel()
      .query()
      .insertAndFetch({
        contactService: ContactService.Vendor,
        contactType: 'business',
        displayName: POS_VENDOR_DISPLAY_NAME,
        currencyCode,
        active: true,
        balance: 0,
        openingBalance: 0,
        openingBalanceExchangeRate: 1,
        note: '',
      });

    return Number(created.id);
  }

  private async resolveInventoryAccountIds(): Promise<{
    inventoryAccountId?: number;
    inventoryVarianceAccountId?: number;
  }> {
    const inventory = await this.accountModel()
      .query()
      .where('accountType', ACCOUNT_TYPE.INVENTORY)
      .where('active', true)
      .orderBy('id', 'asc')
      .first();

    const variance = await this.accountModel()
      .query()
      .where('accountType', ACCOUNT_TYPE.EXPENSE)
      .where('active', true)
      .orderBy('id', 'asc')
      .first();

    return {
      inventoryAccountId: inventory?.id ? Number(inventory.id) : undefined,
      inventoryVarianceAccountId: variance?.id ? Number(variance.id) : undefined,
    };
  }

  private async resolveDepositAccountIds(): Promise<{
    cashAccountId: number;
    cardAccountId: number;
  }> {
    const cashAccount = await this.accountModel()
      .query()
      .where('accountType', ACCOUNT_TYPE.CASH)
      .where('active', true)
      .orderBy('id', 'asc')
      .first();

    const bankAccount = await this.accountModel()
      .query()
      .where('accountType', ACCOUNT_TYPE.BANK)
      .where('active', true)
      .orderBy('id', 'asc')
      .first();

    if (!cashAccount?.id) {
      throw new BadRequestException(
        'No active cash account found in chart of accounts',
      );
    }

    const cardAccount = bankAccount ?? cashAccount;
    if (!cardAccount?.id) {
      throw new BadRequestException(
        'No active bank or cash account found for card deposits',
      );
    }

    return {
      cashAccountId: Number(cashAccount.id),
      cardAccountId: Number(cardAccount.id),
    };
  }

  private async resolveDefaultSellAccountId(): Promise<number | undefined> {
    const income = await this.accountModel()
      .query()
      .where('active', true)
      .whereIn('accountType', [ACCOUNT_TYPE.INCOME, ACCOUNT_TYPE.OTHER_INCOME])
      .orderBy('id', 'asc')
      .first();

    if (!income?.id) {
      return undefined;
    }
    return Number(income.id);
  }

  /**
   * Find or create a non-inventory service item used on POS sale receipts.
   * Idempotent on `code`, then `name`.
   */
  private async resolvePosBridgeItem(params: {
    code: string;
    name: string;
    sellAccountId: number;
  }): Promise<number> {
    const byCode = await this.itemModel()
      .query()
      .where('code', params.code)
      .first();
    if (byCode?.id) {
      return Number(byCode.id);
    }

    const byName = await this.itemModel()
      .query()
      .where('name', params.name)
      .first();
    if (byName?.id) {
      return Number(byName.id);
    }

    const dto = new CreateItemDto();
    dto.name = params.name;
    dto.code = params.code;
    dto.type = 'service';
    dto.sellable = true;
    dto.sellPrice = 0;
    dto.sellAccountId = params.sellAccountId;
    dto.active = true;
    dto.purchasable = false;

    const createdId = await this.itemsApplication.createItem(dto);
    return Number(createdId);
  }

  private async resolvePosBridgeItemIds(): Promise<{
    serviceChargeItemId?: number;
    discountItemId?: number;
  }> {
    const sellAccountId = await this.resolveDefaultSellAccountId();
    if (!sellAccountId) {
      this.logger.warn(
        'Skipping POS bridge items: no active income account on chart of accounts',
      );
      return {};
    }

    try {
      const serviceChargeItemId = await this.resolvePosBridgeItem({
        code: POS_BRIDGE_ITEM_CODES.SERVICE_CHARGE,
        name: POS_BRIDGE_ITEM_NAMES.SERVICE_CHARGE,
        sellAccountId,
      });
      const discountItemId = await this.resolvePosBridgeItem({
        code: POS_BRIDGE_ITEM_CODES.ORDER_DISCOUNT,
        name: POS_BRIDGE_ITEM_NAMES.ORDER_DISCOUNT,
        sellAccountId,
      });
      return { serviceChargeItemId, discountItemId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `POS bridge items not seeded (walk-in/deposits still ok): ${message}`,
      );
      return {};
    }
  }

  async seedForTenant(tenantId: number): Promise<SeedPosDefaultsResult> {
    const tenant = await this.resolveTenantContext(tenantId);
    const currencyCode =
      (tenant.metadata?.baseCurrency as string | undefined)?.trim() || 'USD';

    const walkInCustomerId = await this.resolveWalkInCustomerId(currencyCode);
    const defaultVendorId = await this.resolveDefaultVendorId(currencyCode);
    const { cashAccountId, cardAccountId } = await this.resolveDepositAccountIds();
    const inventoryAccounts = await this.resolveInventoryAccountIds();
    const bridgeItems = await this.resolvePosBridgeItemIds();

    return {
      success: true,
      walkInCustomerId,
      cashAccountId,
      cardAccountId,
      defaultVendorId,
      ...inventoryAccounts,
      ...bridgeItems,
    };
  }
}
