// @ts-nocheck
import React, { useRef } from 'react';
import intl from 'react-intl-universal';
import { Intent, ProgressBar, Text } from '@blueprintjs/core';
import { AppToaster, Stack } from '@/components';
import {
  useJournalSheetXlsxExport,
  useJournalSheetCsvExport,
} from '@/hooks/query/FinancialReports/use-journal-sheet';
import { FormattedMessage as T } from '@/components';
import moment from 'moment';
import { Button } from '@blueprintjs/core';

import { Icon, If, FormattedMessage as T } from '@/components';
import { useJournalSheetContext } from './JournalProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import { useCurrentOrganization } from '@/hooks/state';

import { Align } from '@/constants';

/**
 * Retrieve the journal table columns.
 */
export const useJournalTableColumns = () => {
  const org = useCurrentOrganization();
  const baseCurrency = org?.base_currency ?? '';

  return React.useMemo(
    () => [
      {
        Header: intl.get('date'),
        accessor: (row) =>
          row.date ? moment(row.date).format('YYYY MMM DD') : '',
        className: 'date',
        width: 100,
        textOverview: true,
      },
      {
        Header: intl.get('transaction_type'),
        accessor: 'reference_type_formatted',
        className: 'reference_type_formatted',
        width: 120,
        textOverview: true,
      },
      {
        Header: intl.get('num'),
        accessor: 'transaction_number',
        className: 'reference_id',
        width: 70,
        textOverview: true,
      },
      {
        Header: intl.get('description'),
        accessor: 'note',
        className: 'note',
        textOverview: true,
      },
      {
        Header: intl.get('acc_code'),
        accessor: 'account_code',
        width: 95,
        className: 'account_code',
        textOverview: true,
      },
      {
        Header: intl.get('account'),
        accessor: 'account_name',
        className: 'account_name',
        textOverview: true,
      },
      {
        Header: baseCurrency ? `${intl.get('credit')} (${baseCurrency})` : intl.get('credit'),
        accessor: 'formatted_credit',
        align: Align.Right,
        width: 110,
      },
      {
        Header: baseCurrency ? `${intl.get('debit')} (${baseCurrency})` : intl.get('debit'),
        accessor: 'formatted_debit',
        align: Align.Right,
        width: 110,
      },
      {
        id: 'foreign_currency_code',
        Header: intl.get('currency'),
        accessor: (row) =>
          row.foreign_currency_code !== row.currency_code
            ? row.foreign_currency_code
            : null,
        width: 70,
        className: 'foreign-currency-code',
      },
      {
        id: 'formatted_foreign_credit',
        Header: intl.get('credit_fcy'),
        accessor: (row) => row.formatted_foreign_credit ?? '—',
        align: Align.Right,
        width: 110,
        className: 'foreign-amount',
      },
      {
        id: 'formatted_foreign_debit',
        Header: intl.get('debit_fcy'),
        accessor: (row) => row.formatted_foreign_debit ?? '—',
        align: Align.Right,
        width: 110,
        className: 'foreign-amount',
      },
    ],
    [baseCurrency],
  );
};

/**
 * Journal sheet loading bar.
 */
export function JournalSheetLoadingBar() {
  const { isFetching } = useJournalSheetContext();

  return (
    <If condition={isFetching}>
      <FinancialLoadingBar />
    </If>
  );
}

/**
 * Journal sheet alerts.
 */
export function JournalSheetAlerts() {
  const { isLoading, refetchSheet, journalSheet } = useJournalSheetContext();

  // Handle refetch the report sheet.
  const handleRecalcReport = () => {
    refetchSheet();
  };
  // Can't display any error if the report is loading.
  if (isLoading) {
    return null;
  }

  return (
    <If condition={journalSheet.meta.is_cost_compute_running}>
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

export function JournalSheetExportMenu() {
  const toastKey = useRef(null);
  const commonToastConfig = { isCloseButtonShown: true, timeout: 2000 };
  const { httpQuery } = useJournalSheetContext();

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

  const { mutateAsync: xlsxExport } = useJournalSheetXlsxExport(httpQuery, { onDownloadProgress: onProgress });
  const { mutateAsync: csvExport } = useJournalSheetCsvExport(httpQuery, { onDownloadProgress: onProgress });

  return (
    <div>
      <Button minimal text={<T id={'xlsx'} />} onClick={() => xlsxExport({})} />
      <Button minimal text={<T id={'csv'} />} onClick={() => csvExport({})} />
    </div>
  );
}
