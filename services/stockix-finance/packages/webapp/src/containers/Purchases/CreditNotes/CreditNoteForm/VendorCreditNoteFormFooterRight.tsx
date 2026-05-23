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
import { DualCurrencyFormTotalLine } from '@/components/DualCurrencyTotalLines';

export function VendorCreditNoteFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = useVendorCrditNoteTotals();

  return (
    <VendorCreditNoteTotalLines
      labelColWidth={'180px'}
      amountColWidth={'180px'}
    >
      <DualCurrencyFormTotalLine
        title={<T id={'vendor_credit_form.label.subtotal'} />}
        value={formattedSubtotal}
        amount={total}
        borderStyle={TotalLineBorderStyle.None}
      />
      <DualCurrencyFormTotalLine
        title={<T id={'vendor_credit_form.label.total'} />}
        value={formattedTotal}
        amount={total}
        textStyle={TotalLineTextStyle.Bold}
      />
    </VendorCreditNoteTotalLines>
  );
}

const VendorCreditNoteTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
