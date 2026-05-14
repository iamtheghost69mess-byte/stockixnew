import { Transformer } from '@/lib/Transformer/Transformer';
import { formatNumber } from 'utils';

export class SaleInvoiceTransformer extends Transformer {
  /**
   * Include these attributes to sale invoice object.
   * @returns {Array}
   */
  public includeAttributes = (): string[] => {
    return [
      'formattedInvoiceDate',
      'formattedDueDate',
      'formattedAmount',
      'formattedLocalAmount',
      'formattedDueAmount',
      'formattedLocalDueAmount',
      'formattedPaymentAmount',
      'formattedBalanceAmount',
      'formattedExchangeRate',
    ];
  };

  /**
   * Retrieve formatted invoice date.
   * @param {ISaleInvoice} invoice
   * @returns {String}
   */
  protected formattedInvoiceDate = (invoice): string => {
    return this.formatDate(invoice.invoiceDate);
  };

  /**
   * Retrieve formatted due date.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedDueDate = (invoice): string => {
    return this.formatDate(invoice.dueDate);
  };

  /**
   * Retrieve formatted invoice amount.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedAmount = (invoice): string => {
    return formatNumber(invoice.balance, {
      currencyCode: invoice.currencyCode,
    });
  };

  /**
   * Retrieve formatted invoice due amount.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedDueAmount = (invoice): string => {
    return formatNumber(invoice.dueAmount, {
      currencyCode: invoice.currencyCode,
    });
  };

  /**
   * Retrieve formatted invoice local amount.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedLocalAmount = (invoice): string => {
    return this.formatMoney(invoice.localAmount);
  };

  /**
   * Retrieve formatted invoice local due amount.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedLocalDueAmount = (invoice): string => {
    return this.formatMoney(invoice.localDueAmount);
  };

  /**
   * Retrieve formatted payment amount.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedPaymentAmount = (invoice): string => {
    return formatNumber(invoice.paymentAmount, {
      currencyCode: invoice.currencyCode,
    });
  };

  /**
   * Retrieve the formatted invoice balance.
   * @param {ISaleInvoice} invoice
   * @returns {string}
   */
  protected formattedBalanceAmount = (invoice): string => {
    return formatNumber(invoice.balanceAmount, {
      currencyCode: invoice.currencyCode,
    });
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
