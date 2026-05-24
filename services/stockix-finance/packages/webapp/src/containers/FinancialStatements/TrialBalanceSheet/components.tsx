// @ts-nocheck
import React, { useRef } from 'react';
import intl from 'react-intl-universal';
import {
  Button,
  Classes,
  Intent,
  Menu,
  MenuItem,
  ProgressBar,
  Text,
} from '@blueprintjs/core';
import classNames from 'classnames';

import { Align } from '@/constants';
import { getColumnWidth, formattedAmount } from '@/utils';
import { CellTextSpan } from '@/components/Datatable/Cells';
import { AppToaster, If, Icon, Stack, FormattedMessage as T } from '@/components';
import { useTrialBalanceSheetContext } from './TrialBalanceProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import { useCurrentOrganization, useSecondaryCurrency } from '@/hooks/state';
import { useExchangeRateByDate } from '@/hooks/query/exchangeRates';
import {
  useTrialBalanceSheetCsvExport,
  useTrialBalanceSheetXlsxExport,
} from '@/hooks/query';


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

/**
 * Trial balance sheet export menu.
 */
export const TrialBalanceSheetExportMenu = () => {
  const toastKey = useRef(null);
  const commonToastConfig = {
    isCloseButtonShown: true,
    timeout: 2000,
  };
  const { httpQuery } = useTrialBalanceSheetContext();

  const openProgressToast = (amount: number) => {
    return (
      <Stack spacing={8}>
        <Text>The report has been exported successfully.</Text>
        <ProgressBar
          className={classNames('toast-progress', {
            [Classes.PROGRESS_NO_STRIPES]: amount >= 100,
          })}
          intent={amount < 100 ? Intent.PRIMARY : Intent.SUCCESS}
          value={amount / 100}
        />
      </Stack>
    );
  };

  const { mutateAsync: xlsxExport } = useTrialBalanceSheetXlsxExport(httpQuery, {
    onDownloadProgress: (progress: number) => {
      if (!toastKey.current) {
        toastKey.current = AppToaster.show({
          message: openProgressToast(progress),
          ...commonToastConfig,
        });
      } else {
        AppToaster.show(
          { message: openProgressToast(progress), ...commonToastConfig },
          toastKey.current,
        );
      }
    },
  });

  const { mutateAsync: csvExport } = useTrialBalanceSheetCsvExport(httpQuery, {
    onDownloadProgress: (progress: number) => {
      if (!toastKey.current) {
        toastKey.current = AppToaster.show({
          message: openProgressToast(progress),
          ...commonToastConfig,
        });
      } else {
        AppToaster.show(
          { message: openProgressToast(progress), ...commonToastConfig },
          toastKey.current,
        );
      }
    },
  });

  return (
    <Menu>
      <MenuItem text={'XLSX (Microsoft Excel)'} onClick={() => xlsxExport()} />
      <MenuItem text={'CSV'} onClick={() => csvExport()} />
    </Menu>
  );
};
