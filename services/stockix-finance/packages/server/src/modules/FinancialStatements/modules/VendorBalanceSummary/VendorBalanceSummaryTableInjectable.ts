import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';
import {
  IVendorBalanceSummaryQuery,
  IVendorBalanceSummaryTable,
} from './VendorBalanceSummary.types';
import { VendorBalanceSummaryTable } from './VendorBalanceSummaryTableRows';
import { VendorBalanceSummaryService } from './VendorBalanceSummaryService';

@Injectable()
export class VendorBalanceSummaryTableInjectable {
  constructor(
    private readonly vendorBalanceSummarySheet: VendorBalanceSummaryService,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    query: IVendorBalanceSummaryQuery,
  ): Promise<IVendorBalanceSummaryTable> {
    const { data, meta } =
      await this.vendorBalanceSummarySheet.vendorBalanceSummary(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.asDate ?? new Date(),
    );

    const table = new VendorBalanceSummaryTable(data, query, this.i18n, secondaryCurrency, secondaryRate);

    return {
      table: {
        columns: table.tableColumns(),
        rows: table.tableRows(),
      },
      query,
      meta,
    };
  }
}
