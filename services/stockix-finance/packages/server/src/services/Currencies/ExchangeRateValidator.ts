import { ServiceError } from '@/exceptions';

export const EXCHANGE_RATE_ERRORS = {
  EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY:
    'EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY',
};

/**
 * Throws a ServiceError when the given currency is foreign (differs from the
 * organization base currency) and no valid exchange rate has been provided.
 *
 * Convention: Indirect Quote — 1 base = exchangeRate foreign.
 * A missing or non-positive rate on a foreign-currency document produces
 * incorrect localAmount values in model virtual getters, so we reject early.
 */
export function validateForeignCurrencyExchangeRate(
  currencyCode: string,
  baseCurrency: string,
  exchangeRate: number | undefined | null
): void {
  if (
    currencyCode &&
    baseCurrency &&
    currencyCode !== baseCurrency &&
    (!exchangeRate || exchangeRate <= 0)
  ) {
    throw new ServiceError(
      EXCHANGE_RATE_ERRORS.EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY
    );
  }
}
