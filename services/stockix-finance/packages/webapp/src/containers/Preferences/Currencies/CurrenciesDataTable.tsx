// @ts-nocheck
import React, { useCallback } from 'react';
import moment from 'moment';
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

  // Opens the exchange rate dialog in new mode with currency pre-filled.
  const handleSetRate = useCallback(
    (currency) => {
      openDialog('exchangeRate-form', { currencyCode: currency.currency_code });
    },
    [openDialog],
  );

  // Opens the exchange rate dialog in edit mode for the currency's latest rate.
  const handleEditRate = useCallback(
    (currency) => {
      openDialog('exchangeRate-form', {
        action: 'edit',
        exchangeRate: {
          id: currency.latest_exchange_rate_id,
          currency_code: currency.currency_code,
          exchange_rate: currency.latest_exchange_rate,
          date: moment(currency.latest_exchange_rate_date).format('YYYY-MM-DD'),
        },
      });
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
        onEditRate: handleEditRate,
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
