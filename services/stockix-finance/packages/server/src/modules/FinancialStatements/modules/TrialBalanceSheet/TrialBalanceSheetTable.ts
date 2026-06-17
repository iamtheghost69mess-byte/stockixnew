import * as R from 'ramda';
import { FinancialSheet } from '../../common/FinancialSheet';
import { FinancialTable } from '../../common/FinancialTable';
import {
  ITrialBalanceAccount,
  ITrialBalanceSheetData,
  ITrialBalanceSheetQuery,
  ITrialBalanceTotal,
} from './TrialBalanceSheet.types';
import {
  ITableColumn,
  ITableColumnAccessor,
  ITableRow,
} from '../../types/Table.types';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { I18nService } from 'nestjs-i18n';
import { tableRowMapper } from '../../utils/Table.utils';
import { IROW_TYPE } from './_constants';

export class TrialBalanceSheetTable extends R.compose(
  FinancialTable,
  FinancialSheetStructure,
)(FinancialSheet) {
  /**
   * Trial balance sheet data.
   * @param {ITrialBalanceSheetData}
   */
  public data: ITrialBalanceSheetData;

  /**
   * Trial balance sheet query.
   * @param {ITrialBalanceSheetQuery}
   */
  public query: ITrialBalanceSheetQuery;

  public i18n: I18nService;
  private secondaryCurrency: string;
  private secondaryRate: number;

  constructor(
    data: ITrialBalanceSheetData,
    query: ITrialBalanceSheetQuery,
    i18n: I18nService,
    secondaryCurrency?: string,
    secondaryRate?: number,
  ) {
    super();

    this.data = data;
    this.query = query;
    this.i18n = i18n;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private decorateSecondary = (node: any): any => {
    if (!this.secondaryCurrency || !this.secondaryRate || node.balance == null) {
      return node;
    }
    return {
      ...node,
      secondary: {
        formattedAmount: this.formatTotalNumber(node.balance * this.secondaryRate, {
          currencyCode: this.secondaryCurrency,
        }),
      },
    };
  };

  private commonColumnsAccessors = (): ITableColumnAccessor[] => {
    const base: ITableColumnAccessor[] = [
      { key: 'account', accessor: 'formattedName' },
      { key: 'debit', accessor: 'formattedDebit' },
      { key: 'credit', accessor: 'formattedCredit' },
      { key: 'total', accessor: 'formattedBalance' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      base.push({ key: 'secondary_balance', accessor: 'secondary.formattedAmount' });
    }
    return base;
  };

  private accountNodeTableRowsMapper = (
    node: ITrialBalanceAccount,
  ): ITableRow => {
    const columns = this.commonColumnsAccessors();
    const meta = {
      rowTypes: [IROW_TYPE.ACCOUNT],
      id: node.id,
    };
    return tableRowMapper(this.decorateSecondary(node), columns, meta);
  };

  private totalNodeTableRowsMapper = (node: ITrialBalanceTotal): ITableRow => {
    const columns = this.commonColumnsAccessors();
    const meta = {
      rowTypes: [IROW_TYPE.TOTAL],
      id: 'total',
    };
    return tableRowMapper(this.decorateSecondary(node), columns, meta);
  };

  /**
   * Mappes the given report sections to table rows.
   * @param  {IBalanceSheetDataNode[]} nodes -
   * @return {ITableRow}
   */
  private accountsToTableRowsMap = (
    nodes: ITrialBalanceAccount[],
  ): ITableRow[] => {
    return this.mapNodesDeep(nodes, this.accountNodeTableRowsMapper);
  };

  /**
   * Retrieves the accounts table rows of the given report data.
   * @returns {ITableRow[]}
   */
  private accountsTableRows = (): ITableRow[] => {
    return this.accountsToTableRowsMap(this.data.accounts);
  };

  /**
   * Maps the given total node to table row.
   * @returns {ITableRow}
   */
  private totalTableRow = (): ITableRow => {
    return this.totalNodeTableRowsMapper(this.data.total);
  };

  /**
   * Retrieves the table rows.
   * @returns {ITableRow[]}
   */
  public tableRows = (): ITableRow[] => {
    return R.compose(
      R.unless(R.isEmpty, R.append(this.totalTableRow())),
      R.concat(this.accountsTableRows()),
    )([]);
  };

  /**
   * Retrrieves the table columns.
   * @returns {ITableColumn[]}
   */
  public tableColumns = (): ITableColumn[] => {
    const columns: ITableColumn[] = [
      { key: 'account', label: this.i18n.t('trial_balance_sheet.account') },
      { key: 'debit', label: this.i18n.t('trial_balance_sheet.debit') },
      { key: 'credit', label: this.i18n.t('trial_balance_sheet.credit') },
      { key: 'total', label: this.i18n.t('trial_balance_sheet.total') },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({
        key: 'secondary_balance',
        label: `≈ ${this.secondaryCurrency} ${this.i18n.t('trial_balance_sheet.total')}`,
      });
    }
    return R.compose(this.tableColumnsCellIndexing, R.concat(columns))([]);
  };
}
