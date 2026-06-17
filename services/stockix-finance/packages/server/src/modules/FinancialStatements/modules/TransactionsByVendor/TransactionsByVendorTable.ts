import * as R from 'ramda';
import { I18nService } from 'nestjs-i18n';
import { formatNumber } from '@/utils/format-number';
import { ITransactionsByVendorsVendor } from './TransactionsByVendor.types';
import { TransactionsByContactsTableRows } from '../TransactionsByContact/TransactionsByContactTableRows';
import { tableRowMapper } from '../../utils/Table.utils';
import { ITableRow, ITableColumn } from '../../types/Table.types';

enum ROW_TYPE {
  OPENING_BALANCE = 'OPENING_BALANCE',
  CLOSING_BALANCE = 'CLOSING_BALANCE',
  TRANSACTION = 'TRANSACTION',
  VENDOR = 'VENDOR',
}

export class TransactionsByVendorsTable extends TransactionsByContactsTableRows {
  private vendorsTransactions: ITransactionsByVendorsVendor[];
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(
    vendorsTransactions: ITransactionsByVendorsVendor[],
    i18n: I18nService,
    dateFormat: string,
    secondaryCurrency?: string,
    secondaryRate?: number,
  ) {
    super();

    this.vendorsTransactions = vendorsTransactions;
    this.i18n = i18n;
    this.dateFormat = dateFormat;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private secondaryAccessor() {
    if (!this.secondaryCurrency || !this.secondaryRate) return [];
    return [{ key: 'secondary_closing_balance', accessor: 'secondary.formattedAmount' }];
  }

  private decorateSecondary(vendor: ITransactionsByVendorsVendor): any {
    if (!this.secondaryCurrency || !this.secondaryRate) return vendor;
    return {
      ...vendor,
      secondary: {
        formattedAmount: formatNumber(vendor.closingBalance.amount * this.secondaryRate, {
          money: true,
          currencyCode: this.secondaryCurrency,
          precision: 2,
        }),
      },
    };
  }

  private vendorDetails = (vendor: ITransactionsByVendorsVendor) => {
    const columns = [
      { key: 'vendorName', accessor: 'vendorName' },
      ...R.repeat({ key: 'empty', value: '' }, 5),
      { key: 'closingBalanceValue', accessor: 'closingBalance.formattedAmount' },
      ...this.secondaryAccessor(),
    ];
    return {
      ...tableRowMapper(this.decorateSecondary(vendor), columns, { rowTypes: [ROW_TYPE.VENDOR] }),
      children: R.pipe(
        R.when(
          R.always(vendor.transactions.length > 0),
          R.pipe(
            R.concat(this.contactTransactions(vendor)),
            R.prepend(this.contactOpeningBalance(vendor)),
          ),
        ),
        R.append(this.contactClosingBalance(vendor)),
      )([]),
    };
  };

  private vendorRowsMapper = (vendor: ITransactionsByVendorsVendor) => {
    return R.pipe(this.vendorDetails)(vendor);
  };

  public tableRows = (): ITableRow[] => {
    return R.map(this.vendorRowsMapper)(this.vendorsTransactions);
  };

  public tableColumns = (): ITableColumn[] => {
    const columns: ITableColumn[] = [
      { key: 'vendor_name', label: 'Vendor name' },
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
