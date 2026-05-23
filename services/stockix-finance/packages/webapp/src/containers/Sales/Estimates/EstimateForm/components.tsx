// @ts-nocheck
import React, { useEffect } from 'react';
import intl from 'react-intl-universal';
import { Button, Callout } from '@blueprintjs/core';
import * as R from 'ramda';
import { useFormikContext } from 'formik';
import { ExchangeRateInputGroup } from '@/components';
import { useCurrentOrganization } from '@/hooks/state';
import { useEstimateIsForeignCustomer } from './utils';
import withSettings from '@/containers/Settings/withSettings';
import { transactionNumber } from '@/utils';
import { useUpdateEffect } from '@/hooks';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';

/**
 * Estimate exchange rate input field.
 * Auto-fills the exchange rate from the latest known rate when currency changes.
 * @returns {JSX.Element}
 */
export function EstimateExchangeRateInputField({ ...props }) {
  const currentOrganization = useCurrentOrganization();
  const { values, setFieldValue } = useFormikContext();

  const isForeignCustomer = useEstimateIsForeignCustomer();
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
 * Estimate project select.
 * @returns {JSX.Element}
 */
export function EstimateProjectSelectButton({ label }) {
  return <Button text={label ?? intl.get('select_project')} />;
}

/**
 * Syncs the estimate auto-increment settings to estimate form.
 * @returns {React.ReactNode}
 */
export const EstimateIncrementSyncSettingsToForm = R.compose(
  withSettings(({ estimatesSettings }) => ({
    estimateNextNumber: estimatesSettings?.nextNumber,
    estimateNumberPrefix: estimatesSettings?.numberPrefix,
    estimateAutoIncrement: estimatesSettings?.autoIncrement,
  })),
)(({ estimateNextNumber, estimateNumberPrefix, estimateAutoIncrement }) => {
  const { setFieldValue } = useFormikContext();

  useUpdateEffect(() => {
    // Do not update if the estimate auto-increment mode is disabled.
    if (!estimateAutoIncrement) return null;

    setFieldValue(
      'estimate_number',
      transactionNumber(estimateNumberPrefix, estimateNextNumber),
    );
  }, [
    setFieldValue,
    estimateNumberPrefix,
    estimateNextNumber,
    estimateAutoIncrement,
  ]);

  return null;
});
