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
import { usePaymentMadeTotals } from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';

export function PaymentMadeFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = usePaymentMadeTotals();

  return (
    <PaymentMadeTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <TotalLine
        title={<T id={'payment_made_form.label.subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <TotalLine
        title={<T id={'payment_made_form.label.total'} />}
        value={formattedTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyTotalLines total={total} />
    </PaymentMadeTotalLines>
  );
}

const PaymentMadeTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
