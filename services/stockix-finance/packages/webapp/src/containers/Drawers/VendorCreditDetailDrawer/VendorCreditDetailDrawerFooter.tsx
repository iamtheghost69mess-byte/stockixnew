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
import { useVendorCreditDetailDrawerContext } from './VendorCreditDetailDrawerProvider';

/**
 * Vendor Credit detail panel footer.
 */
export default function VendorCreditDetailDrawerFooter() {
  const { vendorCredit } = useVendorCreditDetailDrawerContext();

  const vendorCreditDate = vendorCredit.vendor_credit_date;
  const vendorCreditCurrency = vendorCredit.currency_code;

  return (
    <VendorCreditFooterRoot>
      <VendorCreditTotalLines labelColWidth={'180px'} amountColWidth={'180px'}>
        <DualCurrencyDetailTotalLine
          title={<T id={'vendor_credit.drawer.label_subtotal'} />}
          value={<FormatNumber value={vendorCredit.amount} />}
          amount={vendorCredit.amount}
          invoiceDate={vendorCreditDate}
          invoiceCurrency={vendorCreditCurrency}
          borderStyle={TotalLineBorderStyle.SingleDark}
        />
        <DualCurrencyDetailTotalLine
          title={<T id={'vendor_credit.drawer.label_total'} />}
          value={vendorCredit.formatted_amount}
          amount={vendorCredit.amount}
          invoiceDate={vendorCreditDate}
          invoiceCurrency={vendorCreditCurrency}
          borderStyle={TotalLineBorderStyle.DoubleDark}
          textStyle={TotalLineTextStyle.Bold}
        />
        <DualCurrencyTotalLinesView invoice={vendorCredit} />
      </VendorCreditTotalLines>
    </VendorCreditFooterRoot>
  );
}

export const VendorCreditFooterRoot = styled.div``;

export const VendorCreditTotalLines = styled(TotalLines)`
  margin-left: auto;
`;
