import { ISalesByItemsReportQuery } from './SalesByItems.types';
import { SalesByItemsReportService } from './SalesByItemsService';
import { SalesByItemsTable } from './SalesByItemsTable';
import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class SalesByItemsTableInjectable {
  constructor(
    private readonly salesByItemSheet: SalesByItemsReportService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(filter: ISalesByItemsReportQuery) {
    const { data, query, meta } = await this.salesByItemSheet.salesByItems(filter);

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

    const table = new SalesByItemsTable(data, secondaryCurrency, secondaryRate);

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
