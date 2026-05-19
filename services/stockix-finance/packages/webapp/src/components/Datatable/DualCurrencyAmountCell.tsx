// @ts-nocheck
import React from 'react';
import styled from 'styled-components';
import { Colors } from '@blueprintjs/core';
import { useCurrentOrganization, useSecondaryCurrency } from '@/hooks/state';
import { useLatestExchangeRateForCurrency } from '@/hooks/query/currencies';
import { formattedAmount } from '@/utils';

const isAmountColumn = (id) => id === 'amount' || id === 'total';

/**
 * Datatable cell that renders the primary amount and, when applicable, one
 * or two compact secondary lines beneath it:
 *   1. The base-currency equivalent (when the row is in a foreign currency).
 *   2. The tenant's "secondary currency" equivalent (when configured and
 *      different from the row currency).
 *
 * The secondary-currency line is derived client-side from the latest known
 * exchange rate of the secondary currency (no per-row network calls).
 */
export function DualCurrencyAmountCell({
  value,
  row: { original },
  column: { id },
}) {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency;
  const secondaryCurrency = useSecondaryCurrency();

  const localValue = isAmountColumn(id)
    ? original.formatted_local_amount
    : original.formatted_local_due_amount;

  const rowCurrency = original.currency_code;
  const isForeign = rowCurrency && rowCurrency !== baseCurrency;

  const rowAmount = isAmountColumn(id)
    ? Number(original.amount ?? original.total ?? 0)
    : Number(original.due_amount ?? original.balance ?? original.amount ?? 0);
  const rowExRate = Number(original.exchange_rate ?? 1);

  // Compute base-currency total once, then derive the secondary value from it.
  const baseTotal =
    !rowCurrency || rowCurrency === baseCurrency
      ? rowAmount
      : rowAmount * rowExRate;

  const secondaryRate = useLatestExchangeRateForCurrency(
    secondaryCurrency && secondaryCurrency !== baseCurrency ? secondaryCurrency : null,
  );

  const showSecondary =
    !!secondaryCurrency && secondaryCurrency !== rowCurrency && !!baseTotal &&
    (secondaryCurrency === baseCurrency || (secondaryRate && secondaryRate > 0));

  const secondaryValue =
    secondaryCurrency === baseCurrency
      ? baseTotal
      : showSecondary
        ? baseTotal / secondaryRate
        : null;

  return (
    <CellWrapper>
      <PrimaryAmount className="primary-amount">{value}</PrimaryAmount>
      {isForeign && localValue && (
        <SecondaryAmount className="secondary-amount">{localValue}</SecondaryAmount>
      )}
      {showSecondary && secondaryValue !== null && (
        <SecondaryAmount className="secondary-amount secondary-currency-amount">
          {formattedAmount(secondaryValue, secondaryCurrency)}
        </SecondaryAmount>
      )}
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
