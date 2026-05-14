// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { Button } from '@blueprintjs/core';

import { Align } from '@/constants';
import { getColumnWidth } from '@/utils';
import { CellTextSpan } from '@/components/Datatable/Cells';
import { If, Icon, FormattedMessage as T } from '@/components';
import { useTrialBalanceSheetContext } from './TrialBalanceProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import { useCurrentOrganization } from '@/hooks/state';


/**
 * Retrieve trial balance sheet table columns.
 */
export const useTrialBalanceTableColumns = () => {
  const {
    trialBalanceSheet: { tableRows },
  } = useTrialBalanceSheetContext();

  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency ?? '';
  const suffix = baseCurrency ? ` (${baseCurrency})` : '';

  return React.useMemo(
    () => [
      {
        Header: intl.get('account_name'),
        accessor: (row) => (row.code ? `${row.name} - ${row.code}` : row.name),
        className: 'name',
        width: 350,
        textOverview: true,
      },
      {
        Header: intl.get('credit') + suffix,
        Cell: CellTextSpan,
        accessor: 'formatted_credit',
        className: 'credit',
        width: getColumnWidth(tableRows, 'credit', { minWidth: 140 }),
        textOverview: true,
        align: Align.Right,
      },
      {
        Header: intl.get('debit') + suffix,
        Cell: CellTextSpan,
        accessor: 'formatted_debit',
        width: getColumnWidth(tableRows, 'debit', { minWidth: 140 }),
        textOverview: true,
        align: Align.Right,
      },
      {
        Header: intl.get('balance') + suffix,
        Cell: CellTextSpan,
        accessor: 'formatted_balance',
        className: 'balance',
        width: getColumnWidth(tableRows, 'balance', { minWidth: 140 }),
        textOverview: true,
        align: Align.Right,
      },
    ],
    [tableRows, suffix],
  );
};

/**
 * Trial balance sheet progress loading bar.
 */
export function TrialBalanceSheetLoadingBar() {
  const { isFetching } = useTrialBalanceSheetContext();

  return (
    <If condition={isFetching}>
      <FinancialLoadingBar />
    </If>
  );
}

/**
 * Trial balance sheet alerts.
 */
export function TrialBalanceSheetAlerts() {
  const {
    trialBalanceSheet: { meta },
    isLoading,
    refetchSheet,
  } = useTrialBalanceSheetContext();

  // Handle refetch the sheet.
  const handleRecalcReport = () => {
    refetchSheet();
  };
  // Can't display any error if the report is loading.
  if (isLoading) {
    return null;
  }

  return (
    <If condition={meta.is_cost_compute_running}>
      <div class="alert-compute-running">
        <Icon icon="info-block" iconSize={12} />
        <T id={'just_a_moment_we_re_calculating_your_cost_transactions'} />

        <Button onClick={handleRecalcReport} minimal={true} small={true}>
          <T id={'refresh'} />
        </Button>
      </div>
    </If>
  );
}
