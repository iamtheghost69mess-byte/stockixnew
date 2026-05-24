// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import {
  T,
  TotalLines,
  TotalLineBorderStyle,
  TotalLineTextStyle,
} from '@/components';
import { DualCurrencyFormTotalLine } from '@/components/DualCurrencyTotalLines';
import { useJournalTotals } from './utils';

export function MakeJournalFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = useJournalTotals();

  return (
    <MakeJouranlTotalLines>
      <DualCurrencyFormTotalLine
        amount={total}
        title={<T id={'make_journal.label.subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <DualCurrencyFormTotalLine
        amount={total}
        title={<T id={'make_journal.label.total'} />}
        value={formattedTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
    </MakeJouranlTotalLines>
  );
}

const MakeJouranlTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
