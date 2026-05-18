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
import { useEstimateTotals } from './utils';
import { DualCurrencyFormTotalLine } from '@/components/DualCurrencyTotalLines';

export function EstimateFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = useEstimateTotals();

  return (
    <EstimateTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <DualCurrencyFormTotalLine
        title={<T id={'estimate_form.label.subtotal'} />}
        value={formattedSubtotal}
        amount={total}
        borderStyle={TotalLineBorderStyle.None}
      />
      <DualCurrencyFormTotalLine
        title={<T id={'estimate_form.label.total'} />}
        value={formattedTotal}
        amount={total}
        textStyle={TotalLineTextStyle.Bold}
      />
    </EstimateTotalLines>
  );
}

const EstimateTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
