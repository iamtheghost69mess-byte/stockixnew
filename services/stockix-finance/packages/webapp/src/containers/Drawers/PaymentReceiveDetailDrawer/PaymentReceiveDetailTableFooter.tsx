// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  FormatNumber,
  TotalLineTextStyle,
  TotalLineBorderStyle,
  T,
  TotalLines,
  DualCurrencyTotalLinesView,
} from '@/components';
import { DualCurrencyDetailTotalLine } from '@/components/DualCurrencyTotalLines';
import { usePaymentReceiveDetailContext } from './PaymentReceiveDetailProvider';

/**
 * Payment receive detail table footer.
 * @returns {React.JSX}
 */
export default function PaymentReceiveDetailTableFooter() {
  const { paymentReceive } = usePaymentReceiveDetailContext();

  const paymentDate = paymentReceive.payment_date;
  const paymentCurrency = paymentReceive.currency_code;

  return (
    <PaymentReceiveDetailsFooterRoot>
      <PaymentReceiveTotalLines
        labelColWidth={'180px'}
        amountColWidth={'180px'}
      >
        <DualCurrencyDetailTotalLine
          title={<T id={'payment_receive.details.subtotal'} />}
          value={<FormatNumber value={paymentReceive.amount} />}
          amount={paymentReceive.amount}
          invoiceDate={paymentDate}
          invoiceCurrency={paymentCurrency}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'payment_receive.details.total'} />}
          value={paymentReceive.formatted_amount}
          amount={paymentReceive.amount}
          invoiceDate={paymentDate}
          invoiceCurrency={paymentCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyTotalLinesView invoice={paymentReceive} />
      </PaymentReceiveTotalLines>
    </PaymentReceiveDetailsFooterRoot>
  );
}

export const PaymentReceiveDetailsFooterRoot = styled.div``;

export const PaymentReceiveTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
