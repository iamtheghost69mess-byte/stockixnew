import { Injectable } from '@nestjs/common';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ProfitLossSheetService } from './ProfitLossSheetService';
import { ProfitLossSheetTable } from './ProfitLossSheetTable';
import {
  IProfitLossSheetQuery,
  IProfitLossSheetTable,
} from './ProfitLossSheet.types';
import { I18nService } from 'nestjs-i18n';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class ProfitLossSheetTableInjectable {
  constructor(
    private readonly i18n: I18nService,
    private readonly profitLossSheet: ProfitLossSheetService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * Retrieves the profit/loss sheet in table format.
   * @param {IProfitLossSheetQuery} filter - Profit/loss sheet query.
   * @returns {Promise<IProfitLossSheetTable>}
   */
  public async table(
    filter: IProfitLossSheetQuery,
  ): Promise<IProfitLossSheetTable> {
    const { data, query, meta } =
      await this.profitLossSheet.profitLossSheet(filter);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const baseCurrency = tenantMetadata.baseCurrency;
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      filter.toDate
        ? new Date(filter.toDate as string | Date)
        : new Date(),
    );

    const table = new ProfitLossSheetTable(
      data,
      query,
      this.i18n,
      baseCurrency,
      secondaryCurrency,
      secondaryRate,
    );

    return {
      table: {
        rows: table.tableRows(),
        columns: table.tableColumns(),
      },
      query,
      meta,
    };
  }
}
