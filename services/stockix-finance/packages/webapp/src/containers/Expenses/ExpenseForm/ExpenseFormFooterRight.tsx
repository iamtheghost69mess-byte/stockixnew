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
import { useExpensesTotals } from './utils';

export function ExpenseFormFooterRight() {
  const { total, formattedSubtotal, formattedTotal } = useExpensesTotals();

  return (
    <ExpensesTotalLines>
      <DualCurrencyFormTotalLine
        amount={total}
        title={<T id={'expense.label.subtotal'} />}
        value={formattedSubtotal}
        borderStyle={TotalLineBorderStyle.None}
      />
      <DualCurrencyFormTotalLine
        amount={total}
        title={<T id={'expense.label.total'} />}
        value={formattedTotal}
        textStyle={TotalLineTextStyle.Bold}
      />
    </ExpensesTotalLines>
  );
}

const ExpensesTotalLines = styled(TotalLines)`
  width: 100%;
  color: #555555;
`;
