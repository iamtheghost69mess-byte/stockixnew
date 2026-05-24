// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import moment from 'moment';
import { Callout } from '@blueprintjs/core';
import { Money, ExchangeRateInputGroup } from '@/components';
import { MoneyFieldCell } from '@/components/DataTableCells';
import { useFormikContext } from 'formik';
import { useCurrentOrganization } from '@/hooks/state';
import { usePaymentMadeIsForeignCustomer } from './utils';
import { useUpdateEffect } from '@/hooks';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';

function BillNumberAccessor(row) {
  return row?.bill_no ? row?.bill_no : '-';
}

function BillDateCell({ value }) {
  return moment(value).format('YYYY MMM DD');
}

/**
 * Mobey table cell.
 */
function MoneyTableCell({ row: { original }, value }) {
  return <Money amount={value} currency={original.currency_code} />;
}

/**
 * Payment made entries table columns
 */
export function usePaymentMadeEntriesTableColumns() {
  return React.useMemo(
    () => [
      {
        Header: 'Bill date',
        id: 'bill_date',
        accessor: 'bill_date',
        Cell: BillDateCell,
        disableSortBy: true,
        width: 120,
      },
      {
        Header: intl.get('bill_number'),
        accessor: BillNumberAccessor,
        disableSortBy: true,
        width: 120,
      },
      {
        Header: intl.get('bill_amount'),
        accessor: 'amount',
        Cell: MoneyTableCell,
        disableSortBy: true,
        width: 150,
      },
      {
        Header: intl.get('amount_due'),
        accessor: 'due_amount',
        Cell: MoneyTableCell,
        disableSortBy: true,
        width: 150,
      },
      {
        Header: intl.get('payment_amount'),
        accessor: 'payment_amount',
        Cell: MoneyFieldCell,
        disableSortBy: true,
        width: 150,
      },
    ],
    [],
  );
}

/**
 * payment made exchange rate input field.
 * @returns {JSX.Element}
 */
export function PaymentMadeExchangeRateInputField({ ...props }) {
  const currentOrganization = useCurrentOrganization();
  const { values, setFieldValue } = useFormikContext();

  const isForeignCustomer = usePaymentMadeIsForeignCustomer();
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
