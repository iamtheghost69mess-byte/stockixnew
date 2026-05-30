// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import intl from 'react-intl-universal';
import * as R from 'ramda';
import { withDialogActions } from '@/containers/Dialog/withDialogActions';
import { useSyncExRateToForm } from '@/containers/Entries/withExRateItemEntriesPriceRecalc';
import { useCreditNoteTotal } from './utils';
import { Callout } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import * as R from 'ramda';
import { ExchangeRateInputGroup } from '@/components';
import { useCurrentOrganization } from '@/hooks/state';
import { useCreditNoteIsForeignCustomer } from './utils';
import withSettings from '@/containers/Settings/withSettings';
import { transactionNumber } from '@/utils';
import { useUpdateEffect } from '@/hooks';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';

/**
 * Credit note exchange rate input field.
 * Auto-fills the exchange rate from the latest known rate when currency changes.
 * @returns {JSX.Element}
 */
export function CreditNoteExchangeRateInputField({ ...props }) {
  const currentOrganization = useCurrentOrganization();
  const { values, setFieldValue } = useFormikContext();

  const isForeignCustomer = useCreditNoteIsForeignCustomer();
  const latestRate = useLatestExchangeRateForCurrency(values.currency_code);

  useUpdateEffect(() => {
    if (latestRate != null) {
      setFieldValue('exchange_rate', latestRate);
    }
  }, [values.currency_code]);

  // Can't continue if the customer is not foreign.
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

/**
 * Syncs credit note auto-increment settings to form.
 * @return {React.ReactNode}
 */
export const CreditNoteSyncIncrementSettingsToForm = R.compose(
  withSettings(({ creditNoteSettings }) => ({
    creditAutoIncrement: creditNoteSettings?.autoIncrement,
    creditNextNumber: creditNoteSettings?.nextNumber,
    creditNumberPrefix: creditNoteSettings?.numberPrefix,
  })),
)(({ creditAutoIncrement, creditNextNumber, creditNumberPrefix }) => {
  const { setFieldValue } = useFormikContext();

  useEffect(() => {
    // Do not update if the credit note auto-increment mode is disabled.
    if (!creditAutoIncrement) return;

    setFieldValue(
      'credit_note_number',
      transactionNumber(creditNumberPrefix, creditNextNumber),
    );
  }, [setFieldValue, creditNumberPrefix, creditNextNumber]);

  return null;
});

export const CreditNoteExchangeRateSync = R.compose(withDialogActions)(
  () => {
    const total = useCreditNoteTotal();
    const timeout = useRef();

    useSyncExRateToForm({
      onSynced: () => {
        if (total > 0) {
          clearTimeout(timeout.current);
        }
      },
    });
    return null;
  },
);
