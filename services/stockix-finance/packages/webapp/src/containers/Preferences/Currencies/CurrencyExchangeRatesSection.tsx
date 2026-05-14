// @ts-nocheck
import React, { useCallback, useMemo, useState } from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import {
  Button,
  Colors,
  Intent,
  Menu,
  MenuDivider,
  MenuItem,
  Popover,
  Position,
} from '@blueprintjs/core';
import moment from 'moment';
import {
  DataTable,
  FormattedMessage as T,
  Icon,
  TableSkeletonRows,
  TableSkeletonHeader,
} from '@/components';
import { useExchangeRates, useCurrencies } from '@/hooks/query';
import { CurrencySelectList } from '@/components';
import withDialogActions from '@/containers/Dialog/withDialogActions';
import withAlertActions from '@/containers/Alert/withAlertActions';
import { compose } from '@/utils';

function ExchangeRateRowMenu({ row: { original }, payload: { onEdit, onDelete } }) {
  return (
    <Menu>
      <MenuItem
        icon={<Icon icon="pen-18" />}
        text={intl.get('edit_exchange_rate')}
        onClick={() => onEdit(original)}
      />
      <MenuDivider />
      <MenuItem
        icon={<Icon icon="trash-16" iconSize={16} />}
        text={intl.get('delete_exchange_rate')}
        intent={Intent.DANGER}
        onClick={() => onDelete(original)}
      />
    </Menu>
  );
}

function ExchangeRateActionsCell(props) {
  return (
    <Popover content={<ExchangeRateRowMenu {...props} />} position={Position.RIGHT_TOP}>
      <Button icon={<Icon icon="more-h-16" iconSize={16} />} minimal />
    </Popover>
  );
}

function useExchangeRateSectionColumns() {
  return useMemo(
    () => [
      {
        id: 'date',
        Header: intl.get('date'),
        accessor: (r) => moment(r.date).format('YYYY MMM DD'),
        width: 150,
      },
      {
        id: 'currency_code',
        Header: intl.get('currency_code'),
        accessor: 'currency_code',
        width: 120,
      },
      {
        id: 'exchange_rate',
        Header: intl.get('exchange_rate'),
        accessor: (r) =>
          Number(r.exchange_rate).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          }),
        width: 180,
        className: 'exchange_rate',
      },
      {
        id: 'actions',
        Header: '',
        Cell: ExchangeRateActionsCell,
        width: 50,
        disableResizing: true,
      },
    ],
    [],
  );
}

/**
 * Exchange rate history section with currency filter and pagination.
 */
function CurrencyExchangeRatesSection({ openDialog, openAlert }) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterCurrency, setFilterCurrency] = useState('');
  const columns = useExchangeRateSectionColumns();

  const { data: currencies } = useCurrencies();

  const query = {
    page,
    page_size: pageSize,
    ...(filterCurrency ? { currency_code: filterCurrency } : {}),
  };

  const {
    data: { exchangesRates, pagination },
    isFetching,
    isLoading,
  } = useExchangeRates(query);

  const handleEdit = useCallback(
    (rate) => {
      openDialog('exchangeRate-form', { action: 'edit', exchangeRate: rate });
    },
    [openDialog],
  );

  const handleDelete = useCallback(
    (rate) => {
      openAlert('exchange-rate-delete', { exchangeRateId: rate.id });
    },
    [openAlert],
  );

  const handleFetchData = useCallback(({ pageIndex }) => {
    setPage(pageIndex + 1);
  }, []);

  const handleCurrencyFilter = (currency) => {
    setFilterCurrency(currency?.currency_code ?? '');
    setPage(1);
  };

  return (
    <SectionRoot>
      <SectionHeader>
        <SectionTitle>
          <T id={'exchange_rate_history'} />
        </SectionTitle>
        <CurrencyFilterWrap>
          <CurrencySelectList
            currenciesList={currencies}
            selectedCurrencyCode={filterCurrency}
            onCurrencySelected={handleCurrencyFilter}
            placeholder={intl.get('all_currencies')}
            allowClear
          />
        </CurrencyFilterWrap>
      </SectionHeader>

      <RatesTable
        columns={columns}
        data={exchangesRates}
        loading={isLoading}
        headerLoading={isLoading}
        progressBarLoading={isFetching}
        noInitialFetch={true}
        sticky={true}
        pagination={true}
        manualPagination={true}
        pagesCount={pagination.pagesCount}
        onFetchData={handleFetchData}
        TableLoadingRenderer={TableSkeletonRows}
        TableHeaderSkeletonRenderer={TableSkeletonHeader}
        ContextMenu={ExchangeRateRowMenu}
        payload={{ onEdit: handleEdit, onDelete: handleDelete }}
      />
    </SectionRoot>
  );
}

export default compose(withDialogActions, withAlertActions)(CurrencyExchangeRatesSection);

const SectionRoot = styled.div`
  border-top: 1px solid ${Colors.LIGHT_GRAY2};
  margin-top: 24px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px 8px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${Colors.DARK_GRAY1};
`;

const CurrencyFilterWrap = styled.div`
  min-width: 160px;
`;

const RatesTable = styled(DataTable)`
  .table .th,
  .table .td {
    padding-top: 0.4rem;
    padding-bottom: 0.4rem;
  }
  .table .td.exchange_rate {
    font-variant-numeric: tabular-nums;
  }
`;
