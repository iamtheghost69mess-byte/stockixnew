import { IBill } from '@/interfaces';
import { Transformer } from '@/lib/Transformer/Transformer';
import { formatNumber } from 'utils';

export class PurchaseInvoiceTransformer extends Transformer {
  /**
   * Include these attributes to sale invoice object.
   * @returns {Array}
   */
  public includeAttributes = (): string[] => {
    return [
      'formattedBillDate',
      'formattedDueDate',
      'formattedAmount',
      'formattedLocalAmount',
      'formattedPaymentAmount',
      'formattedBalance',
      'formattedDueAmount',
      'formattedLocalDueAmount',
      'formattedExchangeRate',
    ];
  };

  /**
   * Retrieve formatted invoice date.
   * @param {IBill} invoice
   * @returns {String}
   */
  protected formattedBillDate = (bill: IBill): string => {
    return this.formatDate(bill.billDate);
  };

  /**
   * Retrieve formatted invoice date.
   * @param {IBill} invoice
   * @returns {String}
   */
  protected formattedDueDate = (bill: IBill): string => {
    return this.formatDate(bill.dueDate);
  };

  /**
   * Retrieve formatted bill amount.
   * @param {IBill} invoice
   * @returns {string}
   */
  protected formattedAmount = (bill): string => {
    return formatNumber(bill.amount, { currencyCode: bill.currencyCode });
  };

  /**
   * Retrieve formatted bill amount.
   * @param {IBill} invoice
   * @returns {string}
   */
  protected formattedPaymentAmount = (bill): string => {
    return formatNumber(bill.paymentAmount, {
      currencyCode: bill.currencyCode,
    });
  };

  /**
   * Retrieve formatted bill amount.
   * @param {IBill} invoice
   * @returns {string}
   */
  protected formattedDueAmount = (bill): string => {
    return formatNumber(bill.dueAmount, { currencyCode: bill.currencyCode });
  };

  /**
   * Retrieve formatted bill local amount.
   * @param {IBill} bill
   * @returns {string}
   */
  protected formattedLocalAmount = (bill): string => {
    return this.formatMoney(bill.localAmount);
  };

  /**
   * Retrieve formatted bill local due amount.
   * @param {IBill} bill
   * @returns {string}
   */
  protected formattedLocalDueAmount = (bill): string => {
    return this.formatMoney(bill.localDueAmount);
  };

  /**
   * Retrieve formatted bill balance.
   * @param {IBill} bill
   * @returns {string}
   */
  protected formattedBalance = (bill): string => {
    return formatNumber(bill.balance, { currencyCode: bill.currencyCode });
  };

  /**
   * Retrieve the formatted exchange rate.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedExchangeRate = (invoice): string => {
    return formatNumber(invoice.exchangeRate, { money: false });
  };
}
