import * as R from 'ramda';
import {
  IProfitLossSheetQuery,
  ITableColumn,
  IProfitLossSheetAccountsNode,
  ITableColumnAccessor,
  ITableRow,
  ProfitLossNodeType,
  ProfitLossSheetRowType,
  IProfitLossSheetNode,
  IProfitLossSheetEquationNode,
  IProfitLossSheetAccountNode,
} from '@/interfaces';
import { tableRowMapper } from 'utils';
import { FinancialTable } from '../../common/FinancialTable';
import { ProfitLossSheetBase } from './ProfitLossSheetBase';
import { ProfitLossSheetTablePercentage } from './ProfitLossSheetTablePercentage';
import { ProfitLossSheetQuery } from './ProfitLossSheetQuery';
import { ProfitLossTablePreviousPeriod } from './ProfitLossTablePreviousPeriod';
import { ProfitLossTablePreviousYear } from './ProfitLossTablePreviousYear';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { ProfitLossSheetTableDatePeriods } from './ProfitLossSheetTableDatePeriods';

export class ProfitLossSheetTable extends R.compose(
  ProfitLossTablePreviousPeriod,
  ProfitLossTablePreviousYear,
  ProfitLossSheetTablePercentage,
  ProfitLossSheetTableDatePeriods,
  ProfitLossSheetBase,
  FinancialSheetStructure,
  FinancialTable
)(class {}) {
  readonly query: ProfitLossSheetQuery;

  /**
   * Constructor method.
   * @param {} date
   * @param {IProfitLossSheetQuery} query
   */
  private baseCurrency: string;
  private secondaryCurrency: string;
  private secondaryRate: number;

  constructor(
    data: any,
    query: IProfitLossSheetQuery,
    i18n: any,
    baseCurrency?: string,
    secondaryCurrency?: string,
    secondaryRate?: number
  ) {
    super();

    this.query = new ProfitLossSheetQuery(query);
    this.reportData = data;
    this.i18n = i18n;
    this.baseCurrency = baseCurrency ?? '';
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private decorateNodeSecondary = (node: any): any => {
    if (!this.secondaryCurrency || !this.secondaryRate || node.total?.amount == null) {
      return node;
    }
    const converted = node.total.amount * this.secondaryRate;
    return {
      ...node,
      secondary: {
        formattedAmount: this.formatTotalNumber(converted, { currencyCode: this.secondaryCurrency }),
      },
    };
  };

  // ----------------------------------
  // # Rows
  // ----------------------------------
  /**
   * Retrieve the total column accessor.
   * @return {ITableColumnAccessor[]}
   */
  private totalColumnAccessor = (): ITableColumnAccessor[] => {
    const primaryAccessor = [{ key: 'total', accessor: 'total.formattedAmount' }];
    const secondaryAccessor =
      this.secondaryCurrency && this.secondaryRate
        ? [{ key: 'secondary_total', accessor: 'secondary.formattedAmount' }]
        : [];
    return R.pipe(
      R.when(
        this.query.isPreviousPeriodActive,
        R.concat(this.previousPeriodColumnAccessor())
      ),
      R.when(
        this.query.isPreviousYearActive,
        R.concat(this.previousYearColumnAccessor())
      ),
      R.concat(this.percentageColumnsAccessor()),
      R.concat(primaryAccessor),
      R.concat(secondaryAccessor)
    )([]);
  };

  /**
   * Common columns accessors.
   * @returns {ITableColumnAccessor}
   */
  private commonColumnsAccessors = (): ITableColumnAccessor[] => {
    return R.compose(
      R.concat([{ key: 'name', accessor: 'name' }]),
      R.ifElse(
        this.query.isDatePeriodsColumnsType,
        R.concat(this.datePeriodsColumnsAccessors()),
        R.concat(this.totalColumnAccessor())
      )
    )([]);
  };

  /**
   *
   * @param   {IProfitLossSheetAccountNode} node
   * @returns {ITableRow}
   */
  private accountNodeToTableRow = (
    node: IProfitLossSheetAccountNode
  ): ITableRow => {
    const columns = this.commonColumnsAccessors();
    const meta = {
      rowTypes: [ProfitLossSheetRowType.ACCOUNT],
      id: node.id,
    };
    return tableRowMapper(this.decorateNodeSecondary(node), columns, meta);
  };

  /**
   *
   * @param   {IProfitLossSheetAccountsNode} node
   * @returns {ITableRow}
   */
  private accountsNodeToTableRow = (
    node: IProfitLossSheetAccountsNode
  ): ITableRow => {
    const columns = this.commonColumnsAccessors();
    const meta = {
      rowTypes: [ProfitLossSheetRowType.ACCOUNTS],
      id: node.id,
    };
    return tableRowMapper(this.decorateNodeSecondary(node), columns, meta);
  };

  /**
   *
   * @param   {IProfitLossSheetEquationNode} node
   * @returns {ITableRow}
   */
  private equationNodeToTableRow = (
    node: IProfitLossSheetEquationNode
  ): ITableRow => {
    const columns = this.commonColumnsAccessors();

    const meta = {
      rowTypes: [ProfitLossSheetRowType.TOTAL],
      id: node.id,
    };
    return tableRowMapper(this.decorateNodeSecondary(node), columns, meta);
  };

  /**
   *
   * @param   {IProfitLossSheetNode} node
   * @returns {ITableRow}
   */
  private nodeToTableRowCompose = (node: IProfitLossSheetNode): ITableRow => {
    return R.cond([
      [
        this.isNodeType(ProfitLossNodeType.ACCOUNTS),
        this.accountsNodeToTableRow,
      ],
      [
        this.isNodeType(ProfitLossNodeType.EQUATION),
        this.equationNodeToTableRow,
      ],
      [this.isNodeType(ProfitLossNodeType.ACCOUNT), this.accountNodeToTableRow],
    ])(node);
  };

  /**
   *
   * @param   {IProfitLossSheetNode[]} nodes
   * @returns {ITableRow}
   */
  private nodesToTableRowsCompose = (
    nodes: IProfitLossSheetNode[]
  ): ITableRow[] => {
    return this.mapNodesDeep(nodes, this.nodeToTableRowCompose);
  };

  /**
   * Retrieves the table rows.
   * @returns {ITableRow[]}
   */
  public tableRows = (): ITableRow[] => {
    return R.compose(
      this.addTotalRows,
      this.nodesToTableRowsCompose
    )(this.reportData);
  };

  // ----------------------------------
  // # Columns.
  // ----------------------------------
  /**
   * Retrieve total column children columns.
   * @returns {ITableColumn[]}
   */
  private tableColumnChildren = (): ITableColumn[] => {
    return R.compose(
      R.unless(
        R.isEmpty,
        R.concat([
          { key: 'total', label: this.i18n.t('profit_loss_sheet.total') },
        ])
      ),
      R.concat(this.percentageColumns()),
      R.when(
        this.query.isPreviousYearActive,
        R.concat(this.getPreviousYearColumns())
      ),
      R.when(
        this.query.isPreviousPeriodActive,
        R.concat(this.getPreviousPeriodColumns())
      )
    )([]);
  };

  /**
   * Retrieves the total column.
   * @returns {ITableColumn[]}
   */
  private totalColumn = (): ITableColumn[] => {
    const label = this.baseCurrency
      ? `${this.i18n.t('profit_loss_sheet.total')} (${this.baseCurrency})`
      : this.i18n.t('profit_loss_sheet.total');
    const columns: ITableColumn[] = [
      {
        key: 'total',
        label,
        children: this.tableColumnChildren(),
      },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({
        key: 'secondary_total',
        label: `≈ ${this.secondaryCurrency} ${this.i18n.t('profit_loss_sheet.total')}`,
      });
    }
    return columns;
  };

  /**
   * Retrieves the table columns.
   * @returns {ITableColumn[]}
   */
  public tableColumns = (): ITableColumn[] => {
    const nameColumn = [
      { key: 'name', label: this.i18n.t('profit_loss_sheet.account_name') },
    ];
    const dataColumns = this.query.isDatePeriodsColumnsType()
      ? this.datePeriodsColumns()
      : this.totalColumn();

    return this.tableColumnsCellIndexing(
      R.concat(nameColumn, dataColumns),
    );
  };
}
