import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';
import { JournalSheetService } from './JournalSheetService';
import { IJournalReportQuery, IJournalTable } from './JournalSheet.types';
import { JournalSheetTable } from './JournalSheetTable';

@Injectable()
export class JournalSheetTableInjectable {
  constructor(
    private readonly journalSheetService: JournalSheetService,
    private readonly i18nService: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(query: IJournalReportQuery): Promise<IJournalTable> {
    const journal = await this.journalSheetService.journalSheet(query);

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

    const table = new JournalSheetTable(
      journal.data,
      journal.query,
      this.i18nService,
      secondaryCurrency,
      secondaryRate,
    );
    return {
      table: {
        columns: table.tableColumns(),
        rows: table.tableData(),
      },
      query: journal.query,
      meta: journal.meta,
    };
  }
}
