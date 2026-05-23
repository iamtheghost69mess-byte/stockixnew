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
import { useEstimateDetailDrawerContext } from './EstimateDetailDrawerProvider';

/**
 * Estimate details panel footer content.
 */
export default function EstimateDetailTableFooter() {
  const { estimate } = useEstimateDetailDrawerContext();

  const estimateDate = estimate.estimate_date;
  const estimateCurrency = estimate.currency_code;

  return (
    <EstimateDetailsFooterRoot>
      <EstimateTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'estimate.details.subtotal'} />}
          value={<FormatNumber value={estimate.amount} />}
          amount={estimate.amount}
          invoiceDate={estimateDate}
          invoiceCurrency={estimateCurrency}
          borderStyle={TotalLineBorderStyle.SingleDark}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'estimate.details.total'} />}
          value={estimate.formatted_amount}
          amount={estimate.amount}
          invoiceDate={estimateDate}
          invoiceCurrency={estimateCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyTotalLinesView invoice={estimate} />
      </EstimateTotalLines>
    </EstimateDetailsFooterRoot>
  );
}

export const EstimateDetailsFooterRoot = styled.div``;

export const EstimateTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
