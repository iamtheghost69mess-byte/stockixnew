import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import {
  ITransactionsByCustomersFilter,
  ITransactionsByCustomersTable,
} from './TransactionsByCustomer.types';
import { TransactionsByCustomersSheet } from './TransactionsByCustomersService';
import { TransactionsByCustomersTable } from './TransactionsByCustomersTable';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class TransactionsByCustomersTableInjectable {
  constructor(
    private readonly transactionsByCustomerService: TransactionsByCustomersSheet,
    private readonly i18n: I18nService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    filter: ITransactionsByCustomersFilter,
  ): Promise<ITransactionsByCustomersTable> {
    const customersTransactions =
      await this.transactionsByCustomerService.transactionsByCustomers(filter);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      filter.toDate ?? new Date(),
    );

    const table = new TransactionsByCustomersTable(
      customersTransactions.data,
      this.i18n,
      customersTransactions.meta.dateFormat,
      secondaryCurrency,
      secondaryRate,
    );
    return {
      table: {
        rows: table.tableRows(),
        columns: table.tableColumns(),
      },
      query: customersTransactions.query,
      meta: customersTransactions.meta,
    };
  }
}
