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
import { useBillTotals } from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';

export function BillFormFooterRight() {
  const {
    total,
    formattedSubtotal,
    formattedTotal,
    formattedDueTotal,
    formattedPaymentTotal,
  } = useBillTotals();

  return (
    <BillTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <TotalLine
        title={<T id={'bill_form.label.subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <TotalLine
        title={<T id={'bill_form.label.total'} />}
        value={formattedTotal}
        borderStyle={TotalLineBorderStyle.SingleDark}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyTotalLines total={total} />
      <TotalLine
        title={<T id={'bill_form.label.payment_amount'} />}
        value={formattedPaymentTotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <TotalLine
        title={<T id={'bill_form.label.due_amount'} />}
        value={formattedDueTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
    </BillTotalLines>
  );
}

const BillTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
