// @ts-nocheck
import React from 'react';

import ExchangeRateForm from './ExchangeRateForm';
import { ExchangeRateFormProvider } from './ExchangeRateFormProvider';

import '@/style/pages/ExchangeRate/ExchangeRateDialog.scss';

/**
 * Exchange rate form content.
 */
export default function ExchangeRateFormDialogContent({
  // #ownProp
  action,
  exchangeRateId,
  dialogName,
  currencyCode,
}) {
  return (
    <ExchangeRateFormProvider
      dialogName={dialogName}
      exchangeRate={exchangeRateId}
      action={action}
      currencyCode={currencyCode}
    >
      <ExchangeRateForm />
    </ExchangeRateFormProvider>
  );
}
