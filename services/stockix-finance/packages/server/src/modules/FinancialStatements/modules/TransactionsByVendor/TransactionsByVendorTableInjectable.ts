import { TransactionsByVendorsTable } from './TransactionsByVendorTable';
import {
  ITransactionsByVendorTable,
} from './TransactionsByVendor.types';
import { TransactionsByVendorsInjectable } from './TransactionsByVendorInjectable';
import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { TransactionsByVendorQueryDto } from './TransactionsByVendorQuery.dto';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class TransactionsByVendorTableInjectable {
  constructor(
    private readonly transactionsByVendor: TransactionsByVendorsInjectable,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) { }

  public async table(
    query: TransactionsByVendorQueryDto
  ): Promise<ITransactionsByVendorTable> {
    const sheet = await this.transactionsByVendor.transactionsByVendors(query);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      query.toDate ?? new Date(),
    );

    const table = new TransactionsByVendorsTable(sheet.data, this.i18n, sheet.meta.dateFormat, secondaryCurrency, secondaryRate);

    return {
      table: {
        rows: table.tableRows(),
        columns: table.tableColumns(),
      },
      query,
      meta: sheet.meta,
    };
  }
}
