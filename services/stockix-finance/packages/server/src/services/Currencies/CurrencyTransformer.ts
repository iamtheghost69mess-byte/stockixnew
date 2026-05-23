import { Transformer } from '@/lib/Transformer/Transformer';
import { ICurrency } from '@/interfaces/Currency';

export class CurrencyTransformer extends Transformer {
  public includeAttributes = (): string[] => {
    return ['is_base_currency', 'latest_exchange_rate', 'latest_exchange_rate_date', 'latest_exchange_rate_id'];
  };

  public is_base_currency(currency: ICurrency): boolean {
    return this.context.organization.baseCurrency === currency.currencyCode;
  }

  public latest_exchange_rate(currency: ICurrency): number | null {
    return this.options?.latestRatesMap?.[currency.currencyCode]?.exchangeRate ?? null;
  }

  public latest_exchange_rate_date(currency: ICurrency): string | null {
    const rate = this.options?.latestRatesMap?.[currency.currencyCode];
    return rate?.date ? this.formatDate(rate.date) : null;
  }

  public latest_exchange_rate_id(currency: ICurrency): number | null {
    return this.options?.latestRatesMap?.[currency.currencyCode]?.id ?? null;
  }
}
