import {
  ISalesTaxLiabilitySummaryTable,
  SalesTaxLiabilitySummaryQuery,
} from './SalesTaxLiability.types';
import { SalesTaxLiabilitySummaryTable } from './SalesTaxLiabilitySummaryTable';
import { SalesTaxLiabilitySummaryService } from './SalesTaxLiabilitySummaryService';
import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class SalesTaxLiabilitySummaryTableInjectable {
  constructor(
    private readonly salesTaxLiability: SalesTaxLiabilitySummaryService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    query: SalesTaxLiabilitySummaryQuery,
  ): Promise<ISalesTaxLiabilitySummaryTable> {
    const report = await this.salesTaxLiability.salesTaxLiability(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.toDate ?? new Date(),
    );

    const displayCurrencies: DisplayCurrencyContext[] = await resolveDisplayCurrencies(
      tenantMetadata,
      this.exchangeRatesService,
      query.toDate ?? new Date()
    );

    const table = new SalesTaxLiabilitySummaryTable(report.data, query, secondaryCurrency, secondaryRate);

    // Warn if any foreign-currency transactions have exchangeRate=1 (likely missing user-entered rate).
    // This would silently under-report the tax base.
    const suspectCount = await this.salesTaxLiability.countSuspectRateTransactions(
      tenantMetadata?.baseCurrency ?? '',
      query.fromDate,
      query.toDate,
    );
    const meta = { ...report.meta, groupByCurrency: query.groupByCurrency ?? false } as any;
    if (suspectCount > 0) {
      meta.warnings = [
        {
          code: 'SUSPECT_EXCHANGE_RATES',
          message: `${suspectCount} foreign-currency transaction(s) have exchangeRate=1. Tax totals may be understated. Review these transactions and set the correct exchange rate.`,
          count: suspectCount,
        },
      ];
    }

    return {
      table: {
        rows: table.tableRows(),
        columns: table.tableColumns(),
      },
      query: report.query,
      meta,
    };
  }
}
