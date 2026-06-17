import * as R from 'ramda';
import { I18nService } from 'nestjs-i18n';
import { formatNumber } from '@/utils/format-number';
import { ITransactionsByCustomersCustomer } from './TransactionsByCustomer.types';
import { ITableRow, ITableColumn } from '../../types/Table.types';
import { TransactionsByContactsTableRows } from '../TransactionsByContact/TransactionsByContactTableRows';
import { tableRowMapper } from '../../utils/Table.utils';

enum ROW_TYPE {
  OPENING_BALANCE = 'OPENING_BALANCE',
  CLOSING_BALANCE = 'CLOSING_BALANCE',
  TRANSACTION = 'TRANSACTION',
  CUSTOMER = 'CUSTOMER',
}

export class TransactionsByCustomersTable extends TransactionsByContactsTableRows {
  private customersTransactions: ITransactionsByCustomersCustomer[];
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(
    customersTransactions: ITransactionsByCustomersCustomer[],
    i18n: I18nService,
    dateFormat: string,
    secondaryCurrency?: string,
    secondaryRate?: number,
  ) {
    super();
    this.customersTransactions = customersTransactions;
    this.i18n = i18n;
    this.dateFormat = dateFormat;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private secondaryAccessor() {
    if (!this.secondaryCurrency || !this.secondaryRate) return [];
    return [{ key: 'secondary_closing_balance', accessor: 'secondary.formattedAmount' }];
  }

  private decorateSecondary(customer: ITransactionsByCustomersCustomer): any {
    if (!this.secondaryCurrency || !this.secondaryRate) return customer;
    return {
      ...customer,
      secondary: {
        formattedAmount: formatNumber(customer.closingBalance.amount * this.secondaryRate, {
          money: true,
          currencyCode: this.secondaryCurrency,
          precision: 2,
        }),
      },
    };
  }

  private customerDetails = (
    customer: ITransactionsByCustomersCustomer,
  ): ITableRow => {
    const columns = [
      { key: 'customerName', accessor: 'customerName' },
      ...R.repeat({ key: 'empty', value: '' }, 5),
      { key: 'closingBalanceValue', accessor: 'closingBalance.formattedAmount' },
      ...this.secondaryAccessor(),
    ];

    return {
      ...tableRowMapper(this.decorateSecondary(customer), columns, { rowTypes: [ROW_TYPE.CUSTOMER] }),
      children: R.pipe(
        R.when(
          R.always(customer.transactions.length > 0),
          R.pipe(
            R.concat(this.contactTransactions(customer)),
            R.prepend(this.contactOpeningBalance(customer)),
          ),
        ),
        R.append(this.contactClosingBalance(customer)),
      )([]),
    };
  };

  private customerRowsMapper = (
    customer: ITransactionsByCustomersCustomer,
  ): ITableRow => {
    return R.pipe(this.customerDetails)(customer);
  };

  public tableRows = (): ITableRow[] => {
    return R.map(this.customerRowsMapper)(this.customersTransactions);
  };

  public tableColumns = (): ITableColumn[] => {
    const columns: ITableColumn[] = [
      { key: 'customer_name', label: 'Customer name' },
      { key: 'account_name', label: 'Account Name' },
      { key: 'ref_type', label: 'Reference Type' },
      { key: 'transaction_type', label: 'Transaction Type' },
      { key: 'credit', label: 'Credit' },
      { key: 'debit', label: 'Debit' },
      { key: 'running_balance', label: 'Running Balance' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_closing_balance', label: `≈ ${this.secondaryCurrency} Closing Balance` });
    }
    return columns;
  };
}
