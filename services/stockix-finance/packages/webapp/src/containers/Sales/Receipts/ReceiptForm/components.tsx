// @ts-nocheck
import React, { useEffect } from 'react';
import intl from 'react-intl-universal';
import { useAutoExRateContext } from '@/containers/Entries/AutoExchangeProvider';
import { Button, Callout } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import * as R from 'ramda';

import { ExchangeRateInputGroup } from '@/components';
import { useCurrentOrganization } from '@/hooks/state';
import { useReceiptIsForeignCustomer } from './utils';
import { useUpdateEffect } from '@/hooks';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';
import withSettings from '@/containers/Settings/withSettings';
import { transactionNumber } from '@/utils';

/**
 * Receipt exchange rate input field.
 * @returns {JSX.Element}
 */
export function ReceiptExchangeRateInputField({ ...props }) {
  const currentOrganization = useCurrentOrganization();
  const { values, setFieldValue } = useFormikContext();

  const isForeignCustomer = useReceiptIsForeignCustomer();
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
 * Receipt project select.
 * @returns {JSX.Element}
 */
export function ReceiptProjectSelectButton({ label }) {
  return <Button text={label ?? intl.get('select_project')} />;
}

/**
 * Syncs receipt auto-increment settings to form.
 * @return {React.ReactNode}
 */
export const ReceiptSyncIncrementSettingsToForm = R.compose(
  withSettings(({ receiptSettings }) => ({
    receiptAutoIncrement: receiptSettings?.autoIncrement,
    receiptNextNumber: receiptSettings?.nextNumber,
    receiptNumberPrefix: receiptSettings?.numberPrefix,
  })),
)(({ receiptAutoIncrement, receiptNextNumber, receiptNumberPrefix }) => {
  const { setFieldValue } = useFormikContext();

  useUpdateEffect(() => {
    // Do not update if the receipt auto-increment mode is disabled.
    if (!receiptAutoIncrement) return;

    setFieldValue(
      'receipt_number',
      transactionNumber(receiptNumberPrefix, receiptNextNumber),
    );
  }, [
    setFieldValue,
    receiptNumberPrefix,
    receiptAutoIncrement,
    receiptNextNumber,
  ]);

  return null;
});

export function ReceiptSyncAutoExRateToForm() {
  const { values } = useFormikContext();
  const { setAutoExRateCurrency } = useAutoExRateContext();

  useEffect(() => {
    setAutoExRateCurrency(values.currency_code || '');
  }, [values.currency_code, setAutoExRateCurrency]);

  return null;
}
