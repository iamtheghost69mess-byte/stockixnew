// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  T,
  TotalLines,
  TotalLineBorderStyle,
  TotalLineTextStyle,
  FormatNumber,
  DualCurrencyTotalLinesView,
} from '@/components';
import { DualCurrencyDetailTotalLine } from '@/components/DualCurrencyTotalLines';
import { useReceiptDetailDrawerContext } from './ReceiptDetailDrawerProvider';

/**
 * Receipts read-only details table footer.
 */
export default function ReceiptDetailTableFooter() {
  const { receipt } = useReceiptDetailDrawerContext();

  const receiptDate = receipt.receipt_date;
  const receiptCurrency = receipt.currency_code;

  return (
    <ReceiptDetailsFooterRoot>
      <ReceiptTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'receipt.details.subtotal'} />}
          value={<FormatNumber value={receipt.amount} />}
          amount={receipt.amount}
          invoiceDate={receiptDate}
          invoiceCurrency={receiptCurrency}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'receipt.details.total'} />}
          value={receipt.formatted_amount}
          amount={receipt.amount}
          invoiceDate={receiptDate}
          invoiceCurrency={receiptCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'receipt.details.payment_amount'} />}
          value={receipt.formatted_amount}
          amount={receipt.amount}
          invoiceDate={receiptDate}
          invoiceCurrency={receiptCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'receipt.details.due_amount'} />}
          value={'0'}
          amount={0}
          invoiceDate={receiptDate}
          invoiceCurrency={receiptCurrency}
        />
        <DualCurrencyTotalLinesView invoice={receipt} />
      </ReceiptTotalLines>
    </ReceiptDetailsFooterRoot>
  );
}

export const ReceiptDetailsFooterRoot = styled.div``;

export const ReceiptTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
