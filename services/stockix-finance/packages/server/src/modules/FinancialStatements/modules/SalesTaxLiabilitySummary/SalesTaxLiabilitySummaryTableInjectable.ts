import {
  ISalesTaxLiabilitySummaryTable,
  SalesTaxLiabilitySummaryQuery,
} from './SalesTaxLiability.types';
import { SalesTaxLiabilitySummaryTable } from './SalesTaxLiabilitySummaryTable';
import { SalesTaxLiabilitySummaryService } from './SalesTaxLiabilitySummaryService';
import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

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

    const table = new SalesTaxLiabilitySummaryTable(report.data, query, secondaryCurrency, secondaryRate);

    return {
      table: {
        rows: table.tableRows(),
        columns: table.tableColumns(),
      },
      query: report.query,
      meta: report.meta,
    };
  }
}
