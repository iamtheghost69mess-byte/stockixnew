// @ts-nocheck
import React, { useCallback } from 'react';
import { compose } from '@/utils';
import { DataTable, TableSkeletonRows } from '@/components';
import { useCurrenciesContext } from './CurrenciesProvider';
import { ActionMenuList, useCurrenciesTableColumns } from './components';
import withDialogActions from '@/containers/Dialog/withDialogActions';
import withAlertActions from '@/containers/Alert/withAlertActions';
import styled from 'styled-components';

function CurrenciesDataTable({
  tableProps,
  openDialog,
  openAlert,
}) {
  const { currencies, isCurrenciesLoading } = useCurrenciesContext();
  const columns = useCurrenciesTableColumns();

  const handleEditCurrency = useCallback(
    (currency) => {
      openDialog('currency-form', { action: 'edit', currency });
    },
    [openDialog],
  );

  const handleDeleteCurrency = ({ currency_code }) => {
    openAlert('currency-delete', { currency_code });
  };

  // Opens the exchange rate dialog with the currency pre-filled and locked.
  const handleSetRate = useCallback(
    (currency) => {
      openDialog('exchangeRate-form', { currencyCode: currency.currency_code });
    },
    [openDialog],
  );

  return (
    <CurrenciesTable
      columns={columns}
      data={currencies}
      loading={isCurrenciesLoading}
      progressBarLoading={isCurrenciesLoading}
      TableLoadingRenderer={TableSkeletonRows}
      ContextMenu={ActionMenuList}
      noInitialFetch={true}
      payload={{
        onDeleteCurrency: handleDeleteCurrency,
        onEditCurrency: handleEditCurrency,
        onSetRate: handleSetRate,
      }}
      rowContextMenu={ActionMenuList}
      {...tableProps}
    />
  );
}

export default compose(
  withDialogActions,
  withAlertActions,
)(CurrenciesDataTable);

const CurrenciesTable = styled(DataTable)`
  .table .th,
  .table .td {
    padding-top: 0.45rem;
    padding-bottom: 0.45rem;
  }
  .table .td.current-rate {
    font-variant-numeric: tabular-nums;
  }
`;
