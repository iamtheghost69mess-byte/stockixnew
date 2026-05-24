// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { Callout } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { ExchangeRateInputGroup } from '@/components';
import { useCurrentOrganization } from '@/hooks/state';
import { useVendorNoteIsForeignCustomer } from './utils';
import { useUpdateEffect } from '@/hooks';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';

/**
 * Vendor credit note exchange rate input field.
 * Auto-fills the exchange rate from the latest known rate when currency changes.
 * @returns {JSX.Element}
 */
export function VendorCreditNoteExchangeRateInputField({ ...props }) {
  const currentOrganization = useCurrentOrganization();
  const { values, setFieldValue } = useFormikContext();

  const isForeignCustomer = useVendorNoteIsForeignCustomer();
  const latestRate = useLatestExchangeRateForCurrency(values.currency_code);

  useUpdateEffect(() => {
    if (latestRate != null) {
      setFieldValue('exchange_rate', latestRate);
    }
  }, [values.currency_code]);

  // Can't continue if the vendor is not foreign.
  if (!isForeignCustomer) {
    return null;
  }
  return (
    <>
      {latestRate === null && values.currency_code && (
        <Callout intent="warning" style={{ marginBottom: 8, fontSize: 12 }}>
          {intl.get('exchange_rate_not_set_warning', { currency: values.currency_code })}
        </Callout>
      )}
      <ExchangeRateInputGroup
        fromCurrency={values.currency_code}
        toCurrency={currentOrganization.base_currency}
        {...props}
      />
    </>
  );
}
