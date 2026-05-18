// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  TotalLineBorderStyle,
  TotalLineTextStyle,
  FormatNumber,
  T,
  TotalLines,
  DualCurrencyTotalLinesView,
} from '@/components';
import { DualCurrencyDetailTotalLine } from '@/components/DualCurrencyTotalLines';
import { useBillDrawerContext } from './BillDrawerProvider';

/**
 * Bill read-only details table footer.
 */
export function BillDetailTableFooter() {
  const { bill } = useBillDrawerContext();

  const billDate = bill.bill_date;
  const billCurrency = bill.currency_code;

  return (
    <BillDetailsFooterRoot>
      <BillTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'bill.details.subtotal'} />}
          value={<FormatNumber value={bill.amount} />}
          amount={bill.amount}
          invoiceDate={billDate}
          invoiceCurrency={billCurrency}
          borderStyle={TotalLineBorderStyle.SingleDark}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'bill.details.total'} />}
          value={bill.formatted_amount}
          amount={bill.amount}
          invoiceDate={billDate}
          invoiceCurrency={billCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'bill.details.payment_amount'} />}
          value={bill.formatted_payment_amount}
          amount={bill.payment_amount}
          invoiceDate={billDate}
          invoiceCurrency={billCurrency}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'bill.details.due_amount'} />}
          value={bill.formatted_due_amount}
          amount={bill.due_amount}
          invoiceDate={billDate}
          invoiceCurrency={billCurrency}
        />
        <DualCurrencyTotalLinesView invoice={bill} />
      </BillTotalLines>
    </BillDetailsFooterRoot>
  );
}

export const BillDetailsFooterRoot = styled.div``;

export const BillTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
