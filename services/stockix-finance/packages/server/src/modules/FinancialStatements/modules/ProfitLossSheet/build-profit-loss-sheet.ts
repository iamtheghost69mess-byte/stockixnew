// @ts-nocheck
import * as R from 'ramda';
import { ModelObject } from 'objection';
import { I18nService } from 'nestjs-i18n';
import {
  ProfitLossNodeType,
  IProfitLossSheetEquationNode,
  IProfitLossEquationSchemaNode,
  IProfitLossSheetAccountsNode,
  IProfitLossAccountsSchemaNode,
  IProfitLossSchemaNode,
  IProfitLossSheetNode,
  IProfitLossSheetAccountNode,
  IProfitLossSheetQuery,
} from './ProfitLossSheet.types';
import { ProfitLossShema } from './ProfitLossSchema';
import { ProfitLossSheetPercentage } from './ProfitLossSheetPercentage';
import { ProfitLossSheetQuery } from './ProfitLossSheetQuery';
import { ProfitLossSheetRepository } from './ProfitLossSheetRepository';
import { ProfitLossSheetBase } from './ProfitLossSheetBase';
import { ProfitLossSheetDatePeriods } from './ProfitLossSheetDatePeriods';
import { ProfitLossSheetPreviousYear } from './ProfitLossSheetPreviousYear';
import { ProfitLossSheetPreviousPeriod } from './ProfitLossSheetPreviousPeriod';
import { ProfitLossSheetFilter } from './ProfitLossSheetFilter';
import { FinancialDateRanges } from '../../common/FinancialDateRanges';
import { FinancialEvaluateEquation } from '../../common/FinancialEvaluateEquation';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { FinancialSheet } from '../../common/FinancialSheet';
import { Account } from '@/modules/Accounts/models/Account.model';
import { flatToNestedArray } from '@/utils/flat-to-nested-array';
import {
  IFinancialReportMeta,
  DEFAULT_REPORT_META,
} from '../../types/Report.types';

type ProfitLossSheetCtor = new (
  repository: ProfitLossSheetRepository,
  query: IProfitLossSheetQuery,
  i18n: I18nService,
  meta: IFinancialReportMeta,
) => { reportData: () => IProfitLossSheetNode[] };

let profitLossSheetClass: ProfitLossSheetCtor | null = null;

function getProfitLossSheetClass(): ProfitLossSheetCtor {
  if (!profitLossSheetClass) {
    profitLossSheetClass = class ProfitLossSheet extends R.pipe(
      ProfitLossSheetPreviousYear,
      ProfitLossSheetPreviousPeriod,
      ProfitLossSheetPercentage,
      ProfitLossSheetDatePeriods,
      ProfitLossSheetFilter,
      ProfitLossShema,
      ProfitLossSheetBase,
      FinancialDateRanges,
      FinancialEvaluateEquation,
      FinancialSheetStructure,
    )(FinancialSheet) {
      readonly query: ProfitLossSheetQuery;
      readonly comparatorDateType: string;
      readonly baseCurrency: string;
      readonly repository: ProfitLossSheetRepository;
      readonly i18n: I18nService;

      constructor(
        repository: ProfitLossSheetRepository,
        query: IProfitLossSheetQuery,
        i18n: I18nService,
        meta: IFinancialReportMeta,
      ) {
        super();

        this.query = new ProfitLossSheetQuery(query);
        this.repository = repository;
        this.baseCurrency = meta.baseCurrency;
        this.numberFormat = this.query.query.numberFormat;
        this.dateFormat = meta.dateFormat || DEFAULT_REPORT_META.dateFormat;
        this.i18n = i18n;
      }

      private accountNodeMapper = (
        account: ModelObject<Account>,
      ): IProfitLossSheetAccountNode => {
        const childrenAccountIds = this.repository.accountsGraph.dependenciesOf(
          account.id,
        );
        const accountIds = R.uniq(R.append(account.id, childrenAccountIds));

        const total = this.repository.totalAccountsLedger
          .whereAccountsIds(accountIds)
          .getClosingBalance();

        return {
          id: account.id,
          name: account.name,
          nodeType: ProfitLossNodeType.ACCOUNT,
          total: this.getAmountMeta(total),
        };
      };

      private accountNodeCompose = (
        account: ModelObject<Account>,
      ): IProfitLossSheetAccountNode => {
        return R.compose(
          R.when(
            this.query.isPreviousPeriodActive,
            this.previousPeriodAccountNodeCompose,
          ),
          R.when(
            this.query.isPreviousYearActive,
            this.previousYearAccountNodeCompose,
          ),
          R.when(
            this.query.isDatePeriodsColumnsType,
            this.assocAccountNodeDatePeriod,
          ),
          this.accountNodeMapper,
        )(account);
      };

      private getAccountsNodesByTypes = (
        types: string[],
      ): IProfitLossSheetAccountNode[] => {
        const accounts = this.repository.getAccountsByType(types);
        const accountsTree = flatToNestedArray(accounts, {
          id: 'id',
          parentId: 'parentAccountId',
        });
        return this.mapNodesDeep(accountsTree, this.accountNodeCompose);
      };

      private accountsSchemaNodeMapper = (
        node: IProfitLossAccountsSchemaNode,
      ): IProfitLossSheetNode => {
        const children = this.getAccountsNodesByTypes(node.accountsTypes);
        const total = this.getTotalOfNodes(children);

        return {
          id: node.id,
          name: this.i18n.t(node.name),
          nodeType: ProfitLossNodeType.ACCOUNTS,
          total: this.getTotalAmountMeta(total),
          children,
        };
      };

      private accountsSchemaNodeCompose = (
        node: IProfitLossSchemaNode,
      ): IProfitLossSheetAccountsNode => {
        return R.compose(
          R.when(
            this.query.isPreviousPeriodActive,
            this.previousPeriodAggregateNodeCompose,
          ),
          R.when(
            this.query.isPreviousYearActive,
            this.previousYearAggregateNodeCompose,
          ),
          R.when(
            this.query.isDatePeriodsColumnsType,
            this.assocAggregateDatePeriod,
          ),
          this.accountsSchemaNodeMapper,
        )(node);
      };

      private equationSchemaNodeParser = R.curry(
        (
          accNodes: (IProfitLossSchemaNode | IProfitLossSheetNode)[],
          node: IProfitLossEquationSchemaNode,
        ): IProfitLossSheetEquationNode => {
          const tableNodes = this.getNodesTableForEvaluating(
            'total.amount',
            accNodes,
          );
          const total = this.evaluateEquation(node.equation, tableNodes);

          return {
            id: node.id,
            name: this.i18n.t(node.name),
            nodeType: ProfitLossNodeType.EQUATION,
            total: this.getTotalAmountMeta(total),
          };
        },
      );

      private equationSchemaNodeCompose = R.curry(
        (
          accNodes: (IProfitLossSchemaNode | IProfitLossSheetNode)[],
          node: IProfitLossEquationSchemaNode,
        ): IProfitLossSheetEquationNode => {
          return R.compose(
            R.when(
              this.query.isPreviousPeriodActive,
              this.previousPeriodEquationNodeCompose(accNodes, node.equation),
            ),
            R.when(
              this.query.isPreviousYearActive,
              this.previousYearEquationNodeCompose(accNodes, node.equation),
            ),
            R.when(
              this.query.isDatePeriodsColumnsType,
              this.assocEquationNodeDatePeriod(accNodes, node.equation),
            ),
            this.equationSchemaNodeParser(accNodes),
          )(node);
        },
      );

      private accountsSchemaNodeMap = (
        schemaNode: IProfitLossSchemaNode,
      ): IProfitLossSheetNode | IProfitLossSchemaNode => {
        return R.compose(
          R.when(
            this.isNodeType(ProfitLossNodeType.ACCOUNTS),
            this.accountsSchemaNodeCompose,
          ),
        )(schemaNode);
      };

      private reportSchemaEquationNodeCompose = (
        node: IProfitLossSheetNode | IProfitLossSchemaNode,
        key: number,
        parentValue: IProfitLossSheetNode | IProfitLossSchemaNode,
        accNodes: (IProfitLossSheetNode | IProfitLossSchemaNode)[],
        context,
      ): IProfitLossSheetEquationNode => {
        return R.compose(
          R.when(
            this.isNodeType(ProfitLossNodeType.EQUATION),
            this.equationSchemaNodeCompose(accNodes),
          ),
        )(node);
      };

      private reportSchemaAccountsNodesCompose = (
        schemaNodes: IProfitLossSchemaNode[],
      ): (IProfitLossSheetNode | IProfitLossSchemaNode)[] => {
        return this.mapNodesDeep(schemaNodes, this.accountsSchemaNodeMap);
      };

      private reportSchemaEquationNodesCompose = (
        nodes: (IProfitLossSheetNode | IProfitLossSchemaNode)[],
      ): (IProfitLossSheetNode | IProfitLossSchemaNode)[] => {
        return this.mapAccNodesDeep(nodes, this.reportSchemaEquationNodeCompose);
      };

      public reportData = (): Array<IProfitLossSheetNode> => {
        const schema = this.getSchema();

        return R.compose(
          this.reportFilterPlugin,
          this.reportRowsPercentageCompose,
          this.reportColumnsPerentageCompose,
          this.reportSchemaEquationNodesCompose,
          this.reportSchemaAccountsNodesCompose,
        )(schema);
      };
    };
  }

  return profitLossSheetClass;
}

export function buildProfitLossSheetReport(
  repository: ProfitLossSheetRepository,
  query: IProfitLossSheetQuery,
  i18n: I18nService,
  meta: IFinancialReportMeta,
): IProfitLossSheetNode[] {
  const ProfitLossSheet = getProfitLossSheetClass();
  const instance = new ProfitLossSheet(repository, query, i18n, meta);
  return instance.reportData();
}
