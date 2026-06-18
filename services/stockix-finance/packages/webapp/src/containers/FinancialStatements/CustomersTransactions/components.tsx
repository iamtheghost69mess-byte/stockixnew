// @ts-nocheck
import React, { useRef } from 'react';
import intl from 'react-intl-universal';
import { AppToaster, If, Stack } from '@/components';
import { Align } from '@/constants';
import { getColumnWidth } from '@/utils';
import { useCustomersTransactionsContext } from './CustomersTransactionsProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import {
  Classes,
  Intent,
  Menu,
  MenuItem,
  ProgressBar,
  Text,
} from '@blueprintjs/core';
import {
  useCustomersTransactionsCsvExport,
  useCustomersTransactionsXlsxExport,
} from '@/hooks/query';
import classNames from 'classnames';

const getTableCellValueAccessor = (index) => `cells[${index}].value`;

const staticColumnMap = {
  customer_name: (column, tableRows) => ({
    Header: intl.get('customer_name'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'customer_name',
  }),
  account_name: (column) => ({
    Header: intl.get('account_name'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'name',
    textOverview: true,
    width: 170,
  }),
  reference_type: (column) => ({
    Header: intl.get('reference_type'),
    accessor: getTableCellValueAccessor(column.cell_index),
    width: 120,
    textOverview: true,
  }),
  transaction_type: (column) => ({
    Header: intl.get('transaction_type'),
    accessor: getTableCellValueAccessor(column.cell_index),
    width: 120,
    textOverview: true,
  }),
  credit: (column, tableRows) => ({
    Header: intl.get('credit'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'credit',
    width: getColumnWidth(tableRows, getTableCellValueAccessor(column.cell_index), { minWidth: 100, magicSpacing: 12 }),
    align: Align.Right,
    money: true,
  }),
  debit: (column, tableRows) => ({
    Header: intl.get('debit'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'debit',
    width: getColumnWidth(tableRows, getTableCellValueAccessor(column.cell_index), { minWidth: 100, magicSpacing: 12 }),
    align: Align.Right,
    money: true,
  }),
  running_balance: (column, tableRows) => ({
    Header: intl.get('running_balance'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'running_balance',
    width: getColumnWidth(tableRows, getTableCellValueAccessor(column.cell_index), { minWidth: 120, magicSpacing: 12 }),
    align: Align.Right,
    money: true,
  }),
};

const mapTransactionsColumn = (column, tableRows) => {
  const builder = staticColumnMap[column.key];
  if (builder) return builder(column, tableRows);
  // Secondary currency and any future server-driven columns
  return {
    Header: column.label,
    accessor: getTableCellValueAccessor(column.cell_index),
    className: column.key,
    align: Align.Right,
    money: true,
    width: getColumnWidth(tableRows, getTableCellValueAccessor(column.cell_index), { minWidth: 120 }),
  };
};

/**
 * Retrieve customers transactions columns — driven by server-provided column list
 * so secondary currency columns are rendered automatically when secondaryCurrency is set.
 */
export const useCustomersTransactionsColumns = () => {
  const {
    customersTransactions: { tableRows, tableColumns },
  } = useCustomersTransactionsContext();

  return React.useMemo(
    () => (tableColumns || []).map((col) => mapTransactionsColumn(col, tableRows)),
    [tableRows, tableColumns],
  );
};

/**
 * customers transactions loading bar.
 */
export function CustomersTransactionsLoadingBar() {
  const { isCustomersTransactionsFetching } = useCustomersTransactionsContext();

  return (
    <If condition={isCustomersTransactionsFetching}>
      <FinancialLoadingBar />
    </If>
  );
}

/**
 * Customers transactions export menu.
 * @returns {JSX.Element}
 */
export function CustomersTransactionsExportMenu() {
  const toastKey = useRef(null);
  const commonToastConfig = {
    isCloseButtonShown: true,
    timeout: 2000,
  };
  const { query } = useCustomersTransactionsContext();

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

  // Export the report to xlsx.
  const { mutateAsync: xlsxExport } = useCustomersTransactionsXlsxExport(
    query,
    {
      onDownloadProgress: (xlsxExportProgress: number) => {
        if (!toastKey.current) {
          toastKey.current = AppToaster.show({
            message: openProgressToast(xlsxExportProgress),
            ...commonToastConfig,
          });
        } else {
          AppToaster.show(
            {
              message: openProgressToast(xlsxExportProgress),
              ...commonToastConfig,
            },
            toastKey.current,
          );
        }
      },
    },
  );
  // Export the report to csv.
  const { mutateAsync: csvExport } = useCustomersTransactionsCsvExport(query, {
    onDownloadProgress: (xlsxExportProgress: number) => {
      if (!toastKey.current) {
        toastKey.current = AppToaster.show({
          message: openProgressToast(xlsxExportProgress),
          ...commonToastConfig,
        });
      } else {
        AppToaster.show(
          {
            message: openProgressToast(xlsxExportProgress),
            ...commonToastConfig,
          },
          toastKey.current,
        );
      }
    },
  });
  // Handle csv export button click.
  const handleCsvExportBtnClick = () => {
    csvExport();
  };
  // Handle xlsx export button click.
  const handleXlsxExportBtnClick = () => {
    xlsxExport();
  };

  return (
    <Menu>
      <MenuItem
        text={'XLSX (Microsoft Excel)'}
        onClick={handleXlsxExportBtnClick}
      />
      <MenuItem text={'CSV'} onClick={handleCsvExportBtnClick} />
    </Menu>
  );
}
