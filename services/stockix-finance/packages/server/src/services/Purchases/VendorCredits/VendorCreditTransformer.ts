import { Transformer } from '@/lib/Transformer/Transformer';
import { formatNumber } from 'utils';

export class VendorCreditTransformer extends Transformer {
  /**
   * Include these attributes to vendor credit object.
   * @returns {Array}
   */
  public includeAttributes = (): string[] => {
    return [
      'formattedVendorCreditDate',
      'formattedAmount',
      'formattedLocalAmount',
      'formattedLocalDueAmount',
      'formattedCreditsRemaining',
      'formattedLocalCreditsRemaining',
    ];
  };

  /**
   * Retrieve formatted vendor credit date.
   * @param {IVendorCredit} credit
   * @returns {String}
   */
  protected formattedVendorCreditDate = (vendorCredit): string => {
    return this.formatDate(vendorCredit.vendorCreditDate);
  };

  /**
   * Retrieve formatted vendor credit amount.
   * @param {IVendorCredit} credit
   * @returns {string}
   */
  protected formattedAmount = (vendorCredit): string => {
    return formatNumber(vendorCredit.amount, {
      currencyCode: vendorCredit.currencyCode,
    });
  };

  /**
   * Retrieve formatted local amount.
   * @param {IVendorCredit} vendorCredit
   * @returns {string}
   */
  protected formattedLocalAmount = (vendorCredit): string => {
    if (vendorCredit.localAmount == null) return '';
    return this.formatMoney(vendorCredit.localAmount);
  };

  /**
   * Retrieve formatted credits remaining.
   * @param {IVendorCredit} credit
   * @returns {string}
   */
  protected formattedCreditsRemaining = (credit) => {
    return formatNumber(credit.creditsRemaining, {
      currencyCode: credit.currencyCode,
    });
  };

  /**
   * Retrieve formatted local credits remaining.
   * @param {IVendorCredit} credit
   * @returns {string}
   */
  protected formattedLocalCreditsRemaining = (credit): string => {
    if (credit.localCreditsRemaining == null) return '';
    return this.formatMoney(credit.localCreditsRemaining);
  };

  protected formattedLocalDueAmount = (credit): string => {
    if (credit.localCreditsRemaining == null) return '';
    return this.formatMoney(credit.localCreditsRemaining);
  };
}
