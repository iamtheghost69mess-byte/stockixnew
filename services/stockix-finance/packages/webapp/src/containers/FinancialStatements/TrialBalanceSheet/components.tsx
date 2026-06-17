// @ts-nocheck
import React, { useRef } from 'react';
import intl from 'react-intl-universal';
import { Button, Intent, ProgressBar, Text } from '@blueprintjs/core';

import { Align } from '@/constants';
import { getColumnWidth, formattedAmount } from '@/utils';
import { CellTextSpan } from '@/components/Datatable/Cells';
import { If, Icon, FormattedMessage as T, AppToaster, Stack } from '@/components';
import { useTrialBalanceSheetContext } from './TrialBalanceProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import { useCurrentOrganization, useSecondaryCurrency } from '@/hooks/state';
import { useExchangeRateByDate } from '@/hooks/query/exchangeRates';
import {
  useTrialBalanceSheetXlsxExport,
  useTrialBalanceSheetCsvExport,
} from '@/hooks/query/FinancialReports/use-trial-balance-sheet';


/**
 * Cell that converts a raw base-currency amount to the secondary currency
 * using the exchange rate for the report's end date.
 */
function SecondaryCurrencyAmountCell({ value, column }) {
  const { data: rateRow } = useExchangeRateByDate(
    column.secondaryCurrency,
    column.reportDate,
  );
  const rate = rateRow?.exchange_rate;
  if (!rate || value == null) return <CellTextSpan>—</CellTextSpan>;
  return (
    <CellTextSpan>
      {formattedAmount(value * rate, column.secondaryCurrency)}
    </CellTextSpan>
  );
}

/**
 * Retrieve trial balance sheet table columns.
 */
export const useTrialBalanceTableColumns = () => {
  const {
    trialBalanceSheet: { tableRows, query },
  } = useTrialBalanceSheetContext();

  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency ?? '';
  const suffix = baseCurrency ? ` (${baseCurrency})` : '';
  const secondaryCurrency = useSecondaryCurrency();
  const reportDate = query?.to_date;

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
      ...(secondaryCurrency
        ? [
            {
              Header: `≈ ${secondaryCurrency} ${intl.get('credit')}`,
              Cell: SecondaryCurrencyAmountCell,
              accessor: 'credit',
              width: getColumnWidth(tableRows, 'credit', { minWidth: 140 }),
              align: Align.Right,
              secondaryCurrency,
              reportDate,
              disableSortBy: true,
            },
          ]
        : []),
      {
        Header: intl.get('debit') + suffix,
        Cell: CellTextSpan,
        accessor: 'formatted_debit',
        width: getColumnWidth(tableRows, 'debit', { minWidth: 140 }),
        textOverview: true,
        align: Align.Right,
      },
      ...(secondaryCurrency
        ? [
            {
              Header: `≈ ${secondaryCurrency} ${intl.get('debit')}`,
              Cell: SecondaryCurrencyAmountCell,
              accessor: 'debit',
              width: getColumnWidth(tableRows, 'debit', { minWidth: 140 }),
              align: Align.Right,
              secondaryCurrency,
              reportDate,
              disableSortBy: true,
            },
          ]
        : []),
      {
        Header: intl.get('balance') + suffix,
        Cell: CellTextSpan,
        accessor: 'formatted_balance',
        className: 'balance',
        width: getColumnWidth(tableRows, 'balance', { minWidth: 140 }),
        textOverview: true,
        align: Align.Right,
      },
      ...(secondaryCurrency
        ? [
            {
              Header: `≈ ${secondaryCurrency} ${intl.get('balance')}`,
              Cell: SecondaryCurrencyAmountCell,
              accessor: 'balance',
              width: getColumnWidth(tableRows, 'balance', { minWidth: 140 }),
              align: Align.Right,
              secondaryCurrency,
              reportDate,
              disableSortBy: true,
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableRows, suffix, secondaryCurrency, reportDate],
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
    trialBalanceSheet,
    isLoading,
    refetchSheet,
  } = useTrialBalanceSheetContext();

  // Handle refetch the sheet.
  const handleRecalcReport = () => {
    refetchSheet();
  };
  // Can't display any error if the report is loading or not yet fetched.
  if (isLoading || !trialBalanceSheet?.meta) {
    return null;
  }

  return (
    <If condition={trialBalanceSheet.meta.is_cost_compute_running}>
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

export function TrialBalanceSheetExportMenu() {
  const toastKey = useRef(null);
  const commonToastConfig = { isCloseButtonShown: true, timeout: 2000 };
  const { httpQuery } = useTrialBalanceSheetContext();

  const openProgressToast = (amount) => (
    <Stack spacing={8}>
      <Text>The report has been exported successfully.</Text>
      <ProgressBar intent={amount < 100 ? Intent.PRIMARY : Intent.SUCCESS} value={amount / 100} />
    </Stack>
  );

  const onProgress = (progress) => {
    if (!toastKey.current) {
      toastKey.current = AppToaster.show({ message: openProgressToast(progress), ...commonToastConfig });
    } else {
      AppToaster.show({ message: openProgressToast(progress), ...commonToastConfig }, toastKey.current);
    }
    if (progress >= 100) toastKey.current = null;
  };

  const { mutateAsync: xlsxExport } = useTrialBalanceSheetXlsxExport(httpQuery, { onDownloadProgress: onProgress });
  const { mutateAsync: csvExport } = useTrialBalanceSheetCsvExport(httpQuery, { onDownloadProgress: onProgress });

  return (
    <div>
      <Button minimal text={<T id={'xlsx'} />} onClick={() => xlsxExport({})} />
      <Button minimal text={<T id={'csv'} />} onClick={() => csvExport({})} />
    </div>
  );
}
