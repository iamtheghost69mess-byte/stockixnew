// @ts-nocheck
import React, { useEffect } from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import { Colors, Intent, Tag } from '@blueprintjs/core';
import { FormattedMessage as T, Icon } from '@/components';
import { CurrenciesProvider, useCurrenciesContext } from './CurrenciesProvider';
import CurrenciesDataTable from './CurrenciesDataTable';
import CurrenciesActionsBar from './CurrenciesActionsBar';
import CurrencyExchangeRatesSection from './CurrencyExchangeRatesSection';
import withDashboardActions from '@/containers/Dashboard/withDashboardActions';
import { compose } from '@/utils';

/**
 * Stats bar: base currency, active count, missing rates warning.
 */
function CurrenciesStatsBar() {
  const { currencies, baseCurrency, missingRateCurrencies } = useCurrenciesContext();

  const total = currencies?.length ?? 0;
  const missingCount = missingRateCurrencies?.length ?? 0;

  return (
    <StatsBar>
      <StatItem>
        <StatLabel>
          <T id={'base_currency'} />
        </StatLabel>
        <StatValue>
          {baseCurrency
            ? `${baseCurrency.currency_code} — ${baseCurrency.currency_name}`
            : '—'}
        </StatValue>
      </StatItem>

      <StatDivider />

      <StatItem>
        <StatLabel>
          <T id={'active_currencies'} />
        </StatLabel>
        <StatValue>{total}</StatValue>
      </StatItem>

      {missingCount > 0 && (
        <>
          <StatDivider />
          <StatItem>
            <MissingRatesWarning>
              <Icon icon="warning-sign" iconSize={13} intent={Intent.WARNING} />
              <span>
                {intl.get('currencies_missing_rates_warning', {
                  count: missingCount,
                })}
              </span>
            </MissingRatesWarning>
          </StatItem>
        </>
      )}
    </StatsBar>
  );
}

/**
 * Currencies list with stats header, currency table, and exchange rate history.
 */
function CurrenciesListInner({ changePreferencesPageTitle }) {
  useEffect(() => {
    changePreferencesPageTitle(intl.get('currencies'));
  }, [changePreferencesPageTitle]);

  return (
    <CurrenciesProvider>
      <CurrenciesActionsBar />
      <ListRoot>
        <CurrenciesStatsBar />
        <SectionLabel>
          <T id={'currencies'} />
        </SectionLabel>
        <CurrenciesDataTable />
        <CurrencyExchangeRatesSection />
      </ListRoot>
    </CurrenciesProvider>
  );
}

export default compose(withDashboardActions)(CurrenciesListInner);

// ─── Styles ──────────────────────────────────────────────────────────────────

const ListRoot = styled.div`
  padding: 0 0 32px;
`;

const StatsBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  padding: 12px 20px;
  background: ${Colors.LIGHT_GRAY5};
  border-bottom: 1px solid ${Colors.LIGHT_GRAY3};
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 20px;

  &:first-child {
    padding-left: 0;
  }
`;

const StatLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${Colors.GRAY2};
`;

const StatValue = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${Colors.DARK_GRAY1};
`;

const StatDivider = styled.div`
  width: 1px;
  height: 32px;
  background: ${Colors.LIGHT_GRAY3};
  margin: 0 4px;
`;

const MissingRatesWarning = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${Colors.ORANGE3};
  font-weight: 500;
`;

const SectionLabel = styled.h4`
  margin: 16px 20px 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${Colors.GRAY2};
`;
