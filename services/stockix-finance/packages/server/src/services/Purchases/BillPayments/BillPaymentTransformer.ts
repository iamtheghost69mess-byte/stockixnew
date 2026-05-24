import { IBillPayment } from '@/interfaces';
import { Transformer } from '@/lib/Transformer/Transformer';
import { formatNumber } from 'utils';

export class BillPaymentTransformer extends Transformer {
  /**
   * Include these attributes to sale invoice object.
   * @returns {Array}
   */
  public includeAttributes = (): string[] => {
    return ['formattedPaymentDate', 'formattedAmount', 'formattedLocalAmount'];
  };

  /**
   * Retrieve formatted invoice date.
   * @param {IBill} invoice
   * @returns {String}
   */
  protected formattedPaymentDate = (billPayment: IBillPayment): string => {
    return this.formatDate(billPayment.paymentDate);
  };

  /**
   * Retrieve formatted bill amount.
   * @param {IBill} invoice
   * @returns {string}
   */
  protected formattedAmount = (billPayment: IBillPayment): string => {
    return formatNumber(billPayment.amount, {
      currencyCode: billPayment.currencyCode,
    });
  };

  /**
   * Retrieve formatted bill payment local amount.
   * @param {IBillPayment} billPayment
   * @returns {string}
   */
  protected formattedLocalAmount = (billPayment: IBillPayment): string => {
    return this.formatMoney(billPayment.localAmount);
  };
}
