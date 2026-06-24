// @ts-nocheck
import React from 'react';
import { ExchangeRateFormProvider } from './ExchangeRateFormProvider';
import ExchangeRateForm from './ExchangeRateForm';

function ExchangeRateFormContent({
  dialogName,
  action,
  exchangeRate,
  currencyCode,
  isOpen,
}) {
  return (
    <ExchangeRateFormProvider
      dialogName={dialogName}
      action={isOpen ? action : ''}
      exchangeRate={isOpen ? exchangeRate : null}
      currencyCode={isOpen ? currencyCode : ''}
    >
      <ExchangeRateForm />
    </ExchangeRateFormProvider>
  );
}

export default ExchangeRateFormContent;
