import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';
import {
  ITrialBalanceSheetQuery,
  ITrialBalanceSheetTable,
} from './TrialBalanceSheet.types';
import { TrialBalanceSheetTable } from './TrialBalanceSheetTable';
import { TrialBalanceSheetService } from './TrialBalanceSheetInjectable';

@Injectable()
export class TrialBalanceSheetTableInjectable {
  constructor(
    private readonly sheet: TrialBalanceSheetService,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    query: ITrialBalanceSheetQuery,
  ): Promise<ITrialBalanceSheetTable> {
    const trialBalance = await this.sheet.trialBalanceSheet(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.toDate ?? new Date(),
    );

    const table = new TrialBalanceSheetTable(
      trialBalance.data,
      query,
      this.i18n,
      secondaryCurrency,
      secondaryRate,
    );

    return {
      table: {
        columns: table.tableColumns(),
        rows: table.tableRows(),
      },
      meta: trialBalance.meta,
      query: trialBalance.query,
    };
  }
}
