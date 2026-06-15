// @ts-nocheck
import React, { createContext, useContext, useState } from 'react';
import {
  useCreateExchangeRate,
  useEditExchangeRate,
  useCurrencies,
  useExchangeRates,
} from '@/hooks/query';
import { DialogContent } from '@/components';

const ExchangeRateFormContext = createContext();

function ExchangeRateFormProvider({
  exchangeRate: exchangeRateProp,
  action: actionProp,
  dialogName,
  currencyCode,
  ...props
}) {
  // Allow the form to flip into edit mode after a PERIOD_EXISTS auto-resolve.
  const [resolvedExchangeRate, setResolvedExchangeRate] = useState(exchangeRateProp);
  const [resolvedAction, setResolvedAction] = useState(actionProp);

  const { mutateAsync: createExchangeRateMutate } = useCreateExchangeRate();
  const { mutateAsync: editExchangeRateMutate } = useEditExchangeRate();

  const { data: currencies, isFetching: isCurrenciesLoading } = useCurrencies();
  const { isFetching: isExchangeRatesLoading } = useExchangeRates();

  const isNewMode = !resolvedExchangeRate;

  // Called by the form when it detects an existing rate for the submitted period.
  const switchToEditMode = (existingRate) => {
    setResolvedExchangeRate(existingRate);
    setResolvedAction('edit');
  };

  const provider = {
    createExchangeRateMutate,
    editExchangeRateMutate,
    dialogName,
    exchangeRate: resolvedExchangeRate,
    action: resolvedAction,
    currencies,
    isExchangeRatesLoading,
    isNewMode,
    currencyCode,
    switchToEditMode,
  };

  return (
    <DialogContent isLoading={isCurrenciesLoading} name={'exchange-rate-form'}>
      <ExchangeRateFormContext.Provider value={provider} {...props} />
    </DialogContent>
  );
}

const useExchangeRateFromContext = () => useContext(ExchangeRateFormContext);

export { ExchangeRateFormProvider, useExchangeRateFromContext };
