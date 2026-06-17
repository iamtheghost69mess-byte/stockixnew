import * as R from 'ramda';
import { I18nService } from 'nestjs-i18n';
import { formatNumber } from '@/utils/format-number';
import {
  IVendorBalanceSummaryData,
  IVendorBalanceSummaryVendor,
  IVendorBalanceSummaryTotal,
  IVendorBalanceSummaryQuery,
} from './VendorBalanceSummary.types';
import {
  ITableRow,
  ITableColumn,
  IColumnMapperMeta,
} from '../../types/Table.types';
import { tableMapper, tableRowMapper } from '../../utils/Table.utils';

enum TABLE_ROWS_TYPES {
  VENDOR = 'VENDOR',
  TOTAL = 'TOTAL',
}

export class VendorBalanceSummaryTable {
  private readonly i18n: I18nService;
  private readonly report: IVendorBalanceSummaryData;
  private readonly query: IVendorBalanceSummaryQuery;
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(
    report: IVendorBalanceSummaryData,
    query: IVendorBalanceSummaryQuery,
    i18n: I18nService,
    secondaryCurrency?: string,
    secondaryRate?: number,
  ) {
    this.report = report;
    this.query = query;
    this.i18n = i18n;
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

  private getVendorColumnsAccessor = (): IColumnMapperMeta[] => {
    const columns: IColumnMapperMeta[] = [
      { key: 'name', accessor: 'vendorName' },
      { key: 'total', accessor: 'total.formattedAmount' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_total', accessor: 'secondary.formattedAmount' });
    }
    return R.compose(
      R.concat(columns),
      R.when(
        R.always(this.query.percentageColumn),
        R.concat(this.getPercentageColumnsAccessor())
      )
    )([]);
  };

  private vendorsTransformer = (
    vendors: IVendorBalanceSummaryVendor[]
  ): ITableRow[] => {
    const columns = this.getVendorColumnsAccessor();
    const decorated = vendors.map(this.decorateSecondary);

    return tableMapper(decorated, columns, {
      rowTypes: [TABLE_ROWS_TYPES.VENDOR],
    });
  };

  private getTotalColumnsAccessor = (): IColumnMapperMeta[] => {
    const columns: IColumnMapperMeta[] = [
      { key: 'name', value: this.i18n.t('contact_summary_balance.total') },
      { key: 'total', accessor: 'total.formattedAmount' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_total', accessor: 'secondary.formattedAmount' });
    }
    return R.compose(
      R.concat(columns),
      R.when(
        R.always(this.query.percentageColumn),
        R.concat(this.getPercentageColumnsAccessor())
      )
    )([]) as IColumnMapperMeta[];
  };

  private totalTransformer = (total: IVendorBalanceSummaryTotal): ITableRow => {
    const columns = this.getTotalColumnsAccessor();

    return tableRowMapper(this.decorateSecondary(total), columns, {
      rowTypes: [TABLE_ROWS_TYPES.TOTAL],
    });
  };

  /**
   * Transformes the vendor balance summary to table rows.
   * @param {IVendorBalanceSummaryData} vendorBalanceSummary
   * @returns {ITableRow[]}
   */
  public tableRows = (): ITableRow[] => {
    const vendors = this.vendorsTransformer(this.report.vendors);
    const total = this.totalTransformer(this.report.total);

    return vendors.length > 0 ? [...vendors, total] : [];
  };

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
    return R.compose(
      R.when(
        () => this.query.percentageColumn,
        R.append({
          key: 'percentage_of_column',
          label: this.i18n.t('contact_summary_balance.percentage_column'),
        })
      ),
      R.concat(columns),
    )([]) as ITableColumn[];
  };
}
