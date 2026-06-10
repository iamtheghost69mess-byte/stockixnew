import { Model, raw } from 'objection';
import { buildFilterQuery } from '@/lib/ViewRolesBuilder';
import moment from 'moment';
import { TenantBaseModel } from '@/modules/System/models/TenantBaseModel';
import { InjectModelMeta } from '@/modules/Tenancy/TenancyModels/decorators/InjectModelMeta.decorator';
import { InjectModelDefaultViews } from '@/modules/Views/decorators/InjectModelDefaultViews.decorator';
import { ExportableModel } from '@/modules/Export/decorators/ExportableModel.decorator';
import { DEFAULT_VIEWS } from '@/constants/Expenses/constants';
import { ExpenseMeta } from './Expense.meta';
import { Account } from '@/modules/Accounts/models/Account.model';
import { ExpenseCategory } from '@/modules/Expenses/models/ExpenseCategory.model';
import { Branch } from '@/modules/Branches/models/Branch.model';
import { Media } from '@/models/Media';
import { Document } from '@/modules/ChromiumlyTenancy/models/Document';

@ExportableModel()
@InjectModelMeta(ExpenseMeta)
@InjectModelDefaultViews(DEFAULT_VIEWS)
export class Expense extends TenantBaseModel {
  id: number;
  totalAmount: number;
  exchangeRate: number;
  currencyCode: string;
  date: Date | string;
  paymentDate: Date | string;
  paymentAccountId: number;
  referenceNo?: string;
  description?: string;
  publishedAt: Date | string | null;
  landedCostAmount: number;
  allocatedCostAmount: number;
  invoicedAmount: number;
  branchId?: number;
  userId: number;
  createdAt: Date;

  paymentAccount?: Account;
  categories?: ExpenseCategory[];
  attachments?: Document[];

  /**
   * Table name
   */
  static get tableName() {
    return 'expenses_transactions';
  }

  /**
   * Account transaction reference type.
   */
  static get referenceType() {
    return 'Expense';
  }

  /**
   * Model timestamps.
   */
  get timestamps() {
    return ['createdAt', 'updatedAt'];
  }

  /**
   * Virtual attributes.
   */
  static get virtualAttributes() {
    return [
      'isPublished',
      'unallocatedCostAmount',
      'localAmount',
      'localLandedCostAmount',
      'localUnallocatedCostAmount',
      'localAllocatedCostAmount',
      'billableAmount',
    ];
  }

  /**
   * Retrieves the local amount of expense.
   * @returns {number}
   */
  get localAmount() {
    return this.totalAmount / this.exchangeRate;
  }

  /**
   * Rertieves the local landed cost amount of expense.
   * @returns {number}
   */
  get localLandedCostAmount() {
    return this.landedCostAmount / this.exchangeRate;
  }

  /**
   * Retrieves the local allocated cost amount.
   * @returns {number}
   */
  get localAllocatedCostAmount() {
    return this.allocatedCostAmount / this.exchangeRate;
  }

  /**
   * Retrieve the unallocated cost amount.
   * @return {number}
   */
  get unallocatedCostAmount() {
    return Math.max(this.totalAmount - this.allocatedCostAmount, 0);
  }

  /**
   * Retrieves the local unallocated cost amount.
   * @returns {number}
   */
  get localUnallocatedCostAmount() {
    return this.unallocatedCostAmount / this.exchangeRate;
  }

  /**
   * Detarmines whether the expense is published.
   * @returns {boolean}
   */
  get isPublished() {
    return Boolean(this.publishedAt);
  }

  /**
   * Retrieves the calculated amount which have not been invoiced.
   */
  get billableAmount() {
    return Math.max(this.totalAmount - this.invoicedAmount, 0);
  }

  /**
   * Model modifiers.
   */
  static get modifiers() {
    return {
      filterByDateRange(query, startDate, endDate) {
        if (startDate) {
          query.where('date', '>=', startDate);
        }
        if (endDate) {
          query.where('date', '<=', endDate);
        }
      },
      filterByAmountRange(query, from, to) {
        if (from) {
          query.where('amount', '>=', from);
        }
        if (to) {
          query.where('amount', '<=', to);
        }
      },
      filterByExpenseAccount(query, accountId) {
        if (accountId) {
          query.where('expense_account_id', accountId);
        }
      },
      filterByPaymentAccount(query, accountId) {
        if (accountId) {
          query.where('payment_account_id', accountId);
        }
      },
      viewRolesBuilder(query, conditionals, expression) {
        buildFilterQuery(Expense, conditionals, expression)(query);
      },

      filterByDraft(query) {
        query.where('published_at', null);
      },

      filterByPublished(query) {
        query.whereNot('published_at', null);
      },

      filterByStatus(query, status) {
        switch (status) {
          case 'draft':
            query.modify('filterByDraft');
            break;
          case 'published':
          default:
            query.modify('filterByPublished');
            break;
        }
      },

      publish(query) {
        query.update({
          publishedAt: moment().toMySqlDateTime(),
        });
      },

      /**
       * Filters the expenses have billable amount.
       */
      billable(query) {
        query.where(raw('AMOUNT > INVOICED_AMOUNT'));
      },
    };
  }

  /**
   * Relationship mapping.
   */
  static get relationMappings() {
    return {
      paymentAccount: {
        relation: Model.BelongsToOneRelation,
        modelClass: Account,
        join: {
          from: 'expenses_transactions.paymentAccountId',
          to: 'accounts.id',
        },
      },
      categories: {
        relation: Model.HasManyRelation,
        modelClass: ExpenseCategory,
        join: {
          from: 'expenses_transactions.id',
          to: 'expense_transaction_categories.expenseId',
        },
        filter: (query) => {
          query.orderBy('index', 'ASC');
        },
      },

      /**
       * Expense transction may belongs to a branch.
       */
      branch: {
        relation: Model.BelongsToOneRelation,
        modelClass: Branch,
        join: {
          from: 'expenses_transactions.branchId',
          to: 'branches.id',
        },
      },
      media: {
        relation: Model.ManyToManyRelation,
        modelClass: Media,
        join: {
          from: 'expenses_transactions.id',
          through: {
            from: 'media_links.model_id',
            to: 'media_links.media_id',
          },
          to: 'media.id',
        },
        filter(query) {
          query.where('model_name', 'Expense');
        },
      },
    };
  }

  /**
   * Model search attributes.
   */
  static get searchRoles() {
    return [
      { fieldKey: 'reference_no', comparator: 'contains' },
      { condition: 'or', fieldKey: 'amount', comparator: 'equals' },
    ];
  }

  /**
   * Prevents mutate base currency since the model is not empty.
   */
  static get preventMutateBaseCurrency() {
    return true;
  }
}
