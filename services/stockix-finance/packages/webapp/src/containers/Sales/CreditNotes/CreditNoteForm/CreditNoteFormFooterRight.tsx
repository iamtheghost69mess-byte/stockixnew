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
import { useCreditNoteTotals } from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';

export function CreditNoteFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = useCreditNoteTotals();

  return (
    <CreditNoteTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <TotalLine
        title={<T id={'credit_note.label_subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <TotalLine
        title={<T id={'credit_note.label_total'} />}
        value={formattedTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyTotalLines total={total} />
    </CreditNoteTotalLines>
  );
}

const CreditNoteTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
