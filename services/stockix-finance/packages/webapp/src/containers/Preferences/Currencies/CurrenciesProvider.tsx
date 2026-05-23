// @ts-nocheck
import React, { createContext, useContext, useMemo } from 'react';
import { useCurrencies } from '@/hooks/query';

const CurrenciesContext = createContext();

function CurrenciesProvider({ ...props }) {
  const { data: currencies, isLoading: isCurrenciesLoading } = useCurrencies();

  const baseCurrency = useMemo(
    () => currencies?.find((c) => c.is_base_currency) ?? null,
    [currencies],
  );

  const currenciesWithoutBase = useMemo(
    () => currencies?.filter((c) => !c.is_base_currency) ?? [],
    [currencies],
  );

  // Non-base currencies that have no latest exchange rate set.
  const missingRateCurrencies = useMemo(
    () => currenciesWithoutBase.filter((c) => c.latest_exchange_rate == null),
    [currenciesWithoutBase],
  );

  const state = {
    currencies,
    isCurrenciesLoading,
    baseCurrency,
    missingRateCurrencies,
  };

  return <CurrenciesContext.Provider value={state} {...props} />;
}

const useCurrenciesContext = () => useContext(CurrenciesContext);

export { CurrenciesProvider, useCurrenciesContext };
