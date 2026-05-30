// @ts-nocheck
import React, { useRef } from 'react';
import intl from 'react-intl-universal';
import { Button, Classes, Intent, ProgressBar, Text } from '@blueprintjs/core';
import { FormattedMessage as T, Icon, If, Stack } from '@/components';
import { AppToaster } from '@/components';

import { getColumnWidth } from '@/utils';
import { useGeneralLedgerContext } from './GeneralLedgerProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import { useCurrentOrganization } from '@/hooks/state';
import {
  useGeneralLedgerSheetXlsxExport,
  useGeneralLedgerSheetCsvExport,
} from '@/hooks/query/FinancialReports/use-general-ledger';

import { Align } from '@/constants';

/**
 * Retrieve the general ledger table columns.
 */
export function useGeneralLedgerTableColumns() {
  const {
    generalLedger: { tableRows },
  } = useGeneralLedgerContext();

  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency ?? '';
  const suffix = baseCurrency ? ` (${baseCurrency})` : '';

  return React.useMemo(
    () => [
      {
        Header: intl.get('date'),
        accessor: 'date',
        className: 'date',
        width: 120,
      },
      {
        Header: intl.get('account_name'),
        accessor: 'name',
        className: 'name',
        textOverview: true,
      },
      {
        Header: intl.get('transaction_type'),
        accessor: 'reference_type_formatted',
        className: 'transaction_type',
        width: 125,
        textOverview: true,
      },
      {
        Header: intl.get('transaction_number'),
        accessor: 'reference_id',
        className: 'transaction_number',
        width: 100,
        textOverview: true,
      },
      {
        Header: intl.get('description'),
        accessor: 'note',
        className: 'description',
        textOverview: true,
      },
      {
        Header: intl.get('credit') + suffix,
        accessor: 'formatted_credit',
        className: 'credit',
        width: getColumnWidth(tableRows, 'formatted_credit', {
          minWidth: 100,
          magicSpacing: 10,
        }),
        textOverview: true,
        align: Align.Right,
      },
      {
        Header: intl.get('debit') + suffix,
        accessor: 'formatted_debit',
        className: 'debit',
        width: getColumnWidth(tableRows, 'formatted_debit', {
          minWidth: 100,
          magicSpacing: 10,
        }),
        textOverview: true,
        align: Align.Right,
      },
      {
        Header: intl.get('amount') + suffix,
        accessor: 'formatted_amount',
        className: 'amount',
        width: getColumnWidth(tableRows, 'formatted_amount', {
          minWidth: 100,
          magicSpacing: 10,
        }),
        textOverview: true,
        align: Align.Right,
      },
      {
        Header: intl.get('running_balance') + suffix,
        accessor: 'formatted_running_balance',
        className: 'running_balance',
        width: getColumnWidth(tableRows, 'formatted_running_balance', {
          minWidth: 100,
          magicSpacing: 10,
        }),
        textOverview: true,
        align: Align.Right,
      },
    ],
    [tableRows, suffix],
  );
}

/**
 * General ledger sheet alerts.
 */
export function GeneralLedgerSheetAlerts() {
  const { generalLedger, isLoading, sheetRefresh } = useGeneralLedgerContext();

  // Handle refetch the report sheet.
  const handleRecalcReport = () => {
    sheetRefresh();
  };
  // Can't display any error if the report is loading.
  if (isLoading) {
    return null;
  }

  return (
    <If condition={generalLedger.meta.is_cost_compute_running}>
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
 * General ledger sheet loading bar.
 */
export function GeneralLedgerSheetExportMenu() {
  const toastKey = useRef(null);
  const commonToastConfig = { isCloseButtonShown: true, timeout: 2000 };
  const { httpQuery } = useGeneralLedgerContext();

  const openProgressToast = (amount: number) => (
    <Stack spacing={8}>
      <Text>The report has been exported successfully.</Text>
      <ProgressBar
        className={amount >= 100 ? '' : ''}
        intent={amount < 100 ? Intent.PRIMARY : Intent.SUCCESS}
        value={amount / 100}
      />
    </Stack>
  );

  const { mutateAsync: xlsxExport } = useGeneralLedgerSheetXlsxExport(httpQuery, {
    onDownloadProgress: (progress: number) => {
      if (!toastKey.current) {
        toastKey.current = AppToaster.show({ message: openProgressToast(progress), ...commonToastConfig });
      } else {
        AppToaster.show({ message: openProgressToast(progress), ...commonToastConfig }, toastKey.current);
      }
      if (progress >= 100) toastKey.current = null;
    },
  });

  const { mutateAsync: csvExport } = useGeneralLedgerSheetCsvExport(httpQuery, {
    onDownloadProgress: (progress: number) => {
      if (!toastKey.current) {
        toastKey.current = AppToaster.show({ message: openProgressToast(progress), ...commonToastConfig });
      } else {
        AppToaster.show({ message: openProgressToast(progress), ...commonToastConfig }, toastKey.current);
      }
      if (progress >= 100) toastKey.current = null;
    },
  });

  return (
    <div>
      <Button minimal text={<T id={'xlsx'} />} onClick={() => xlsxExport({})} />
      <Button minimal text={<T id={'csv'} />} onClick={() => csvExport({})} />
    </div>
  );
}

export function GeneralLedgerSheetLoadingBar() {
  const { isFetching } = useGeneralLedgerContext();

  return (
    <If condition={isFetching}>
      <FinancialLoadingBar />
    </If>
  );
}
