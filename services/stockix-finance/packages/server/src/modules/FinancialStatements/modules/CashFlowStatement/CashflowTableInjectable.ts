import { Injectable } from '@nestjs/common';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { CashFlowTable } from './CashFlowTable';
import { CashFlowStatementService } from './CashFlowService';
import { I18nService } from 'nestjs-i18n';
import {
  ICashFlowStatementQuery,
  ICashFlowStatementTable,
} from './Cashflow.types';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class CashflowTableInjectable {
  constructor(
    private readonly cashflowSheet: CashFlowStatementService,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * Retrieves the cash flow table.
   * @param {ICashFlowStatementQuery} query - 
   * @returns {Promise<ICashFlowStatementTable>}
   */
  public async table(
    query: ICashFlowStatementQuery,
  ): Promise<ICashFlowStatementTable> {
    const cashflowDOO = await this.cashflowSheet.cashFlow(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    // ORIGINAL: tenantMetadata.baseCurrency — crashes when metadata is null.
    const baseCurrency = tenantMetadata?.baseCurrency ?? '';
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      cashflowDOO.query.toDate ?? new Date(),
    );

    const cashflowTable = new CashFlowTable(
      cashflowDOO,
      this.i18n,
      baseCurrency,
      secondaryCurrency,
      secondaryRate,
    );

    return {
      table: {
        columns: cashflowTable.tableColumns(),
        rows: cashflowTable.tableRows(),
      },
      query: cashflowDOO.query,
      meta: cashflowDOO.meta,
    };
  }
}
