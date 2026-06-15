import { Injectable } from '@nestjs/common';
import { ServiceError } from '@/modules/Items/ServiceError';

export const EXCHANGE_RATE_ERRORS = {
  EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY:
    'EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY',
};

/**
 * Throws when a foreign-currency document has no valid exchange rate.
 * Indirect quote: 1 base = exchangeRate foreign.
 */
export function validateForeignCurrencyExchangeRate(
  currencyCode: string,
  baseCurrency: string,
  exchangeRate: number | undefined | null,
): void {
  if (
    currencyCode &&
    baseCurrency &&
    currencyCode !== baseCurrency &&
    (!exchangeRate || exchangeRate <= 0)
  ) {
    throw new ServiceError(
      EXCHANGE_RATE_ERRORS.EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY,
      'Exchange rate is required for foreign currency transactions.',
    );
  }
}

@Injectable()
export class ExchangeRateValidator {
  validate(
    currencyCode: string,
    baseCurrency: string,
    exchangeRate: number | undefined | null,
  ): void {
    validateForeignCurrencyExchangeRate(
      currencyCode,
      baseCurrency,
      exchangeRate,
    );
  }
}
