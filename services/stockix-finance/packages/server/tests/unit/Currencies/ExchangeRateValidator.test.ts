import {
  validateForeignCurrencyExchangeRate,
  EXCHANGE_RATE_ERRORS,
} from '@/services/Currencies/ExchangeRateValidator';
import { ServiceError } from '@/exceptions';

describe('validateForeignCurrencyExchangeRate', () => {
  const BASE = 'USD';
  const FOREIGN = 'EUR';

  it('does not throw when document currency matches base currency', () => {
    expect(() =>
      validateForeignCurrencyExchangeRate(BASE, BASE, undefined)
    ).not.toThrow();
  });

  it('does not throw when a valid positive exchange rate is supplied', () => {
    expect(() =>
      validateForeignCurrencyExchangeRate(FOREIGN, BASE, 1.08)
    ).not.toThrow();
  });

  it('throws when foreign currency has no exchange rate', () => {
    expect(() =>
      validateForeignCurrencyExchangeRate(FOREIGN, BASE, undefined)
    ).toThrow(ServiceError);
  });

  it('throws when foreign currency exchange rate is zero', () => {
    expect(() =>
      validateForeignCurrencyExchangeRate(FOREIGN, BASE, 0)
    ).toThrow(ServiceError);
  });

  it('throws when foreign currency exchange rate is negative', () => {
    expect(() =>
      validateForeignCurrencyExchangeRate(FOREIGN, BASE, -1)
    ).toThrow(ServiceError);
  });

  it('throws the correct error code', () => {
    try {
      validateForeignCurrencyExchangeRate(FOREIGN, BASE, null);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).errorType).toBe(
        EXCHANGE_RATE_ERRORS.EXCHANGE_RATE_REQUIRED_FOR_FOREIGN_CURRENCY
      );
    }
  });

  it('does not throw when currency codes are empty strings', () => {
    expect(() =>
      validateForeignCurrencyExchangeRate('', '', undefined)
    ).not.toThrow();
  });
});
