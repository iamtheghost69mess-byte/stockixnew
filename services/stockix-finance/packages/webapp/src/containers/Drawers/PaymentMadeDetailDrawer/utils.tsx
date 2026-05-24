// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import moment from 'moment';

import { getColumnWidth } from '@/utils';
import { FormatNumberCell } from '@/components';
import { usePaymentMadeDetailContext } from './PaymentMadeDetailProvider';
import { useCurrentOrganization } from '@/hooks/state';
import { DualCurrencyTableValueCell } from '@/components/DualCurrencyTotalLines';

/**
 * Payment made entries table columns.
 * Payment amount columns show secondary-currency equivalents when display
 * currencies are configured.
 */
export const usePaymentMadeEntriesColumns = () => {
  const {
    paymentMade: { entries, payment_date, currency_code },
  } = usePaymentMadeDetailContext();

  const org = useCurrentOrganization();
  const displayCurrencies = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const hasSecondary = displayCurrencies.length > 0;

  return React.useMemo(
    () => [
      {
        Header: intl.get('date'),
        accessor: (row) => moment(row.date).format('YYYY MMM DD'),
        width: 100,
        disableSortBy: true,
        className: 'date',
      },
      {
        Header: intl.get('bill_number'),
        accessor: 'bill_no',
        width: 150,
        disableSortBy: true,
        className: 'bill_number',
      },
      {
        Header: intl.get('bill_amount'),
        accessor: 'bill.amount',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        width: getColumnWidth(entries, 'bill.amount', { minWidth: 60, magicSpacing: 5 }),
        align: 'right',
        invoiceCurrency: currency_code,
        invoiceDate: payment_date,
      },
      {
        Header: intl.get('due_amount'),
        accessor: 'bill.due_amount',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        width: getColumnWidth(entries, 'bill.due_amount', { minWidth: 60, magicSpacing: 5 }),
        disableSortBy: true,
        align: 'right',
        invoiceCurrency: currency_code,
        invoiceDate: payment_date,
      },
      {
        Header: intl.get('payment_amount'),
        accessor: 'payment_amount',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        width: getColumnWidth(entries, 'payment_amount', { minWidth: 60, magicSpacing: 5 }),
        disableSortBy: true,
        textOverview: true,
        align: 'right',
        invoiceCurrency: currency_code,
        invoiceDate: payment_date,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hasSecondary, payment_date, currency_code],
  );
};
