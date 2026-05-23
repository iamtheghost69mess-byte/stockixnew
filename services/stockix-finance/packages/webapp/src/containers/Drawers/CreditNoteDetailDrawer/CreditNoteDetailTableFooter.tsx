// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  T,
  TotalLines,
  FormatNumber,
  TotalLineBorderStyle,
  TotalLineTextStyle,
  DualCurrencyTotalLinesView,
} from '@/components';
import { DualCurrencyDetailTotalLine } from '@/components/DualCurrencyTotalLines';
import { useCreditNoteDetailDrawerContext } from './CreditNoteDetailDrawerProvider';

/**
 * Credit note details panel footer.
 */
export default function CreditNoteDetailTableFooter() {
  const { creditNote } = useCreditNoteDetailDrawerContext();

  const creditNoteDate = creditNote.credit_note_date;
  const creditNoteCurrency = creditNote.currency_code;

  return (
    <CreditNoteDetailsFooterRoot>
      <CreditNoteTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'credit_note.drawer.label_subtotal'} />}
          value={<FormatNumber value={creditNote.amount} />}
          amount={creditNote.amount}
          invoiceDate={creditNoteDate}
          invoiceCurrency={creditNoteCurrency}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'credit_note.drawer.label_total'} />}
          value={creditNote.formatted_amount}
          amount={creditNote.amount}
          invoiceDate={creditNoteDate}
          invoiceCurrency={creditNoteCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyTotalLinesView invoice={creditNote} />
      </CreditNoteTotalLines>
    </CreditNoteDetailsFooterRoot>
  );
}

export const CreditNoteDetailsFooterRoot = styled.div``;

export const CreditNoteTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
