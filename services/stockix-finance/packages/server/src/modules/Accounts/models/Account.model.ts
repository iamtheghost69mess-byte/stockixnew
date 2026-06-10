/* eslint-disable global-require */
import { Model } from 'objection';
import { castArray } from 'lodash';
import { buildFilterQuery, buildSortColumnQuery } from '@/lib/ViewRolesBuilder';
import { flatToNestedArray } from 'utils';
import DependencyGraph from '@/lib/DependencyGraph';
import AccountTypesUtils from '@/lib/AccountTypes';
import {
  ACCOUNT_TYPES,
  getAccountsSupportsMultiCurrency,
} from '@/data/AccountTypes';
import { TenantBaseModel } from '@/modules/System/models/TenantBaseModel';
import { InjectModelMeta } from '@/modules/Tenancy/TenancyModels/decorators/InjectModelMeta.decorator';
import { InjectModelDefaultViews } from '@/modules/Views/decorators/InjectModelDefaultViews.decorator';
import { ExportableModel } from '@/modules/Export/decorators/ExportableModel.decorator';
import { DEFAULT_VIEWS } from '@/constants/Accounts/constants';
import { AccountMeta } from './Account.meta';
import { PlaidItem } from '@/modules/BankingPlaid/models/PlaidItem';
import { AccountTransaction } from '@/modules/Accounts/models/AccountTransaction.model';
import { Item } from '@/modules/Items/models/Item';
import { InventoryAdjustment } from '@/modules/InventoryAdjutments/models/InventoryAdjustment';
import { ManualJournalEntry } from '@/modules/ManualJournals/models/ManualJournalEntry';
import { Expense } from '@/modules/Expenses/models/Expense.model';
import { ExpenseCategory } from '@/modules/Expenses/models/ExpenseCategory.model';
import { ItemEntry } from '@/modules/TransactionItemEntry/models/ItemEntry';

@ExportableModel()
@InjectModelMeta(AccountMeta)
@InjectModelDefaultViews(DEFAULT_VIEWS)
export class Account extends TenantBaseModel {
  id: number;
  name: string;
  code: string;
  accountType: string;
  parentAccountId?: number;
  active: boolean;
  seededAt?: Date | null;
  currencyCode?: string;
  amount?: number;
  bankBalance?: number;
  lastFeedsUpdatedAt?: Date | string | null;
  plaidItemId?: string | null;
  plaidAccountId?: string | null;
  isFeedsActive?: boolean;
  isSyncingOwner?: boolean;
  slug?: string;
  plaidItem?: PlaidItem;

  /**
   * Table name.
   */
  static get tableName() {
    return 'accounts';
  }

  /**
   * Timestamps columns.
   */
  static get timestamps() {
    return ['createdAt', 'updatedAt'];
  }

  /**
   * Virtual attributes.
   */
  static get virtualAttributes() {
    return [
      'accountTypeLabel',
      'accountParentType',
      'accountRootType',
      'accountNormal',
      'accountNormalFormatted',
      'isBalanceSheetAccount',
      'isPLSheet',
    ];
  }

  /**
   * Account normal.
   */
  get accountNormal() {
    return AccountTypesUtils.getType(this.accountType, 'normal');
  }

  get accountNormalFormatted() {
    const paris = {
      credit: 'Credit',
      debit: 'Debit',
    };
    return paris[this.accountNormal] || '';
  }

  /**
   * Retrieve account type label.
   */
  get accountTypeLabel() {
    return AccountTypesUtils.getType(this.accountType, 'label');
  }

  /**
   * Retrieve account parent type.
   */
  get accountParentType() {
    return AccountTypesUtils.getType(this.accountType, 'parentType');
  }

  /**
   * Retrieve account root type.
   */
  get accountRootType() {
    return AccountTypesUtils.getType(this.accountType, 'rootType');
  }

  /**
   * Retrieve whether the account is balance sheet account.
   */
  get isBalanceSheetAccount() {
    return this.isBalanceSheet();
  }

  /**
   * Retrieve whether the account is profit/loss sheet account.
   */
  get isPLSheet() {
    return this.isProfitLossSheet();
  }
  /**
   * Allows to mark model as resourceable to viewable and filterable.
   */
  static get resourceable() {
    return true;
  }

  /**
   * Model modifiers.
   */
  static get modifiers() {
    const TABLE_NAME = Account.tableName;

    return {
      /**
       * Inactive/Active mode.
       */
      inactiveMode(query, active = false) {
        query.where('accounts.active', !active);
      },

      filterAccounts(query, accountIds) {
        if (accountIds.length > 0) {
          query.whereIn(`${TABLE_NAME}.id`, accountIds);
        }
      },
      filterAccountTypes(query, typesIds) {
        if (typesIds.length > 0) {
          query.whereIn('account_types.accoun_type_id', typesIds);
        }
      },
      viewRolesBuilder(query, conditionals, expression) {
        buildFilterQuery(Account as any, conditionals, expression)(query);
      },
      sortColumnBuilder(query, columnKey, direction) {
        buildSortColumnQuery(Account as any, columnKey, direction)(query);
      },

      /**
       * Filter by root type.
       */
      filterByRootType(query, rootType) {
        const filterTypes = ACCOUNT_TYPES.filter(
          (accountType) => accountType.rootType === rootType
        ).map((accountType) => accountType.key);

        query.whereIn('account_type', filterTypes);
      },

      /**
       * Filter by account normal
       */
      filterByAccountNormal(query, accountNormal) {
        const filterTypes = ACCOUNT_TYPES.filter(
          (accountType) => accountType.normal === accountNormal
        ).map((accountType) => accountType.key);

        query.whereIn('account_type', filterTypes);
      },

      /**
       * Finds account by the given slug.
       * @param {*} query
       * @param {*} slug
       */
      findBySlug(query, slug) {
        query.where('slug', slug).first();
      },

      /**
       *
       * @param {*} query
       * @param {*} baseCyrrency
       */
      preventMutateBaseCurrency(query) {
        const accountsTypes = getAccountsSupportsMultiCurrency();
        const accountsTypesKeys = accountsTypes.map((type) => type.key);

        query
          .whereIn('accountType', accountsTypesKeys)
          .where('seededAt', null)
          .first();
      },
    };
  }

  /**
   * Relationship mapping.
   */
  static get relationMappings() {
    return {
      /**
       * Account model may has many transactions.
       */
      transactions: {
        relation: Model.HasManyRelation,
        modelClass: AccountTransaction,
        join: {
          from: 'accounts.id',
          to: 'accounts_transactions.accountId',
        },
      },

      /**
       *
       */
      itemsCostAccount: {
        relation: Model.HasManyRelation,
        modelClass: Item,
        join: {
          from: 'accounts.id',
          to: 'items.costAccountId',
        },
      },

      /**
       *
       */
      itemsSellAccount: {
        relation: Model.HasManyRelation,
        modelClass: Item,
        join: {
          from: 'accounts.id',
          to: 'items.sellAccountId',
        },
      },

      /**
       *
       */
      inventoryAdjustments: {
        relation: Model.HasManyRelation,
        modelClass: InventoryAdjustment,
        join: {
          from: 'accounts.id',
          to: 'inventory_adjustments.adjustmentAccountId',
        },
      },

      /**
       *
       */
      manualJournalEntries: {
        relation: Model.HasManyRelation,
        modelClass: ManualJournalEntry,
        join: {
          from: 'accounts.id',
          to: 'manual_journals_entries.accountId',
        },
      },

      /**
       *
       */
      expensePayments: {
        relation: Model.HasManyRelation,
        modelClass: Expense,
        join: {
          from: 'accounts.id',
          to: 'expenses_transactions.paymentAccountId',
        },
      },

      /**
       *
       */
      expenseEntries: {
        relation: Model.HasManyRelation,
        modelClass: ExpenseCategory,
        join: {
          from: 'accounts.id',
          to: 'expense_transaction_categories.expenseAccountId',
        },
      },

      /**
       *
       */
      entriesCostAccount: {
        relation: Model.HasManyRelation,
        modelClass: ItemEntry,
        join: {
          from: 'accounts.id',
          to: 'items_entries.costAccountId',
        },
      },

      /**
       *
       */
      entriesSellAccount: {
        relation: Model.HasManyRelation,
        modelClass: ItemEntry,
        join: {
          from: 'accounts.id',
          to: 'items_entries.sellAccountId',
        },
      },
    };
  }

  /**
   * Detarmines whether the given type equals the account type.
   * @param {string} accountType
   * @return {boolean}
   */
  isAccountType(accountType) {
    const types = castArray(accountType);
    return types.indexOf(this.accountType) !== -1;
  }

  /**
   * Detarmines whether the given root type equals the account type.
   * @param {string} rootType
   * @return {boolean}
   */
  isRootType(rootType) {
    return AccountTypesUtils.isRootTypeEqualsKey(this.accountType, rootType);
  }

  /**
   * Detarmine whether the given parent type equals the account type.
   * @param {string} parentType
   * @return {boolean}
   */
  isParentType(parentType) {
    return AccountTypesUtils.isParentTypeEqualsKey(
      this.accountType,
      parentType
    );
  }

  /**
   * Detarmines whether the account is balance sheet account.
   * @return {boolean}
   */
  isBalanceSheet() {
    return AccountTypesUtils.isTypeBalanceSheet(this.accountType);
  }

  /**
   * Detarmines whether the account is profit/loss account.
   * @return {boolean}
   */
  isProfitLossSheet() {
    return AccountTypesUtils.isTypePLSheet(this.accountType);
  }

  /**
   * Detarmines whether the account is income statement account
   * @return {boolean}
   */
  isIncomeSheet() {
    return this.isProfitLossSheet();
  }

  /**
   * Converts flatten accounts list to nested array.
   * @param {Array} accounts
   * @param {Object} options
   */
  static toNestedArray(accounts, options = { children: 'children' }) {
    return flatToNestedArray(accounts, {
      id: 'id',
      parentId: 'parentAccountId',
    });
  }

  /**
   * Transformes the accounts list to depenedency graph structure.
   * @param {IAccount[]} accounts
   */
  static toDependencyGraph(accounts) {
    return DependencyGraph.fromArray(accounts, {
      itemId: 'id',
      parentItemId: 'parentAccountId',
    });
  }

  /**
   * Model search roles.
   */
  static get searchRoles() {
    return [
      { condition: 'or', fieldKey: 'name', comparator: 'contains' },
      { condition: 'or', fieldKey: 'code', comparator: 'like' },
    ];
  }

  /**
   * Prevents mutate base currency since the model is not empty.
   */
  static get preventMutateBaseCurrency() {
    return true;
  }
}
