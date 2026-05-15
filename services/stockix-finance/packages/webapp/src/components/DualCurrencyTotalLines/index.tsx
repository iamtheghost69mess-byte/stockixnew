// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import { Colors } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { TotalLine, TotalLineBorderStyle } from '../TotalLines';
import { useExchangeRateByDate } from '@/hooks/query/exchangeRates';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';
import { useCurrentOrganization, useSecondaryCurrency } from '@/hooks/state';
import { formattedAmount } from '@/utils';

/**
 * Renders one secondary currency row via a rate-lookup (display currencies).
 */
function DualCurrencyTotalLineItem({ totalInBase, date, displayCurrency }) {
  const { data: rateRow } = useExchangeRateByDate(displayCurrency, date);
  const rate = rateRow?.exchange_rate;

  if (!rate) return null;

  const converted = totalInBase / rate;

  return (
    <SecondaryTotalLine
      title={<SecondaryLabel>≈ {displayCurrency}</SecondaryLabel>}
      value={<SecondaryAmount>{formattedAmount(converted, displayCurrency)}</SecondaryAmount>}
      borderStyle={TotalLineBorderStyle.None}
    />
  );
}

/**
 * Renders the base-currency equivalent row (no rate lookup needed — totalInBase
 * is already expressed in base currency).
 */
function BaseCurrencyTotalLineItem({ totalInBase, baseCurrency }) {
  return (
    <SecondaryTotalLine
      title={<SecondaryLabel>≈ {baseCurrency}</SecondaryLabel>}
      value={<SecondaryAmount>{formattedAmount(totalInBase, baseCurrency)}</SecondaryAmount>}
      borderStyle={TotalLineBorderStyle.None}
    />
  );
}

/**
 * Drop-in below any TotalLine block.
 *
 * Renders, in order, any of the following rows that apply:
 *  - Base currency equivalent (when the form is in a foreign currency).
 *  - The tenant's "secondary currency" (when set and different from the form currency).
 *  - One row per configured display currency that differs from both the form
 *    and base currency.
 *
 * Must be rendered inside a Formik form (reads currency_code, date,
 * exchange_rate from context).
 */
export function DualCurrencyTotalLines({ total }) {
  const { values } = useFormikContext();
  const org = useCurrentOrganization();
  const secondaryCurrency = useSecondaryCurrency();

  const baseCurrency = org?.base_currency;
  const displayCurrencies: string[] = org?.display_currencies ?? [];
  const formCurrency = values.currency_code;
  const formDate =
    values.invoice_date ??
    values.bill_date ??
    values.payment_date ??
    values.receipt_date ??
    values.estimate_date ??
    values.credit_note_date ??
    values.vendor_credit_date ??
    values.date;
  const formExchangeRate = values.exchange_rate ?? 1;

  // Nothing to show when date is missing.
  if (!formDate) return null;

  // Convert total to base currency.
  const totalInBase =
    !formCurrency || formCurrency === baseCurrency
      ? (total || 0)
      : (total || 0) * formExchangeRate;

  // Show base-currency row only when the form is in a foreign currency.
  const showBase = !!(formCurrency && baseCurrency && formCurrency !== baseCurrency);

  // Secondary currency: render whenever it's set and differs from the form currency.
  // (When the form is in the secondary currency itself, the primary line already
  // shows it — no need to duplicate.)
  const showSecondary = !!(
    secondaryCurrency && formCurrency && secondaryCurrency !== formCurrency
  );

  // Display currencies to show via rate-lookup (skip base, form, and secondary
  // currency to avoid double-rendering).
  const displayToShow = (Array.isArray(displayCurrencies) ? displayCurrencies : [])
    .filter(
      (c) => c !== formCurrency && c !== baseCurrency && c !== secondaryCurrency,
    );

  if (!showBase && !showSecondary && !displayToShow.length) return null;
  return (
    <>
      {showBase && (
        <BaseCurrencyTotalLineItem totalInBase={totalInBase} baseCurrency={baseCurrency} />
      )}
      {showSecondary && (
        secondaryCurrency === baseCurrency ? (
          // Base equivalent already covers this when applicable; otherwise show
          // base-equivalent as the secondary too.
          !showBase && (
            <BaseCurrencyTotalLineItem
              totalInBase={totalInBase}
              baseCurrency={baseCurrency}
            />
          )
        ) : (
          <DualCurrencyTotalLineItem
            totalInBase={totalInBase}
            date={formDate}
            displayCurrency={secondaryCurrency}
          />
        )
      )}
      {displayToShow.map((dc) => (
        <DualCurrencyTotalLineItem
          key={dc}
          totalInBase={totalInBase}
          date={formDate}
          displayCurrency={dc}
        />
      ))}
    </>
  );
}

/**
 * Computes a base-currency total from a stored amount + the entity's currency,
 * exchange rate, and the tenant's base currency. Returns null when the result
 * isn't reliable (missing inputs).
 */
function deriveBaseTotal(entity, baseCurrency) {
  const amount = Number(entity?.amount ?? entity?.total ?? entity?.balance ?? 0);
  if (!amount && amount !== 0) return null;

  const currency = entity?.currency_code;
  const exRate = Number(entity?.exchange_rate ?? 1);

  if (!currency || currency === baseCurrency) return amount;
  if (!exRate || Number.isNaN(exRate)) return null;
  return amount * exRate;
}

/**
 * View-mode secondary rows for an entity that already has formatted local
 * (base-currency) amounts on it.
 *
 * Shows:
 *  - The base-currency equivalent when the entity is in a foreign currency
 *  - The configured "secondary currency" when set and different from the entity's currency.
 *  - The configured "display currencies" when set and different from the entity's currency.
 */
export function DualCurrencyTotalLinesView({
  invoice,
  amountField = 'formatted_local_amount',
  dueAmountField = 'formatted_local_due_amount',
}) {
  const org = useCurrentOrganization();
  const secondaryCurrency = useSecondaryCurrency();
  const baseCurrency = org?.base_currency;
  const displayCurrencies = org?.display_currencies ?? [];

  const isForeign = invoice.currency_code && invoice.currency_code !== baseCurrency;
  const localAmount = invoice[amountField];
  const localDueAmount = invoice[dueAmountField];

  // Latest rate from the cached currencies list — no extra HTTP calls.
  const secondaryRate = useLatestExchangeRateForCurrency(
    secondaryCurrency && secondaryCurrency !== baseCurrency ? secondaryCurrency : null,
  );

  const showBase = isForeign && (localAmount || localDueAmount);

  const baseTotal = deriveBaseTotal(invoice, baseCurrency);
  const showSecondary =
    !!secondaryCurrency &&
    secondaryCurrency !== invoice.currency_code &&
    baseTotal !== null &&
    (secondaryCurrency === baseCurrency || (secondaryRate && secondaryRate > 0));

  const secondaryAmount =
    secondaryCurrency === baseCurrency
      ? baseTotal
      : showSecondary
        ? baseTotal / secondaryRate
        : null;

  const displayToShow = (Array.isArray(displayCurrencies) ? displayCurrencies : [])
    .filter(
      (c) => c !== invoice.currency_code && c !== baseCurrency && c !== secondaryCurrency,
    );

  const dateToUse =
    invoice.invoice_date ??
    invoice.bill_date ??
    invoice.payment_date ??
    invoice.receipt_date ??
    invoice.estimate_date ??
    invoice.credit_note_date ??
    invoice.vendor_credit_date ??
    invoice.date;

  if (!showBase && !showSecondary && !displayToShow.length) return null;

  return (
    <>
      {showBase && localAmount && (
        <SecondaryTotalLine
          title={<SecondaryLabel>≈ {baseCurrency}</SecondaryLabel>}
          value={<SecondaryAmount>{localAmount}</SecondaryAmount>}
          borderStyle={TotalLineBorderStyle.None}
        />
      )}
      {showBase && localDueAmount && localDueAmount !== localAmount && (
        <SecondaryTotalLine
          title={<SecondaryLabel>≈ {baseCurrency}</SecondaryLabel>}
          value={<SecondaryAmount>{localDueAmount}</SecondaryAmount>}
          borderStyle={TotalLineBorderStyle.None}
        />
      )}
      {showSecondary && secondaryAmount !== null && (
        <SecondaryTotalLine
          title={<SecondaryLabel>≈ {secondaryCurrency}</SecondaryLabel>}
          value={
            <SecondaryAmount>
              {formattedAmount(secondaryAmount, secondaryCurrency)}
            </SecondaryAmount>
          }
          borderStyle={TotalLineBorderStyle.None}
        />
      )}
      {baseTotal !== null && displayToShow.map((dc) => (
        <DualCurrencyTotalLineItem
          key={dc}
          totalInBase={baseTotal}
          date={dateToUse}
          displayCurrency={dc}
        />
      ))}
    </>
  );
}

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
