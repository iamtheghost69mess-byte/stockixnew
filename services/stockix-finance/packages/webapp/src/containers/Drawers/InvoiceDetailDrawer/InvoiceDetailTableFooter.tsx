// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  T,
  TotalLines,
  TotalLine,
  TotalLineBorderStyle,
  TotalLineTextStyle,
  FormatNumber,
  DualCurrencyTotalLinesView,
} from '@/components';
import { DualCurrencyDetailTotalLine } from '@/components/DualCurrencyTotalLines';
import { useInvoiceDetailDrawerContext } from './InvoiceDetailDrawerProvider';

/**
 * Invoice details footer — shows subtotal / total / payment / due with
 * a secondary-currency row beneath each line for every configured display
 * currency.
 *
 * Numeric fields used for conversion (all returned by the invoice API):
 *   invoice.balance        – total / subtotal amount
 *   invoice.payment_amount – amount already paid
 *   invoice.due_amount     – remaining balance
 */
export function InvoiceDetailTableFooter() {
  const { invoice } = useInvoiceDetailDrawerContext();

  const invoiceDate = invoice.invoice_date;
  const invoiceCurrency = invoice.currency_code;

  return (
    <InvoiceDetailsFooterRoot>
      <InvoiceTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'invoice.details.subtotal'} />}
          value={<FormatNumber value={invoice.balance} />}
          amount={invoice.balance}
          invoiceDate={invoiceDate}
          invoiceCurrency={invoiceCurrency}
          borderStyle={TotalLineBorderStyle.SingleDark}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'invoice.details.total'} />}
          value={invoice.formatted_amount}
          amount={invoice.balance}
          invoiceDate={invoiceDate}
          invoiceCurrency={invoiceCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'invoice.details.payment_amount'} />}
          value={invoice.formatted_payment_amount}
          amount={invoice.payment_amount}
          invoiceDate={invoiceDate}
          invoiceCurrency={invoiceCurrency}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'invoice.details.due_amount'} />}
          value={invoice.formatted_due_amount}
          amount={invoice.due_amount}
          invoiceDate={invoiceDate}
          invoiceCurrency={invoiceCurrency}
          textStyle={TotalLineTextStyle.Bold}
        />
        {/* Base-currency rows for foreign-currency invoices (server-computed) */}
        <DualCurrencyTotalLinesView invoice={invoice} />
      </InvoiceTotalLines>
    </InvoiceDetailsFooterRoot>
  );
}

const InvoiceDetailsFooterRoot = styled.div``;

const InvoiceTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
