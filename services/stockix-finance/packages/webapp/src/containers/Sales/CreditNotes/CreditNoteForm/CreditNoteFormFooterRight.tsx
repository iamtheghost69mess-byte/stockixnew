// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import { useFormikContext } from 'formik';
import {
  T,
  TotalLines,
  TotalLine,
  TotalLineBorderStyle,
  TotalLineTextStyle,
} from '@/components';
import {
  useCreditNoteAdjustmentFormatted,
  useCreditNoteDiscountAmountFormatted,
  useCreditNoteSubtotalFormatted,
  useCreditNoteTotalFormatted,
  useCreditNoteTotal,
} from './utils';
import { DualCurrencyTotalLines } from '@/components/DualCurrencyTotalLines';
import { DiscountTotalLine } from '../../Invoices/InvoiceForm/DiscountTotalLine';
import { AdjustmentTotalLine } from '../../Invoices/InvoiceForm/AdjustmentTotalLine';

export function CreditNoteFormFooterRight() {
  const {
    values: { currency_code },
  } = useFormikContext();

  const subtotalFormatted = useCreditNoteSubtotalFormatted();
  const totalFormatted = useCreditNoteTotalFormatted();
  const discountAmount = useCreditNoteDiscountAmountFormatted();
  const adjustmentAmount = useCreditNoteAdjustmentFormatted();
  const total = useCreditNoteTotal();

  return (
    <CreditNoteTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
      <TotalLine
        title={<T id={'credit_note.label_subtotal'} />}
        value={subtotalFormatted}
        borderStyle={TotalLineBorderStyle.BorderBottom}
      />
      <DiscountTotalLine
        currencyCode={currency_code}
        discountAmount={discountAmount}
      />
      <AdjustmentTotalLine adjustmentAmount={adjustmentAmount} />
      <TotalLine
        title={<T id={'credit_note.label_total'} />}
        value={totalFormatted}
        textStyle={TotalLineTextStyle.Bold}
      />
      <DualCurrencyTotalLines total={total} />
    </CreditNoteTotalLines>
  );
}

const CreditNoteTotalLines = styled(TotalLines)`
  --x-color-text: #555555;

  .bp4-dark & {
    --x-color-text: var(--color-light-gray4);
  }
  width: 100%;
  color: var(--x-color-text);
`;
