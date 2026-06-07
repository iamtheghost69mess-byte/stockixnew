import {

  BadRequestException,

  Inject,

  Injectable,

  Logger,

  NotFoundException,

} from '@nestjs/common';

import { ClsService } from 'nestjs-cls';

import type { Knex } from 'knex';

import { ACCOUNT_TYPE } from '@/constants/accounts';

import { TenantModel } from '@/modules/System/models/TenantModel';

import UserTenant from '@/modules/System/models/UserTenant';

import { ItemsApplicationService } from '@/modules/Items/ItemsApplication.service';

import { CreateItemDto } from '@/modules/Items/dtos/Item.dto';

import {

  POS_BRIDGE_ITEM_CODES,

  POS_BRIDGE_ITEM_NAMES,

} from '../pos-bridge-items.constants';

import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';



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

    private readonly tenantKnexFactory: TenantKnexFactory,

    @Inject(TenantModel.name)

    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)

    private readonly userTenantModel: typeof UserTenant,

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



  private tenantKnex(tenantId: number): Promise<Knex> {

    return this.tenantKnexFactory.getKnexForTenantId(tenantId);

  }



  private formatSqlError(err: unknown, context: string): string {

    const mysqlErr = err as {

      code?: string;

      sqlMessage?: string;

      message?: string;

    };

    const detail =

      mysqlErr.sqlMessage?.trim()

      || mysqlErr.message?.trim()

      || `${context} failed`;

    this.logger.error(

      `${context} failed (${mysqlErr.code ?? 'unknown'}): ${detail}`,

    );

    return detail;

  }



  private async findContactId(

    knex: Knex,

    contactService: 'customer' | 'vendor',

    displayName: string,

  ): Promise<number | null> {

    const row = await knex('contacts')

      .where({ contact_service: contactService, display_name: displayName })

      .first('id');

    return row?.id ? Number(row.id) : null;

  }



  private async insertContactRow(

    knex: Knex,

    row: Record<string, unknown>,

  ): Promise<number> {

    const now = knex.fn.now();

    try {

      const [id] = await knex('contacts').insert({

        created_at: now,

        updated_at: now,

        ...row,

      });

      return Number(id);

    } catch (err) {

      throw new BadRequestException(this.formatSqlError(err, 'Contact insert'));

    }

  }



  private async resolveWalkInCustomerId(

    knex: Knex,

    currencyCode: string,

  ): Promise<number> {

    const existing = await this.findContactId(

      knex,

      'customer',

      WALK_IN_DISPLAY_NAME,

    );

    if (existing) {

      return existing;

    }



    return this.insertContactRow(knex, {

      contact_service: 'customer',

      contact_type: 'individual',

      display_name: WALK_IN_DISPLAY_NAME,

      currency_code: currencyCode,

      active: 1,

      balance: 0,

      opening_balance: 0,

      opening_balance_exchange_rate: 1,

      note: '',

    });

  }



  private async resolveDefaultVendorId(

    knex: Knex,

    currencyCode: string,

  ): Promise<number> {

    const existing = await this.findContactId(

      knex,

      'vendor',

      POS_VENDOR_DISPLAY_NAME,

    );

    if (existing) {

      return existing;

    }



    return this.insertContactRow(knex, {

      contact_service: 'vendor',

      contact_type: 'business',

      display_name: POS_VENDOR_DISPLAY_NAME,

      currency_code: currencyCode,

      active: 1,

      balance: 0,

      opening_balance: 0,

      opening_balance_exchange_rate: 1,

      note: '',

    });

  }



  private async findFirstActiveAccountId(

    knex: Knex,

    accountTypes: string | string[],

  ): Promise<number | null> {

    const types = Array.isArray(accountTypes) ? accountTypes : [accountTypes];

    const row = await knex('accounts')

      .where({ active: 1 })

      .whereIn('account_type', types)

      .orderBy('id', 'asc')

      .first('id');

    return row?.id ? Number(row.id) : null;

  }



  private async resolveInventoryAccountIds(knex: Knex): Promise<{

    inventoryAccountId?: number;

    inventoryVarianceAccountId?: number;

  }> {

    const inventoryAccountId =

      (await this.findFirstActiveAccountId(knex, ACCOUNT_TYPE.INVENTORY))

      ?? undefined;

    const inventoryVarianceAccountId =

      (await this.findFirstActiveAccountId(knex, ACCOUNT_TYPE.EXPENSE))

      ?? undefined;



    return { inventoryAccountId, inventoryVarianceAccountId };

  }



  private async resolveDepositAccountIds(knex: Knex): Promise<{

    cashAccountId: number;

    cardAccountId: number;

  }> {

    const cashAccountId = await this.findFirstActiveAccountId(

      knex,

      ACCOUNT_TYPE.CASH,

    );

    const bankAccountId = await this.findFirstActiveAccountId(

      knex,

      ACCOUNT_TYPE.BANK,

    );



    if (!cashAccountId) {

      throw new BadRequestException(

        'No active cash account found in chart of accounts',

      );

    }



    const cardAccountId = bankAccountId ?? cashAccountId;

    return { cashAccountId, cardAccountId };

  }



  private async resolveDefaultSellAccountId(knex: Knex): Promise<number | undefined> {

    return (

      (await this.findFirstActiveAccountId(knex, [

        ACCOUNT_TYPE.INCOME,

        ACCOUNT_TYPE.OTHER_INCOME,

      ])) ?? undefined

    );

  }



  private async resolvePosBridgeItem(

    knex: Knex,

    params: { code: string; name: string; sellAccountId: number },

  ): Promise<number> {

    const byCode = await knex('items').where({ code: params.code }).first('id');

    if (byCode?.id) {

      return Number(byCode.id);

    }



    const byName = await knex('items').where({ name: params.name }).first('id');

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



  private async resolvePosBridgeItemIds(knex: Knex): Promise<{

    serviceChargeItemId?: number;

    discountItemId?: number;

  }> {

    const sellAccountId = await this.resolveDefaultSellAccountId(knex);

    if (!sellAccountId) {

      this.logger.warn(

        'Skipping POS bridge items: no active income account on chart of accounts',

      );

      return {};

    }



    try {

      const serviceChargeItemId = await this.resolvePosBridgeItem(knex, {

        code: POS_BRIDGE_ITEM_CODES.SERVICE_CHARGE,

        name: POS_BRIDGE_ITEM_NAMES.SERVICE_CHARGE,

        sellAccountId,

      });

      const discountItemId = await this.resolvePosBridgeItem(knex, {

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

    const knex = await this.tenantKnex(tenantId);



    const walkInCustomerId = await this.resolveWalkInCustomerId(

      knex,

      currencyCode,

    );

    const defaultVendorId = await this.resolveDefaultVendorId(

      knex,

      currencyCode,

    );

    const { cashAccountId, cardAccountId } =

      await this.resolveDepositAccountIds(knex);

    const inventoryAccounts = await this.resolveInventoryAccountIds(knex);

    const bridgeItems = await this.resolvePosBridgeItemIds(knex);



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


