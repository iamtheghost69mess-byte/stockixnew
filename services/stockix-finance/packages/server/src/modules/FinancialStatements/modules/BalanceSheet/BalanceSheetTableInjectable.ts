import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';
import { BalanceSheetInjectable } from './BalanceSheetInjectable';
import { buildBalanceSheetTable } from './build-balance-sheet-table';
import { IBalanceSheetQuery, IBalanceSheetTable } from './BalanceSheet.types';

@Injectable()
export class BalanceSheetTableInjectable {
  constructor(
    private readonly balanceSheetService: BalanceSheetInjectable,
    private readonly i18nService: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * Retrieves the balance sheet in table format.
   * @param {number} query -
   * @returns {Promise<IBalanceSheetTable>}
   */
  public async table(filter: IBalanceSheetQuery): Promise<IBalanceSheetTable> {
    const { data, query, meta } =
      await this.balanceSheetService.balanceSheet(filter);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    // ORIGINAL: tenantMetadata.baseCurrency — crashes when metadata is null.
    const baseCurrency = tenantMetadata?.baseCurrency ?? '';
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

    const table = buildBalanceSheetTable(
      data,
      query,
      this.i18nService,
      baseCurrency,
      secondaryCurrency,
      secondaryRate,
    );

    return {
      table: {
        columns: table.columns,
        rows: table.rows,
      },
      query,
      meta,
    };
  }
}
