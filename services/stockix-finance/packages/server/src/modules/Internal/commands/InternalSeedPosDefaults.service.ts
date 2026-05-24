import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { Customer } from '@/modules/Customers/models/Customer';
import { Account } from '@/modules/Accounts/models/Account.model';
import { CustomersApplication } from '@/modules/Customers/CustomersApplication.service';
import { CreateCustomerDto } from '@/modules/Customers/dtos/CreateCustomer.dto';

const WALK_IN_DISPLAY_NAME = 'Walk-in Customer';

@Injectable()
export class InternalSeedPosDefaultsService {
  constructor(
    private readonly cls: ClsService,
    private readonly customersApplication: CustomersApplication,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(Customer.name)
    private readonly customerModel: TenantModelProxy<typeof Customer>,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,
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

    const dto = new CreateCustomerDto();
    dto.displayName = WALK_IN_DISPLAY_NAME;
    dto.customerType = 'individual';
    dto.currencyCode = currencyCode;
    dto.active = true;

    const created = await this.customersApplication.createCustomer(dto);
    return Number(created.id);
  }

  private async resolveDepositAccountIds(): Promise<{
    cashAccountId: number;
    cardAccountId: number;
  }> {
    const cashAccount = await this.accountModel()
      .query()
      .where('accountType', 'cash')
      .where('active', true)
      .orderBy('id', 'asc')
      .first();

    const bankAccount = await this.accountModel()
      .query()
      .where('accountType', 'bank')
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

  async seedForTenant(tenantId: number): Promise<{
    success: true;
    walkInCustomerId: number;
    cashAccountId: number;
    cardAccountId: number;
  }> {
    const tenant = await this.resolveTenantContext(tenantId);
    const currencyCode =
      (tenant.metadata?.baseCurrency as string | undefined)?.trim() || 'USD';

    const walkInCustomerId = await this.resolveWalkInCustomerId(currencyCode);
    const { cashAccountId, cardAccountId } = await this.resolveDepositAccountIds();

    return {
      success: true,
      walkInCustomerId,
      cashAccountId,
      cardAccountId,
    };
  }
}
