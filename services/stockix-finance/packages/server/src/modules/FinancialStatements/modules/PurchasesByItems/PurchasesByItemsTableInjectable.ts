import {
  IPurchasesByItemsReportQuery,
  IPurchasesByItemsTable,
} from './types/PurchasesByItems.types';
import { PurchasesByItemsService } from './PurchasesByItems.service';
import { PurchasesByItemsTable } from './PurchasesByItemsTable';
import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class PurchasesByItemsTableInjectable {
  constructor(
    private readonly purchasesByItemsSheet: PurchasesByItemsService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    filter: IPurchasesByItemsReportQuery,
  ): Promise<IPurchasesByItemsTable> {
    const { data, query, meta } = await this.purchasesByItemsSheet.purchasesByItems(filter);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      filter.toDate ?? new Date(),
    );

    const displayCurrencies: DisplayCurrencyContext[] = await resolveDisplayCurrencies(
      tenantMetadata,
      this.exchangeRatesService,
      filter.toDate ?? new Date()
    );

    const table = new PurchasesByItemsTable(data, secondaryCurrency, secondaryRate);

    return {
      table: {
        columns: table.tableColumns(),
        rows: table.tableData(),
      },
      meta,
      query,
    };
  }
}
