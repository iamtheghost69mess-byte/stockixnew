// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import { Colors } from '@blueprintjs/core';
import { useCurrentOrganization, useDisplayCurrencies } from '@/hooks/state';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';
import { formattedAmount } from '@/utils';

const isAmountColumn = (id) => id === 'amount' || id === 'total';

/**
 * One secondary-currency row inside a list-view cell.
 * Defined as a sub-component so it can safely call a hook per currency.
 * Uses the latest known exchange rate (no date-specific lookup — acceptable
 * for list views where per-row date accuracy would require N extra requests).
 *
 * Rate convention: 1 base = X display (indirect quote).
 */
function ListViewSecondaryAmount({ baseTotal, currency }) {
  const rate = useLatestExchangeRateForCurrency(currency);
  if (!rate || !baseTotal) return null;
  return <SecondaryAmount>{formattedAmount(baseTotal * rate, currency)}</SecondaryAmount>;
}

/**
 * Datatable cell that renders the primary amount and compact secondary lines:
 *   1. The server-computed base-currency equivalent when the row is in a
 *      foreign currency (formatted_local_amount / formatted_local_due_amount).
 *   2. One line per configured display currency (converted from base via the
 *      latest known exchange rate).
 */
export function DualCurrencyAmountCell({
  value,
  row: { original },
  column: { id },
}) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;
  const displayCurrencies = useDisplayCurrencies();

  const localValue = isAmountColumn(id)
    ? original.formatted_local_amount
    : original.formatted_local_due_amount;

  const rowCurrency = original.currency_code;
  const isForeign = rowCurrency && rowCurrency !== baseCurrency;

  const rowAmount = isAmountColumn(id)
    ? Number(original.amount ?? original.total ?? 0)
    : Number(original.due_amount ?? original.balance ?? original.amount ?? 0);
  const rowExRate = Number(original.exchange_rate ?? 1);

  // Convert row amount to base currency.
  // Convention: 1 base = rowExRate foreign  →  base = foreign / rowExRate
  const baseTotal = isForeign && rowExRate > 0 ? rowAmount / rowExRate : rowAmount;

  // useDisplayCurrencies already excludes base; only additionally filter the row currency
  const displayToShow = displayCurrencies.filter((c) => c !== rowCurrency);

  return (
    <CellWrapper>
      <PrimaryAmount className="primary-amount">{value}</PrimaryAmount>
      {isForeign && localValue && (
        <SecondaryAmount className="secondary-amount">{localValue}</SecondaryAmount>
      )}
      {displayToShow.map((dc) => (
        <ListViewSecondaryAmount key={dc} baseTotal={baseTotal} currency={dc} />
      ))}
    </CellWrapper>
  );
}

const CellWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  line-height: 1.2;
`;

const PrimaryAmount = styled.span`
  font-weight: 600;
  display: block;
`;

const SecondaryAmount = styled.span`
  font-size: 11px;
  color: ${Colors.GRAY2};
  font-style: italic;
  display: block;
  margin-top: 1px;
`;
