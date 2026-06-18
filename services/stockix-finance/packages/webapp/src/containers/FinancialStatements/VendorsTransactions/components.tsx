// @ts-nocheck
import React, { useRef } from 'react';
import intl from 'react-intl-universal';
import {
  Classes,
  Intent,
  Menu,
  MenuItem,
  ProgressBar,
  Text,
} from '@blueprintjs/core';
import classNames from 'classnames';

import { AppToaster, If, Stack } from '@/components';
import { useVendorsTransactionsContext } from './VendorsTransactionsProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';
import { getColumnWidth } from '@/utils';
import {
  useVendorsTransactionsCsvExport,
  useVendorsTransactionsXlsxExport,
} from '@/hooks/query';
import { Align } from '@/constants';

const getTableCellValueAccessor = (index) => `cells[${index}].value`;

const staticVendorColumnMap = {
  vendor_name: (column) => ({
    Header: intl.get('vendor_name'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'vendor_name',
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
    textOverview: true,
    width: 120,
  }),
  transaction_type: (column) => ({
    Header: intl.get('transaction_type'),
    accessor: getTableCellValueAccessor(column.cell_index),
    textOverview: true,
    width: 120,
  }),
  credit: (column, rows) => ({
    Header: intl.get('credit'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'credit',
    width: getColumnWidth(rows, getTableCellValueAccessor(column.cell_index), { minWidth: 100, magicSpacing: 10 }),
    money: true,
    align: Align.Right,
  }),
  debit: (column, rows) => ({
    Header: intl.get('debit'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'debit',
    width: getColumnWidth(rows, getTableCellValueAccessor(column.cell_index), { minWidth: 100, magicSpacing: 10 }),
    money: true,
    align: Align.Right,
  }),
  running_balance: (column, rows) => ({
    Header: intl.get('running_balance'),
    accessor: getTableCellValueAccessor(column.cell_index),
    className: 'running_balance',
    width: getColumnWidth(rows, getTableCellValueAccessor(column.cell_index), { minWidth: 120, magicSpacing: 10 }),
    money: true,
    align: Align.Right,
  }),
};

const mapVendorTransactionsColumn = (column, rows) => {
  const builder = staticVendorColumnMap[column.key];
  if (builder) return builder(column, rows);
  return {
    Header: column.label,
    accessor: getTableCellValueAccessor(column.cell_index),
    className: column.key,
    align: Align.Right,
    money: true,
    width: getColumnWidth(rows, getTableCellValueAccessor(column.cell_index), { minWidth: 120 }),
  };
};

/**
 * Retrieve vendors transactions columns — driven by server-provided column list
 * so secondary currency columns are rendered automatically when secondaryCurrency is set.
 */
export const useVendorsTransactionsColumns = () => {
  const {
    vendorsTransactions: { table },
  } = useVendorsTransactionsContext();

  return React.useMemo(
    () => (table?.columns || []).map((col) => mapVendorTransactionsColumn(col, table?.rows || [])),
    [table],
  );
};

/**
 * Vendors transactions loading bar.
 */
export function VendorsTransactionsLoadingBar() {
  const { isVendorsTransactionFetching } = useVendorsTransactionsContext();

  return (
    <If condition={isVendorsTransactionFetching}>
      <FinancialLoadingBar />
    </If>
  );
}

/**
 * Vendor transactions export menu.
 */
export function VendorTransactionsExportMenu() {
  const toastKey = useRef(null);
  const commonToastConfig = {
    isCloseButtonShown: true,
    timeout: 2000,
  };
  const { query } = useVendorsTransactionsContext();

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
  const { mutateAsync: xlsxExport } = useVendorsTransactionsXlsxExport(query, {
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
  // Export the report to csv.
  const { mutateAsync: csvExport } = useVendorsTransactionsCsvExport({
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
