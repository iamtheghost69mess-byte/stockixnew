import * as R from 'ramda';
import { I18nService } from 'nestjs-i18n';
import { formatNumber } from '@/utils/format-number';
import {
  ICustomerBalanceSummaryData,
  ICustomerBalanceSummaryCustomer,
  ICustomerBalanceSummaryTotal,
  ICustomerBalanceSummaryQuery,
} from './CustomerBalanceSummary.types';
import {
  IColumnMapperMeta,
  ITableColumn,
  ITableRow,
} from '../../types/Table.types';
import { tableMapper, tableRowMapper } from '../../utils/Table.utils';

enum TABLE_ROWS_TYPES {
  CUSTOMER = 'CUSTOMER',
  TOTAL = 'TOTAL',
}

export class CustomerBalanceSummaryTable {
  public readonly report: ICustomerBalanceSummaryData;
  public readonly query: ICustomerBalanceSummaryQuery;
  public readonly i18n: I18nService;
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(
    report: ICustomerBalanceSummaryData,
    query: ICustomerBalanceSummaryQuery,
    i18n: I18nService,
    secondaryCurrency?: string,
    secondaryRate?: number,
  ) {
    this.report = report;
    this.i18n = i18n;
    this.query = query;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private decorateSecondary = (node: any): any => {
    if (!this.secondaryCurrency || !this.secondaryRate || node.total?.amount == null) {
      return node;
    }
    return {
      ...node,
      secondary: {
        formattedAmount: formatNumber(node.total.amount * this.secondaryRate, {
          money: true,
          currencyCode: this.secondaryCurrency,
          precision: 2,
        }),
      },
    };
  };

  /**
   * Retrieve percentage columns accessor.
   * @returns {IColumnMapperMeta[]}
   */
  private getPercentageColumnsAccessor = (): IColumnMapperMeta[] => {
    return [
      {
        key: 'percentageOfColumn',
        accessor: 'percentageOfColumn.formattedAmount',
      },
    ];
  };

  private getCustomerColumnsAccessor = (): IColumnMapperMeta[] => {
    const columns: IColumnMapperMeta[] = [
      { key: 'name', accessor: 'customerName' },
      { key: 'total', accessor: 'total.formattedAmount' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_total', accessor: 'secondary.formattedAmount' });
    }
    return R.compose(
      R.concat(columns),
      R.when(
        R.always(this.query.percentageColumn),
        R.concat(this.getPercentageColumnsAccessor()),
      ),
    )([]);
  };

  private customersTransformer(
    customers: ICustomerBalanceSummaryCustomer[],
  ): ITableRow[] {
    const columns = this.getCustomerColumnsAccessor();
    const decorated = customers.map(this.decorateSecondary);

    return tableMapper(decorated, columns, {
      rowTypes: [TABLE_ROWS_TYPES.CUSTOMER],
    });
  }

  private getTotalColumnsAccessor = (): IColumnMapperMeta[] => {
    const columns: IColumnMapperMeta[] = [
      { key: 'name', value: this.i18n.t('contact_summary_balance.total') },
      { key: 'total', accessor: 'total.formattedAmount' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_total', accessor: 'secondary.formattedAmount' });
    }
    // @ts-ignore
    return R.compose(
      R.concat(columns),
      R.when(
        R.always(this.query.percentageColumn),
        R.concat(this.getPercentageColumnsAccessor()),
      ),
    )([]);
  };

  private totalTransformer = (
    total: ICustomerBalanceSummaryTotal,
  ): ITableRow => {
    const columns = this.getTotalColumnsAccessor();

    return tableRowMapper(this.decorateSecondary(total), columns, {
      rowTypes: [TABLE_ROWS_TYPES.TOTAL],
    });
  };

  /**
   * Transformes the customer balance summary to table rows.
   * @param   {ICustomerBalanceSummaryData} customerBalanceSummary
   * @returns {ITableRow[]}
   */
  public tableRows(): ITableRow[] {
    const customers = this.customersTransformer(this.report.customers);
    const total = this.totalTransformer(this.report.total);

    return customers.length > 0 ? [...customers, total] : [];
  }

  public tableColumns = (): ITableColumn[] => {
    const columns: ITableColumn[] = [
      {
        key: 'name',
        label: this.i18n.t('contact_summary_balance.account_name'),
      },
      { key: 'total', label: this.i18n.t('contact_summary_balance.total') },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({
        key: 'secondary_total',
        label: `≈ ${this.secondaryCurrency} ${this.i18n.t('contact_summary_balance.total')}`,
      });
    }
    // @ts-ignore
    return R.compose(
      R.when(
        R.always(this.query.percentageColumn),
        R.append({
          key: 'percentage_of_column',
          label: this.i18n.t('contact_summary_balance.percentage_column'),
        }),
      ),
      R.concat(columns),
    )([]);
  };
}
