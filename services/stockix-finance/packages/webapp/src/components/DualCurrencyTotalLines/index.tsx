// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import { Colors, Tooltip } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { TotalLine, TotalLineBorderStyle } from '../TotalLines';
import { useExchangeRateByDate } from '@/hooks/query/exchangeRates';
import { useCurrentOrganization } from '@/hooks/state';
import { formattedAmount } from '@/utils';

// ─── Footer row helpers ───────────────────────────────────────────────────────

/**
 * Renders one secondary-currency row for a given base-currency amount.
 *
 * Exchange rate convention: "1 base = X foreign" (Indirect Quote).
 * Conversion: foreignAmount = baseAmount × rate
 */
function DisplayCurrencyLineItem({ amount, currency, date }) {
  const { data: rateRow } = useExchangeRateByDate(currency, date);
  const rate = rateRow?.exchange_rate;

  if (!rate || !amount) return null;

  return (
    <SecondaryTotalLine
      title={<SecondaryLabel>≈ {currency}</SecondaryLabel>}
      value={<SecondaryAmount>{formattedAmount(amount * rate, currency)}</SecondaryAmount>}
      borderStyle={TotalLineBorderStyle.None}
    />
  );
}

function useDisplayCurrencies(formCurrency) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;
  const all = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  return all.filter((c) => c !== formCurrency && c !== baseCurrency);
}

function useFormTransactionDate() {
  const { values } = useFormikContext();
  return (
    values.invoice_date ??
    values.bill_date ??
    values.payment_date ??
    values.receipt_date ??
    values.estimate_date ??
    values.credit_note_date ??
    values.vendor_credit_date ??
    values.date
  );
}

// ─── Form footer components ───────────────────────────────────────────────────

/**
 * Drop-in replacement for <TotalLine> that appends secondary-currency rows
 * for every configured display currency. Must be inside a Formik form.
 */
export function DualCurrencyFormTotalLine({ amount, ...totalLineProps }) {
  const { values } = useFormikContext();
  const formCurrency = values.currency_code;
  const date = useFormTransactionDate();
  const displayToShow = useDisplayCurrencies(formCurrency);

  return (
    <>
      <TotalLine {...totalLineProps} />
      {amount && date &&
        displayToShow.map((dc) => (
          <DisplayCurrencyLineItem key={dc} amount={amount} currency={dc} date={date} />
        ))}
    </>
  );
}

/**
 * Read-only variant for detail drawers. No Formik required.
 */
export function DualCurrencyDetailTotalLine({
  amount,
  invoiceDate,
  invoiceCurrency,
  ...totalLineProps
}) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;
  const all = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const displayToShow = all.filter((c) => c !== invoiceCurrency && c !== baseCurrency);

  return (
    <>
      <TotalLine {...totalLineProps} />
      {amount && invoiceDate &&
        displayToShow.map((dc) => (
          <DisplayCurrencyLineItem key={dc} amount={amount} currency={dc} date={invoiceDate} />
        ))}
    </>
  );
}

/**
 * Legacy block-level secondary currency (still used by DualCurrencyTotalLines).
 * Prefer DualCurrencyFormTotalLine for new code.
 */
export function DualCurrencyTotalLines({ total }) {
  const { values } = useFormikContext();
  const org = useCurrentOrganization();

  const baseCurrency = org?.base_currency;
  const formCurrency = values.currency_code;
  const date = useFormTransactionDate();
  const formExchangeRate = values.exchange_rate ?? 1;

  if (!total || !date) return null;

  const totalInBase =
    !formCurrency || formCurrency === baseCurrency
      ? total
      : total / formExchangeRate;

  const showBase = !!(formCurrency && baseCurrency && formCurrency !== baseCurrency);
  const displayCurrencies = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const displayToShow = displayCurrencies.filter(
    (c) => c !== formCurrency && c !== baseCurrency,
  );

  if (!showBase && !displayToShow.length) return null;

  return (
    <>
      {showBase && (
        <SecondaryTotalLine
          title={<SecondaryLabel>≈ {baseCurrency}</SecondaryLabel>}
          value={<SecondaryAmount>{formattedAmount(totalInBase, baseCurrency)}</SecondaryAmount>}
          borderStyle={TotalLineBorderStyle.None}
        />
      )}
      {displayToShow.map((dc) => (
        <DisplayCurrencyLineItem key={dc} amount={totalInBase} currency={dc} date={date} />
      ))}
    </>
  );
}

/**
 * View-mode footer rows for detail drawers.
 * For foreign-currency documents, shows the server-computed base-currency total.
 */
export function DualCurrencyTotalLinesView({
  invoice,
  amountField = 'formatted_local_amount',
  dueAmountField = 'formatted_local_due_amount',
}) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;

  const isForeign = invoice.currency_code && invoice.currency_code !== baseCurrency;
  const localAmount = invoice[amountField];
  const localDueAmount = invoice[dueAmountField];

  if (!isForeign || (!localAmount && !localDueAmount)) return null;

  return (
    <>
      {localAmount && (
        <SecondaryTotalLine
          title={<SecondaryLabel>≈ {baseCurrency}</SecondaryLabel>}
          value={<SecondaryAmount>{localAmount}</SecondaryAmount>}
          borderStyle={TotalLineBorderStyle.None}
        />
      )}
      {localDueAmount && localDueAmount !== localAmount && (
        <SecondaryTotalLine
          title={<SecondaryLabel>≈ {baseCurrency}</SecondaryLabel>}
          value={<SecondaryAmount>{localDueAmount}</SecondaryAmount>}
          borderStyle={TotalLineBorderStyle.None}
        />
      )}
    </>
  );
}

// ─── Shared table cell components (for React Table column defs) ──────────────
//
// These are proper React components (capital letter) so hooks work inside
// React Table. Pass invoiceCurrency and invoiceDate on the column definition
// object; they are accessible via column.invoiceCurrency / column.invoiceDate.

/**
 * One stacked secondary-currency amount inside a table cell.
 * Shows a tooltip when no exchange rate is configured for the given date.
 */
export function DualCurrencyTableCellAmount({ baseAmount, currency, date }) {
  const { data: rateRow } = useExchangeRateByDate(currency, date);
  const rate = rateRow?.exchange_rate;

  if (!rate) {
    return (
      <Tooltip content={`No ${currency} rate for this date`} placement="top">
        <SecondaryTableValue style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
          —
        </SecondaryTableValue>
      </Tooltip>
    );
  }
  return <SecondaryTableValue>{formattedAmount(baseAmount * rate, currency)}</SecondaryTableValue>;
}

/**
 * Currency column cell — stacks "USD (base)" label and each display-currency
 * code below it, giving the user a clear header for the stacked value cells.
 */
export function DualCurrencyTableCurrencyCell({ column }) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;
  const displayCurrencies = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const { invoiceCurrency } = column;
  const toShow = displayCurrencies.filter((c) => c !== invoiceCurrency && c !== baseCurrency);

  if (!toShow.length) return <span>{baseCurrency}</span>;

  return (
    <TableCurrencyStack>
      <TableBaseValue>{baseCurrency} (base)</TableBaseValue>
      {toShow.map((dc) => (
        <SecondaryTableValue key={dc}>{dc}</SecondaryTableValue>
      ))}
    </TableCurrencyStack>
  );
}

/**
 * React Table cell for editable form entry tables (Invoice, Bill, Estimate, etc.).
 * Renders the row amount in the form currency, then stacked secondary-currency
 * conversions for each configured display currency.
 * Must render inside a Formik <Form> (uses useFormikContext and useFormTransactionDate).
 */
export function DualCurrencyFormTotalCell({ payload: { currencyCode }, value }) {
  const date = useFormTransactionDate();
  const displayToShow = useDisplayCurrencies(currencyCode);

  if (!displayToShow.length || !value || !date) {
    return <span>{formattedAmount(value, currencyCode, { noZero: true })}</span>;
  }

  return (
    <TableCurrencyStack>
      <TableBaseValue>{formattedAmount(value, currencyCode, { noZero: true })}</TableBaseValue>
      {displayToShow.map((dc) => (
        <DualCurrencyTableCellAmount key={dc} baseAmount={value} currency={dc} date={date} />
      ))}
    </TableCurrencyStack>
  );
}

/**
 * Value cell — renders the base-currency value on top, then one stacked row
 * per display currency beneath it.
 */
export function DualCurrencyTableValueCell({ value, column }) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;
  const displayCurrencies = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const { invoiceCurrency, invoiceDate } = column;
  const toShow = displayCurrencies.filter((c) => c !== invoiceCurrency && c !== baseCurrency);

  if (!toShow.length) {
    return <span>{formattedAmount(value, invoiceCurrency || baseCurrency)}</span>;
  }

  return (
    <TableCurrencyStack>
      <TableBaseValue>{formattedAmount(value, invoiceCurrency || baseCurrency)}</TableBaseValue>
      {toShow.map((dc) => (
        <DualCurrencyTableCellAmount
          key={dc}
          baseAmount={value}
          currency={dc}
          date={invoiceDate}
        />
      ))}
    </TableCurrencyStack>
  );
}

// ─── Styled components ────────────────────────────────────────────────────────

const SecondaryTotalLine = styled(TotalLine)`
  .title,
  .amount {
    border-bottom-color: transparent !important;
    padding-top: 2px;
    padding-bottom: 2px;
  }
`;

const SecondaryLabel = styled.span`
  font-size: 11px;
  color: ${Colors.GRAY2};
  font-style: italic;
`;

const SecondaryAmount = styled.span`
  font-size: 11px;
  color: ${Colors.GRAY2};
  font-variant-numeric: tabular-nums;
`;

export const TableCurrencyStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const TableBaseValue = styled.span`
  font-size: 13px;
`;

export const SecondaryTableValue = styled.span`
  font-size: 11px;
  color: ${Colors.GRAY2};
  font-variant-numeric: tabular-nums;
`;
