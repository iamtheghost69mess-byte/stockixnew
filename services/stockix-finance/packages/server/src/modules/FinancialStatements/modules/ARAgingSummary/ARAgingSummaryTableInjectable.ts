import { ARAgingSummaryService } from './ARAgingSummaryService';
import { Injectable } from '@nestjs/common';
import { IARAgingSummaryTable } from './ARAgingSummary.types';
import { ARAgingSummaryQueryDto } from './ARAgingSummaryQuery.dto';
import { buildAgingSummaryTable } from '../AgingSummary/build-aging-summary-table';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class ARAgingSummaryTableInjectable {
  constructor(
    private readonly ARAgingSummarySheet: ARAgingSummaryService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    query: ARAgingSummaryQueryDto,
  ): Promise<IARAgingSummaryTable> {
    const report = await this.ARAgingSummarySheet.ARAgingSummary(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.asDate ?? new Date(),
    );

    const table = buildAgingSummaryTable(report.data, report.columns, {
      contactNameLabel: 'Customer name',
      contactNameKey: 'customer_name',
      contactNameAccessor: 'customerName',
      secondaryCurrency,
      secondaryRate,
    });

    return {
      table,
      meta: report.meta,
      query,
    };
  }
}
