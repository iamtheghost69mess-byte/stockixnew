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
} from '@/components';
import {
  usePaymentReceiveTotals,
  usePaymentReceivedTotalExceededAmount,
} from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';

export function PaymentReceiveFormFootetRight() {
  const { total, formattedSubtotal, formattedTotal } = usePaymentReceiveTotals();
  const exceededAmount = usePaymentReceivedTotalExceededAmount();

  return (
    <PaymentReceiveTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <TotalLine
        title={<T id={'payment_receive_form.label.subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <TotalLine
        title={<T id={'payment_receive_form.label.total'} />}
        value={formattedTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyTotalLines total={total} />
      <TotalLine
        title={'Exceeded Amount'}
        value={<FormatNumber value={exceededAmount} />}
        textStyle={TotalLineTextStyle.Regular}
      />
    </PaymentReceiveTotalLines>
  );
}

const PaymentReceiveTotalLines = styled(TotalLines)`
  --x-color-text: #555;

  .bp4-dark & {
    --x-color-text: var(--color-light-gray4);
  }
  width: 100%;
  color: var(--x-color-text);
`;
