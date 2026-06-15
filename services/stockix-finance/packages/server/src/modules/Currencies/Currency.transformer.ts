import { Transformer } from "../Transformer/Transformer";

export class CurrencyTransformer extends Transformer {
  /**
   * Include these attributes to sale invoice object.
   * @returns {Array}
   */
  public includeAttributes = (): string[] => {
    return [
      'isBaseCurrency',
      'latestExchangeRate',
      'latestExchangeRateDate',
      'latestExchangeRateId',
    ];
  };

  /**
   * Detarmines whether the currency is base currency.
   * @returns {boolean}
   */
  public isBaseCurrency(currency): boolean {
    return this.context.organization.baseCurrency === currency.currencyCode;
  }

  public latestExchangeRate(currency): number | null {
    return this.options?.latestRatesMap?.[currency.currencyCode]?.exchangeRate ?? null;
  }

  public latestExchangeRateDate(currency): string | null {
    const rate = this.options?.latestRatesMap?.[currency.currencyCode];
    return rate?.date ? this.formatDate(rate.date) : null;
  }

  public latestExchangeRateId(currency): number | null {
    return this.options?.latestRatesMap?.[currency.currencyCode]?.id ?? null;
  }
}
