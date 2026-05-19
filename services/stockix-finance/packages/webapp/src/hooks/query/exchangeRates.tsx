// @ts-nocheck
import { useQuery } from 'react-query';
import { useQueryTenant } from '../useQueryRequest';
import QUERY_TYPES from './types';
import useApiRequest from '../useRequest';

interface LatestExchangeRateQuery {
  fromCurrency?: string;
  toCurrency?: string;
}

/**
 * Retrieves latest exchange rate.
 * @param {number} customerId - Customer id.
 */
export function useLatestExchangeRate(
  { toCurrency, fromCurrency }: LatestExchangeRateQuery,
  props,
) {
  const apiRequest = useApiRequest();

  return useQuery(
    [QUERY_TYPES.EXCHANGE_RATE, toCurrency, fromCurrency],
    () =>
      apiRequest
        .http({
          url: `/api/exchange_rates/latest`,
          method: 'get',
          params: {
            to_currency: toCurrency,
            from_currency: fromCurrency,
          },
        })
        .then((res) => res.data),
    props,
  );
}

/**
 * Retrieves the stored exchange rate for a currency on or before a date.
 */
export function useExchangeRateByDate(currencyCode: string, date: string, props?) {
  const apiRequest = useApiRequest();

  return useQueryTenant(
    ['EXCHANGE_RATE_BY_DATE', currencyCode, date],
    () =>
      apiRequest.get('exchange-rates/by-date', {
        params: { currency_code: currencyCode, date },
      }),
    {
      enabled: !!(currencyCode && date),
      select: (res) => res.data.exchange_rate,
      ...props,
    },
  );
}
