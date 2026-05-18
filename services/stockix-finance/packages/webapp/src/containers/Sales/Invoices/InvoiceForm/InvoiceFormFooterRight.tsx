// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  T,
  TotalLines,
  TotalLine,
  TotalLineBorderStyle,
  TotalLineTextStyle,
} from '@/components';
import { useInvoiceTotals } from './utils';
import { DualCurrencyFormTotalLine } from '@/components/DualCurrencyTotalLines';

export function InvoiceFormFooterRight() {
  const {
    total,
    paymentTotal,
    dueTotal,
    formattedSubtotal,
    formattedTotal,
    formattedPaymentTotal,
    formattedDueTotal,
  } = useInvoiceTotals();

  return (
    <InvoiceTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <DualCurrencyFormTotalLine
        title={<T id={'invoice_form.label.subtotal'} />}
        value={formattedSubtotal}
        amount={total}
        borderStyle={TotalLineBorderStyle.None}
      />
      <DualCurrencyFormTotalLine
        title={<T id={'invoice_form.label.total'} />}
        value={formattedTotal}
        amount={total}
        borderStyle={TotalLineBorderStyle.SingleDark}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyFormTotalLine
        title={<T id={'invoice_form.label.payment_amount'} />}
        value={formattedPaymentTotal}
        amount={paymentTotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <DualCurrencyFormTotalLine
        title={<T id={'invoice_form.label.due_amount'} />}
        value={formattedDueTotal}
        amount={dueTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
    </InvoiceTotalLines>
  );
}

const InvoiceTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
