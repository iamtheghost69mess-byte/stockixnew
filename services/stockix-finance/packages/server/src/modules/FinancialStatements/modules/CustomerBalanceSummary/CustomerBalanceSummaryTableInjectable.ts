import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';
import { CustomerBalanceSummaryService } from './CustomerBalanceSummaryService';
import {
  ICustomerBalanceSummaryQuery,
  ICustomerBalanceSummaryTable,
} from './CustomerBalanceSummary.types';
import { CustomerBalanceSummaryTable } from './CustomerBalanceSummaryTableRows';

@Injectable()
export class CustomerBalanceSummaryTableInjectable {
  constructor(
    private readonly customerBalanceSummaryService: CustomerBalanceSummaryService,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    filter: ICustomerBalanceSummaryQuery,
  ): Promise<ICustomerBalanceSummaryTable> {
    const { data, query, meta } =
      await this.customerBalanceSummaryService.customerBalanceSummary(filter);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      filter.asDate ?? new Date(),
    );

    const displayCurrencies: DisplayCurrencyContext[] = await resolveDisplayCurrencies(
      tenantMetadata,
      this.exchangeRatesService,
      filter.asDate ?? new Date()
    );

    const table = new CustomerBalanceSummaryTable(data, filter, this.i18n, secondaryCurrency, secondaryRate);

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
