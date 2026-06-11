import { Inject, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { omit } from 'lodash';
import * as R from 'ramda';
import { IBillLandedCostTransaction } from '@/interfaces';
import { formatNumber } from 'utils';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { Bill } from '@/modules/Bills/models/Bill';
import { BillLandedCost } from '../models/BillLandedCost';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';

@Injectable()
export class BillAllocatedLandedCostTransactions {
  constructor(
    @Inject(Bill.name)
    private readonly billModel: TenantModelProxy<typeof Bill>,

    @Inject(BillLandedCost.name)
    private readonly billLandedCostModel: TenantModelProxy<typeof BillLandedCost>,

    private readonly tenancyContext: TenancyContext,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Retrieve the bill associated landed cost transactions.
   */
  public getBillLandedCostTransactions = async (
    billId: number,
  ): Promise<IBillLandedCostTransaction[]> => {
    await this.billModel().query().findById(billId).throwIfNotFound();

    const landedCostTransactions = await this.billLandedCostModel()
      .query()
      .where('bill_id', billId)
      .withGraphFetched('allocateEntries')
      .withGraphFetched('allocatedFromBillEntry.item')
      .withGraphFetched('allocatedFromExpenseEntry.expenseAccount')
      .withGraphFetched('bill');

    const tenantMeta = await this.tenancyContext.getTenantMetadata();
    const lang = tenantMeta?.language ?? 'en';

    const transactionsJson = landedCostTransactions.map((row) => {
      const json = row.toJSON();
      const formatted = json.allocationMethodFormatted;
      return {
        ...json,
        allocationMethodFormatted:
          (formatted
            ? this.i18n.translate(String(formatted), { lang })
            : formatted) || formatted,
      };
    });

    return this.transformBillLandedCostTransactions(
      transactionsJson as unknown as IBillLandedCostTransaction[],
      tenantMeta?.baseCurrency ?? '',
    ) as IBillLandedCostTransaction[];
  };

  private transformBillLandedCostTransactions = (
    landedCostTransactions: IBillLandedCostTransaction[],
    baseCurrency: string,
  ) => {
    return landedCostTransactions.map((t) =>
      this.transformBillLandedCostTransaction(t, baseCurrency),
    );
  };

  private transformBillLandedCostTransaction = (
    transaction: IBillLandedCostTransaction,
    baseCurrency: string,
  ) => {
    const getTransactionName = R.curry(this.condBillLandedTransactionName)(
      transaction.fromTransactionType,
    );
    const getTransactionDesc = R.curry(
      this.condBillLandedTransactionDescription,
    )(transaction.fromTransactionType);

    return {
      formattedAmount: formatNumber(transaction.amount, {
        currencyCode: transaction.currencyCode,
      }),
      ...omit(transaction, [
        'allocatedFromBillEntry',
        'allocatedFromExpenseEntry',
      ]),
      name: getTransactionName(transaction),
      description: getTransactionDesc(transaction),
      formattedLocalAmount: formatNumber(transaction.localAmount, {
        currencyCode: baseCurrency,
      }),
    };
  };

  private condBillLandedTransactionName = (
    transactionType: string,
    transaction,
  ) => {
    return R.cond([
      [
        R.always(R.equals(transactionType, 'Bill')),
        this.getLandedBillTransactionName,
      ],
      [
        R.always(R.equals(transactionType, 'Expense')),
        this.getLandedExpenseTransactionName,
      ],
    ])(transaction);
  };

  private getLandedBillTransactionName = (transaction): string => {
    return transaction.allocatedFromBillEntry.item.name;
  };

  private getLandedExpenseTransactionName = (transaction): string => {
    return transaction.allocatedFromExpenseEntry.expenseAccount.name;
  };

  private getLandedBillTransactionDescription = (transaction): string => {
    return transaction.allocatedFromBillEntry.description;
  };

  private getLandedExpenseTransactionDescription = (transaction): string => {
    return transaction.allocatedFromExpenseEntry.description;
  };

  private condBillLandedTransactionDescription = (
    tranasctionType: string,
    transaction,
  ) => {
    return R.cond([
      [
        R.always(R.equals(tranasctionType, 'Bill')),
        this.getLandedBillTransactionDescription,
      ],
      [
        R.always(R.equals(tranasctionType, 'Expense')),
        this.getLandedExpenseTransactionDescription,
      ],
    ])(transaction);
  };
}
