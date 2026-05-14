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
import { useVendorCrditNoteTotals } from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';

export function VendorCreditNoteFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = useVendorCrditNoteTotals();

  return (
    <VendorCreditNoteTotalLines
      labelColWidth={'180px'}
      amountColWidth={'180px'}
    >
      <TotalLine
        title={<T id={'vendor_credit_form.label.subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <TotalLine
        title={<T id={'vendor_credit_form.label.total'} />}
        value={formattedTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyTotalLines total={total} />
    </VendorCreditNoteTotalLines>
  );
}

const VendorCreditNoteTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
