import { Transformer } from '@/lib/Transformer/Transformer';
import { ICurrency } from '@/interfaces/Currency';

export class CurrencyTransformer extends Transformer {
  public includeAttributes = (): string[] => {
    return ['isBaseCurrency', 'latestExchangeRate', 'latestExchangeRateDate'];
  };

  public isBaseCurrency(currency: ICurrency): boolean {
    return this.context.organization.baseCurrency === currency.currencyCode;
  }

  public latestExchangeRate(currency: ICurrency): number | null {
    return this.options?.latestRatesMap?.[currency.currencyCode]?.exchangeRate ?? null;
  }

  public latestExchangeRateDate(currency: ICurrency): string | null {
    const rate = this.options?.latestRatesMap?.[currency.currencyCode];
    return rate?.date ? this.formatDate(rate.date) : null;
  }
}
