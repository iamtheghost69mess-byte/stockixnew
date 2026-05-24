import { Transformer } from '@/lib/Transformer/Transformer';
import { formatNumber } from 'utils';

export class CreditNoteTransformer extends Transformer {
  /**
   * Include these attributes to sale credit note object.
   * @returns {Array}
   */
  public includeAttributes = (): string[] => {
    return [
      'formattedCreditsRemaining',
      'formattedLocalCreditsRemaining',
      'formattedCreditNoteDate',
      'formattedAmount',
      'formattedLocalAmount',
      'formattedLocalDueAmount',
      'formattedCreditsUsed'
    ];
  };

  /**
   * Retrieve formatted credit note date.
   * @param {ICreditNote} credit
   * @returns {String}
   */
  protected formattedCreditNoteDate = (credit): string => {
    return this.formatDate(credit.creditNoteDate);
  };

  /**
   * Retrieve formatted invoice amount.
   * @param {ICreditNote} credit
   * @returns {string}
   */
  protected formattedAmount = (credit): string => {
    return formatNumber(credit.amount, {
      currencyCode: credit.currencyCode,
    });
  };

  /**
   * Retrieve formatted local amount.
   * @param {ICreditNote} credit
   * @returns {string}
   */
  protected formattedLocalAmount = (credit): string => {
    return this.formatMoney(credit.localAmount);
  };

  /**
   * Retrieve formatted credits remaining.
   * @param {ICreditNote} credit
   * @returns {string}
   */
  protected formattedCreditsRemaining = (credit) => {
    return formatNumber(credit.creditsRemaining, {
      currencyCode: credit.currencyCode,
    });
  };

  /**
   * Retrieve formatted local credits remaining.
   * @param {ICreditNote} credit
   * @returns {string}
   */
  protected formattedLocalCreditsRemaining = (credit): string => {
    return this.formatMoney(credit.localCreditsRemaining);
  };

  protected formattedLocalDueAmount = (credit): string => {
    return this.formatMoney(credit.localCreditsRemaining);
  };

  /**
   * Retrieve formatted credits used.
   * @param {ICreditNote} credit
   * @returns {string}
   */
   protected formattedCreditsUsed = (credit) => {
    return formatNumber(credit.creditsUsed, {
      currencyCode: credit.currencyCode,
    });
  };
}
