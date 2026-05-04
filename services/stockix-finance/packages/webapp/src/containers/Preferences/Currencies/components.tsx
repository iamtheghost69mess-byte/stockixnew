// @ts-nocheck
import React, { useMemo } from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import {
  Menu,
  Popover,
  Button,
  Position,
  MenuItem,
  MenuDivider,
  Intent,
  Tag,
  Tooltip,
  Colors,
} from '@blueprintjs/core';
import { Icon } from '@/components';
import { safeCallback } from '@/utils';

/**
 * Row actions menu list.
 */
export function ActionMenuList({
  row: { original },
  payload: { onEditCurrency, onDeleteCurrency, onSetRate },
}) {
  return (
    <Menu>
      <MenuItem
        icon={<Icon icon="pen-18" />}
        text={intl.get('edit_currency')}
        onClick={safeCallback(onEditCurrency, original)}
      />
      {!original.is_base_currency && (
        <MenuItem
          icon={<Icon icon="plus" />}
          text={intl.get('set_exchange_rate')}
          onClick={safeCallback(onSetRate, original)}
        />
      )}
      <MenuDivider />
      <MenuItem
        icon={<Icon icon="trash-16" iconSize={16} />}
        text={intl.get('delete_currency')}
        onClick={safeCallback(onDeleteCurrency, original)}
        intent={Intent.DANGER}
      />
    </Menu>
  );
}

export const ActionsCell = (props) => {
  return (
    <Popover
      position={Position.RIGHT_BOTTOM}
      content={<ActionMenuList {...props} />}
    >
      <Button icon={<Icon icon="more-h-16" iconSize={16} />} minimal />
    </Popover>
  );
};

export const CurrencyNameAccessor = (value) => {
  return (
    <CurrencyNameRoot>
      <span>{value.currency_name}</span>
      {value.is_base_currency && (
        <Tag minimal intent={Intent.PRIMARY}>
          {intl.get('base_currency')}
        </Tag>
      )}
    </CurrencyNameRoot>
  );
};

const CurrencyNameRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RateCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
`;

const NoRateBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${Colors.ORANGE3};
  font-size: 12px;
  font-weight: 500;
`;

const RateText = styled.span`
  color: ${Colors.DARK_GRAY1};
`;

const DateText = styled.span`
  color: ${Colors.GRAY1};
  font-size: 12px;
`;

function CurrentRateAccessor(row) {
  if (row.is_base_currency) {
    return (
      <Tag minimal round>
        {intl.get('base')}
      </Tag>
    );
  }
  if (row.latest_exchange_rate == null) {
    return (
      <Tooltip content={intl.get('no_exchange_rate_set_for_this_currency')}>
        <NoRateBadge>
          <Icon icon="warning-sign" iconSize={12} />
          {intl.get('not_set')}
        </NoRateBadge>
      </Tooltip>
    );
  }
  return (
    <RateCell>
      <RateText>
        {Number(row.latest_exchange_rate).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })}
      </RateText>
    </RateCell>
  );
}

function RateDateAccessor(row) {
  if (row.is_base_currency || row.latest_exchange_rate_date == null) {
    return '—';
  }
  return <DateText>{row.latest_exchange_rate_date}</DateText>;
}

export function useCurrenciesTableColumns() {
  return useMemo(
    () => [
      {
        Header: intl.get('currency_name'),
        accessor: CurrencyNameAccessor,
        width: 200,
      },
      {
        Header: intl.get('currency_code'),
        accessor: 'currency_code',
        className: 'currency_code',
        width: 100,
      },
      {
        Header: intl.get('currency_sign'),
        accessor: 'currency_sign',
        width: 80,
      },
      {
        id: 'latest_exchange_rate',
        Header: intl.get('current_rate'),
        accessor: CurrentRateAccessor,
        width: 160,
        className: 'current-rate',
      },
      {
        id: 'latest_exchange_rate_date',
        Header: intl.get('rate_date'),
        accessor: RateDateAccessor,
        width: 130,
        className: 'rate-date',
      },
      {
        id: 'actions',
        Header: '',
        Cell: ActionsCell,
        className: 'actions',
        width: 50,
        disableResizing: true,
      },
    ],
    [],
  );
}
