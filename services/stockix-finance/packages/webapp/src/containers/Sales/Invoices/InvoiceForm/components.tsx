// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import * as R from 'ramda';
import { Button, Callout } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { ExchangeRateInputGroup } from '@/components';
import { useCurrentOrganization } from '@/hooks/state';
import { useInvoiceIsForeignCustomer } from './utils';
import withSettings from '@/containers/Settings/withSettings';
import { useUpdateEffect } from '@/hooks';
import { transactionNumber } from '@/utils';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';

/**
 * Invoice exchange rate input field.
 * Auto-fills the exchange rate from the latest known rate when currency changes.
 * @returns {JSX.Element}
 */
export function InvoiceExchangeRateInputField({ ...props }) {
  const currentOrganization = useCurrentOrganization();
  const { values, setFieldValue } = useFormikContext();

  const isForeignCustomer = useInvoiceIsForeignCustomer();
  const latestRate = useLatestExchangeRateForCurrency(values.currency_code);

  // Auto-fill exchange_rate when currency changes and we have a known rate.
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
 * Invoice project select.
 * @returns {JSX.Element}
 */
export function InvoiceProjectSelectButton({ label }) {
  return <Button text={label ?? intl.get('select_project')} />;
}

/**
 * Syncs invoice auto-increment settings to invoice form once update.
 */
export const InvoiceNoSyncSettingsToForm = R.compose(
  withSettings(({ invoiceSettings }) => ({
    invoiceAutoIncrement: invoiceSettings?.autoIncrement,
    invoiceNextNumber: invoiceSettings?.nextNumber,
    invoiceNumberPrefix: invoiceSettings?.numberPrefix,
  })),
)(({ invoiceAutoIncrement, invoiceNextNumber, invoiceNumberPrefix }) => {
  const { setFieldValue } = useFormikContext();

  useUpdateEffect(() => {
    // Do not update if the invoice auto-increment mode is disabled.
    if (!invoiceAutoIncrement) return null;

    setFieldValue(
      'invoice_no',
      transactionNumber(invoiceNumberPrefix, invoiceNextNumber),
    );
  }, [setFieldValue, invoiceNumberPrefix, invoiceNextNumber]);

  return null;
});
