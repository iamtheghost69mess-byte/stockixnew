import { Injectable } from '@nestjs/common';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { resolveSecondaryCurrency, resolveDisplayCurrencies, DisplayCurrencyContext } from '../../common/resolveSecondaryCurrency';
import {
  IGeneralLedgerSheetQuery,
  IGeneralLedgerTableData,
} from './GeneralLedger.types';
import { GeneralLedgerService } from './GeneralLedgerService';
import { GeneralLedgerTable } from './GeneralLedgerTable';

@Injectable()
export class GeneralLedgerTableInjectable {
  constructor(
    private readonly GLSheet: GeneralLedgerService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    query: IGeneralLedgerSheetQuery,
  ): Promise<IGeneralLedgerTableData> {
    const {
      data: sheetData,
      query: sheetQuery,
      meta: sheetMeta,
    } = await this.GLSheet.generalLedger(query);

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

    const table = new GeneralLedgerTable(sheetData, sheetQuery, sheetMeta, secondaryCurrency, secondaryRate);

    return {
      table: {
        columns: table.tableColumns(),
        rows: table.tableRows(),
      },
      query: sheetQuery,
      meta: sheetMeta,
    };
  }
}
