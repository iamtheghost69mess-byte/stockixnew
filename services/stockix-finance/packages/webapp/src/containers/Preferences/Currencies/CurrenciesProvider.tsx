// @ts-nocheck
import React, { createContext, useContext } from 'react';
import { useCurrencies } from '@/hooks/query';
import { useExchangeRateSyncStatus } from '@/hooks/query/exchangeRates';

const CurrenciesContext = createContext();

/**
 * currencies provider.
 */
function CurrenciesProvider({ ...props }) {
  // fetches the currencies list.
  const { data: currencies, isLoading: isCurrenciesLoading } = useCurrencies();

  // Fetches exchange rate sync status (stale detection for currencies like LBP/USDT).
  const { data: syncStatus } = useExchangeRateSyncStatus();

  // Build a lookup map: currencyCode → { isStale, lastRateDate }
  const syncStatusByCode = React.useMemo(() => {
    if (!syncStatus) return {};
    return Object.fromEntries(syncStatus.map((s) => [s.currencyCode, s]));
  }, [syncStatus]);

  const state = {
    currencies,
    isCurrenciesLoading,
    syncStatusByCode,
  };

  return <CurrenciesContext.Provider value={state} {...props} />;
}

const useCurrenciesContext = () => useContext(CurrenciesContext);

export { CurrenciesProvider, useCurrenciesContext };
