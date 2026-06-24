import { Injectable } from '@nestjs/common';
import { IAPAgingSummaryTable } from './APAgingSummary.types';
import { APAgingSummaryService } from './APAgingSummaryService';
import { APAgingSummaryQueryDto } from './APAgingSummaryQuery.dto';
import { buildAgingSummaryTable } from '../AgingSummary/build-aging-summary-table';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class APAgingSummaryTableInjectable {
  constructor(
    private readonly APAgingSummarySheet: APAgingSummaryService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    query: APAgingSummaryQueryDto,
  ): Promise<IAPAgingSummaryTable> {
    const report = await this.APAgingSummarySheet.APAgingSummary(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.asDate ?? new Date(),
    );

    const displayCurrencies: DisplayCurrencyContext[] = await resolveDisplayCurrencies(
      tenantMetadata,
      this.exchangeRatesService,
      query.asDate ?? new Date()
    );

    const table = buildAgingSummaryTable(report.data, report.columns, {
      contactNameLabel: 'Vendor name',
      contactNameKey: 'vendor_name',
      contactNameAccessor: 'vendorName',
      secondaryCurrency,
      secondaryRate,
      groupByCurrency: query.groupByCurrency ?? false,
    });

    return {
      table,
      meta: { ...report.meta, groupByCurrency: query.groupByCurrency ?? false },
      query: report.query,
    };
  }
}
