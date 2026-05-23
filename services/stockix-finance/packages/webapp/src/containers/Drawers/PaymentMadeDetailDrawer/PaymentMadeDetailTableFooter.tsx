// @ts-nocheck
import React from 'react';
import styled from 'styled-components';

import {
  T,
  TotalLines,
  TotalLineBorderStyle,
  TotalLineTextStyle,
  DualCurrencyTotalLinesView,
} from '@/components';
import { DualCurrencyDetailTotalLine } from '@/components/DualCurrencyTotalLines';
import { usePaymentMadeDetailContext } from './PaymentMadeDetailProvider';

/**
 * Payment made - Details panel - Footer.
 */
export default function PaymentMadeDetailTableFooter() {
  const { paymentMade } = usePaymentMadeDetailContext();

  const paymentDate = paymentMade.payment_date;
  const paymentCurrency = paymentMade.currency_code;

  return (
    <PaymentMadeFooterRoot>
      <PaymentMadeTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'payment_made.details.subtotal'} />}
          value={paymentMade.formatted_amount}
          amount={paymentMade.amount}
          invoiceDate={paymentDate}
          invoiceCurrency={paymentCurrency}
          borderStyle={TotalLineBorderStyle.SingleDark}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'payment_made.details.total'} />}
          value={paymentMade.formatted_amount}
          amount={paymentMade.amount}
          invoiceDate={paymentDate}
          invoiceCurrency={paymentCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyTotalLinesView invoice={paymentMade} />
      </PaymentMadeTotalLines>
    </PaymentMadeFooterRoot>
  );
}

export const PaymentMadeFooterRoot = styled.div``;

export const PaymentMadeTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
