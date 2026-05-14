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
import { usePaymentReceiveTotals } from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';

export function PaymentReceiveFormFootetRight() {
  const { total, formattedSubtotal, formattedTotal } = usePaymentReceiveTotals();

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
    </PaymentReceiveTotalLines>
  );
}

const PaymentReceiveTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
