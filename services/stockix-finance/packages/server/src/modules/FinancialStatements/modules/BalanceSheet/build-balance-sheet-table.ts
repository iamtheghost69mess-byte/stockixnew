import * as R from 'ramda';
import {
  IBalanceSheetStatementData,
  ITableColumnAccessor,
  IBalanceSheetQuery,
  ITableColumn,
  ITableRow,
  BALANCE_SHEET_SCHEMA_NODE_TYPE,
  IBalanceSheetDataNode,
  IBalanceSheetSchemaNode,
} from '@/interfaces';
import { tableRowMapper } from 'utils';
import FinancialSheet from '../../common/FinancialSheet';
import { BalanceSheetComparsionPreviousYear } from './BalanceSheetComparsionPreviousYear';
import { IROW_TYPE, DISPLAY_COLUMNS_BY } from './constants';
import { BalanceSheetComparsionPreviousPeriod } from './BalanceSheetComparsionPreviousPeriod';
import { BalanceSheetPercentage } from './BalanceSheetPercentage';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { BalanceSheetBase } from './BalanceSheetBase';
import { BalanceSheetTablePercentage } from './BalanceSheetTablePercentage';
import { BalanceSheetTablePreviousYear } from './BalanceSheetTablePreviousYear';
import { BalanceSheetTablePreviousPeriod } from './BalanceSheetTablePreviousPeriod';
import { FinancialTable } from '../../common/FinancialTable';
import { BalanceSheetQuery } from './BalanceSheetQuery';
import { BalanceSheetTableDatePeriods } from './BalanceSheetTableDatePeriods';

type BalanceSheetTableInstance = {
  tableRows: () => ITableRow[];
  tableColumns: () => ITableColumn[];
};

type BalanceSheetTableCtor = new (
  reportData: IBalanceSheetStatementData,
  query: IBalanceSheetQuery,
  i18n: any,
  baseCurrency?: string,
  secondaryCurrency?: string,
  secondaryRate?: number,
) => BalanceSheetTableInstance;

let balanceSheetTableClass: BalanceSheetTableCtor | null = null;

export function getBalanceSheetTableClass(): BalanceSheetTableCtor {
  if (!balanceSheetTableClass) {
    balanceSheetTableClass = class BalanceSheetTable extends R.compose(
      BalanceSheetTablePreviousPeriod,
      BalanceSheetTablePreviousYear,
      BalanceSheetTableDatePeriods,
      BalanceSheetTablePercentage,
      BalanceSheetComparsionPreviousYear,
      BalanceSheetComparsionPreviousPeriod,
      BalanceSheetPercentage,
      FinancialSheetStructure,
      FinancialTable,
      BalanceSheetBase,
    )(FinancialSheet) {
      reportData: IBalanceSheetStatementData;
      query: BalanceSheetQuery;
      private baseCurrency: string;
      private secondaryCurrency: string;
      private secondaryRate: number;

      constructor(
        reportData: IBalanceSheetStatementData,
        query: IBalanceSheetQuery,
        i18n: any,
        baseCurrency?: string,
        secondaryCurrency?: string,
        secondaryRate?: number,
      ) {
        super();

        this.reportData = reportData;
        this.query = new BalanceSheetQuery(query);
        this.i18n = i18n;
        this.baseCurrency = baseCurrency ?? '';
        this.secondaryCurrency = secondaryCurrency ?? '';
        this.secondaryRate = secondaryRate ?? 0;
      }

      private decorateNodeSecondary = (node: any): any => {
        if (
          !this.secondaryCurrency ||
          !this.secondaryRate ||
          node.total?.amount == null
        ) {
          return node;
        }
        const converted = node.total.amount * this.secondaryRate;
        return {
          ...node,
          secondary: {
            formattedAmount: this.formatTotalNumber(converted, {
              currencyCode: this.secondaryCurrency,
            }),
          },
        };
      };

      protected isNodeType = R.curry(
        (type: string, node: IBalanceSheetSchemaNode): boolean => {
          return node.nodeType === type;
        },
      );

      private commonColumnsAccessors = (): ITableColumnAccessor[] => {
        return R.compose(
          R.concat([{ key: 'name', accessor: 'name' }]),
          R.ifElse(
            R.always(this.isDisplayColumnsBy(DISPLAY_COLUMNS_BY.DATE_PERIODS)),
            R.concat(this.datePeriodsColumnsAccessors()),
            R.concat(this.totalColumnAccessor()),
          ),
        )([]);
      };

      private totalColumnAccessor = (): ITableColumnAccessor[] => {
        const primaryAccessor = [
          { key: 'total', accessor: 'total.formattedAmount' },
        ];
        const secondaryAccessor =
          this.secondaryCurrency && this.secondaryRate
            ? [{ key: 'secondary_total', accessor: 'secondary.formattedAmount' }]
            : [];
        return R.pipe(
          R.concat(this.previousPeriodColumnAccessor()),
          R.concat(this.previousYearColumnAccessor()),
          R.concat(this.percentageColumnsAccessor()),
          R.concat(primaryAccessor),
          R.concat(secondaryAccessor),
        )([]);
      };

      private aggregateNodeTableRowsMapper = (node): ITableRow => {
        const columns = this.commonColumnsAccessors();
        const meta = {
          rowTypes: [IROW_TYPE.AGGREGATE],
          id: node.id,
        };
        return tableRowMapper(this.decorateNodeSecondary(node), columns, meta);
      };

      private accountsNodeTableRowsMapper = (node): ITableRow => {
        const columns = this.commonColumnsAccessors();
        const meta = {
          rowTypes: [IROW_TYPE.ACCOUNTS],
          id: node.id,
        };
        return tableRowMapper(this.decorateNodeSecondary(node), columns, meta);
      };

      private accountNodeTableRowsMapper = (node): ITableRow => {
        const columns = this.commonColumnsAccessors();

        const meta = {
          rowTypes: [IROW_TYPE.ACCOUNT],
          id: node.id,
        };
        return tableRowMapper(this.decorateNodeSecondary(node), columns, meta);
      };

      private nodeToTableRowsMapper = (node: IBalanceSheetDataNode): ITableRow => {
        return R.cond([
          [
            this.isNodeType(BALANCE_SHEET_SCHEMA_NODE_TYPE.AGGREGATE),
            this.aggregateNodeTableRowsMapper,
          ],
          [
            this.isNodeType(BALANCE_SHEET_SCHEMA_NODE_TYPE.ACCOUNTS),
            this.accountsNodeTableRowsMapper,
          ],
          [
            this.isNodeType(BALANCE_SHEET_SCHEMA_NODE_TYPE.ACCOUNT),
            this.accountNodeTableRowsMapper,
          ],
        ])(node);
      };

      private nodesToTableRowsMapper = (
        nodes: IBalanceSheetDataNode[],
      ): ITableRow[] => {
        return this.mapNodesDeep(nodes, this.nodeToTableRowsMapper);
      };

      private totalColumnChildren = (): ITableColumn[] => {
        return R.compose(
          R.unless(
            R.isEmpty,
            R.concat([
              { key: 'total', Label: this.i18n.__('balance_sheet.total') },
            ]),
          ),
          R.concat(this.percentageColumns()),
          R.concat(this.getPreviousYearColumns()),
          R.concat(this.previousPeriodColumns()),
        )([]);
      };

      private totalColumn = (): ITableColumn[] => {
        const label = this.baseCurrency
          ? `${this.i18n.__('balance_sheet.total')} (${this.baseCurrency})`
          : this.i18n.__('balance_sheet.total');
        const columns: ITableColumn[] = [
          {
            key: 'total',
            label,
            children: this.totalColumnChildren(),
          },
        ];
        if (this.secondaryCurrency && this.secondaryRate) {
          columns.push({
            key: 'secondary_total',
            label: `≈ ${this.secondaryCurrency} ${this.i18n.__('balance_sheet.total')}`,
          });
        }
        return columns;
      };

      public tableRows = (): ITableRow[] => {
        return R.compose(
          this.addTotalRows,
          this.nodesToTableRowsMapper,
        )(this.reportData);
      };

      public tableColumns = (): ITableColumn[] => {
        return R.compose(
          this.tableColumnsCellIndexing,
          R.concat([
            { key: 'name', label: this.i18n.__('balance_sheet.account_name') },
          ]),
          R.ifElse(
            this.query.isDatePeriodsColumnsType,
            R.concat(this.datePeriodsColumns()),
            R.concat(this.totalColumn()),
          ),
        )([]);
      };
    };
  }

  return balanceSheetTableClass;
}

export function buildBalanceSheetTable(
  reportData: IBalanceSheetStatementData,
  query: IBalanceSheetQuery,
  i18n: any,
  baseCurrency?: string,
  secondaryCurrency?: string,
  secondaryRate?: number,
): { columns: ITableColumn[]; rows: ITableRow[] } {
  const BalanceSheetTable = getBalanceSheetTableClass();
  const table = new BalanceSheetTable(
    reportData,
    query,
    i18n,
    baseCurrency,
    secondaryCurrency,
    secondaryRate,
  );

  return {
    columns: table.tableColumns(),
    rows: table.tableRows(),
  };
}
