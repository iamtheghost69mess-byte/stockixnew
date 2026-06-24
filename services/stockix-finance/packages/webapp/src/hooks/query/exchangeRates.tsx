// @ts-nocheck
import { useMutation, useQueryClient } from 'react-query';
import { defaultTo } from 'lodash';
import { useQueryTenant } from '../useQueryRequest';
import { transformPagination } from '@/utils';
import useApiRequest from '../useRequest';
import t from './types';

const defaultPagination = {
  pageSize: 20,
  page: 0,
  pagesCount: 0,
};

function invalidateRateQueries(queryClient) {
  queryClient.invalidateQueries('EXCHANGES_RATES');
  // Currencies list now includes latestExchangeRate — keep it in sync.
  queryClient.invalidateQueries(t.CURRENCIES);
}

/**
 * Creates a new exchange rate.
 */
export function useCreateExchangeRate(props?) {
  const queryClient = useQueryClient();
  const apiRequest = useApiRequest();

  return useMutation((values) => apiRequest.post('exchange_rates', values), {
    onSuccess: () => {
      invalidateRateQueries(queryClient);
    },
    ...props,
  });
}

/**
 * Edits the exchange rate.
 */
export function useEditExchangeRate(props?) {
  const queryClient = useQueryClient();
  const apiRequest = useApiRequest();

  return useMutation(
    ([id, values]) => apiRequest.post(`exchange_rates/${id}`, values),
    {
      onSuccess: () => {
        invalidateRateQueries(queryClient);
      },
      ...props,
    },
  );
}

/** @deprecated use useEditExchangeRate */
export const useEdiExchangeRate = useEditExchangeRate;

/**
 * Deletes the exchange rate.
 */
export function useDeleteExchangeRate(props?) {
  const queryClient = useQueryClient();
  const apiRequest = useApiRequest();

  return useMutation((id) => apiRequest.delete(`exchange_rates/${id}`), {
    onSuccess: () => {
      invalidateRateQueries(queryClient);
    },
    ...props,
  });
}

/**
 * Retrieve the exchange rate list (paginated).
 */
export function useExchangeRates(query?, props?) {
  const apiRequest = useApiRequest();

  const states = useQueryTenant(
    ['EXCHANGES_RATES', query],
    () => apiRequest.get('exchange_rates', { params: query }),
    {
      select: (res) => ({
        exchangesRates: res.data.exchange_rates.results,
        pagination: transformPagination(res.data.exchange_rates.pagination),
        filterMeta: res.data.filter_meta,
      }),
      ...props,
    },
  );

  return {
    ...states,
    data: defaultTo(states.data, {
      exchangesRates: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
      },
      filterMeta: {},
    }),
  };
}

export function useRefreshExchangeRate() {
  const queryClient = useQueryClient();

  return {
    refresh: () => {
      invalidateRateQueries(queryClient);
    },
  };
}

/**
 * Looks up a single exchange rate by currency code + date.
 * Used by the form to auto-switch to edit mode on PERIOD_EXISTS.
 */
export function useExchangeRateLookup() {
  const apiRequest = useApiRequest();

  return useMutation(
    ({ currencyCode, date }: { currencyCode: string; date: string }) =>
      apiRequest.get('exchange_rates/lookup', {
        params: { currency_code: currencyCode, date },
      }),
  );
}

/**
 * Fetches the most recent exchange rate on or before a given date.
 * Used by form footers for transaction-date dual-currency conversion.
 */
export function useExchangeRateByDate(currencyCode: string, date: string, props?) {
  const apiRequest = useApiRequest();

  return useQueryTenant(
    ['EXCHANGE_RATE_BY_DATE', currencyCode, date],
    () =>
      apiRequest.get('exchange_rates/by-date', {
        params: { currency_code: currencyCode, date },
      }),
    {
      enabled: !!(currencyCode && date),
      select: (res) => res.data.exchange_rate,
      retry: false,
      staleTime: 5 * 60 * 1000,
      ...props,
    },
  );
}

/**
 * Returns exchange rate sync status for all currencies.
 * A currency is stale when it has no rate stored within the last 7 days.
 * Used by Preferences → Currencies to show a "No rate" warning tag.
 */
export function useExchangeRateSyncStatus(props?) {
  const apiRequest = useApiRequest();

  return useQueryTenant(
    ['EXCHANGE_RATE_SYNC_STATUS'],
    () => apiRequest.get('exchange-rates/sync-status'),
    {
      select: (res) => res.data as Array<{ currencyCode: string; lastRateDate: string | null; isStale: boolean }>,
      staleTime: 5 * 60 * 1000,
      ...props,
    },
  );
}

/** Alias used by AutoExchangeProvider: fetches latest exchange rate for a currency. */
export function useLatestExchangeRate(
  { fromCurrency }: { fromCurrency: string },
  props?: Record<string, unknown>,
) {
  return useQueryTenant(
    [t.EXCHANGE_RATE, 'latest', fromCurrency],
    { method: 'get', url: `/currencies/${fromCurrency}/exchange_rate` },
    {
      enabled: Boolean(fromCurrency),
      select: (res) => res.data?.exchange_rate ?? res.data,
      retry: false,
      staleTime: 5 * 60 * 1000,
      ...props,
    },
  );
}
