import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import {
  IInventoryDetailsQuery,
  IInvetoryItemDetailsTable,
} from './InventoryItemDetails.types';
import { InventoryDetailsService } from './InventoryItemDetails.service';
import { InventoryItemDetailsTable } from './InventoryItemDetailsTable';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class InventoryDetailsTableInjectable {
  constructor(
    private readonly inventoryDetails: InventoryDetailsService,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * Retrieves the inventory item details in table format.
   * @param {IInventoryDetailsQuery} query - Inventory details query.
   * @returns {Promise<IInvetoryItemDetailsTable>}
   */
  public async table(
    query: IInventoryDetailsQuery,
  ): Promise<IInvetoryItemDetailsTable> {
    const inventoryDetails =
      await this.inventoryDetails.inventoryDetails(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.toDate ?? new Date(),
    );

    const table = new InventoryItemDetailsTable(
      inventoryDetails,
      this.i18n,
      secondaryCurrency,
      secondaryRate,
    );

    return {
      table: {
        rows: table.tableRows(),
        columns: table.tableColumns(),
      },
      query: inventoryDetails.query,
      meta: inventoryDetails.meta,
    };
  }
}
