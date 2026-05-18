// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import {
  Button,
  Popover,
  PopoverInteractionKind,
  Position,
  MenuItem,
  Menu,
  Tag,
  Intent,
} from '@blueprintjs/core';
import { getColumnWidth } from '@/utils';
import {
  Icon,
  FormattedMessage as T,
  TextOverviewTooltipCell,
  FormatNumberCell,
  Choose,
} from '@/components';
import { useVendorCreditDetailDrawerContext } from './VendorCreditDetailDrawerProvider';
import { useCurrentOrganization } from '@/hooks/state';
import {
  DualCurrencyTableCurrencyCell,
  DualCurrencyTableValueCell,
} from '@/components/DualCurrencyTotalLines';

/**
 * Retrieve vendor credit readonly details entries table columns.
 */
export const useVendorCreditReadonlyEntriesTableColumns = () => {
  const {
    vendorCredit: { entries, vendor_credit_date, currency_code },
  } = useVendorCreditDetailDrawerContext();

  const org = useCurrentOrganization();
  const displayCurrencies = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const hasSecondary = displayCurrencies.length > 0;

  return React.useMemo(
    () => [
      {
        Header: intl.get('product_and_service'),
        accessor: 'item.name',
        Cell: TextOverviewTooltipCell,
        width: 150,
        className: 'item',
        disableSortBy: true,
        textOverview: true,
      },
      {
        Header: intl.get('description'),
        accessor: 'description',
        Cell: TextOverviewTooltipCell,
        className: 'description',
        disableSortBy: true,
        textOverview: true,
      },
      {
        Header: intl.get('quantity'),
        accessor: 'quantity',
        Cell: FormatNumberCell,
        width: getColumnWidth(entries, 'quantity', { minWidth: 60, magicSpacing: 5 }),
        align: 'right',
        disableSortBy: true,
        textOverview: true,
      },
      ...(hasSecondary
        ? [
            {
              Header: intl.get('currency'),
              id: 'currency',
              accessor: () => null,
              Cell: DualCurrencyTableCurrencyCell,
              disableSortBy: true,
              width: 110,
              invoiceCurrency: currency_code,
              invoiceDate: vendor_credit_date,
            },
          ]
        : []),
      {
        Header: intl.get('rate'),
        accessor: 'rate',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        width: getColumnWidth(entries, 'rate', { minWidth: 60, magicSpacing: 5 }),
        align: 'right',
        disableSortBy: true,
        textOverview: true,
        invoiceCurrency: currency_code,
        invoiceDate: vendor_credit_date,
      },
      {
        Header: intl.get('amount'),
        accessor: 'amount',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        width: getColumnWidth(entries, 'amount', { minWidth: 60, magicSpacing: 5 }),
        align: 'right',
        disableSortBy: true,
        textOverview: true,
        invoiceCurrency: currency_code,
        invoiceDate: vendor_credit_date,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hasSecondary, vendor_credit_date, currency_code],
  );
};

/**
 * Vendor note more actions menu.
 */
export const VendorCreditMenuItem = ({ payload: { onReconcile } }) => {
  return (
    <Popover
      minimal={true}
      interactionKind={PopoverInteractionKind.CLICK}
      position={Position.BOTTOM_LEFT}
      modifiers={{
        offset: { offset: '0, 4' },
      }}
      content={
        <Menu>
          <MenuItem
            onClick={onReconcile}
            text={intl.get('vendor_credits.action.reconcile_with_bills')}
          />
        </Menu>
      }
    >
      <Button icon={<Icon icon="more-vert" iconSize={16} />} minimal={true} />
    </Popover>
  );
};

/**
 * Vendor Credit details status.
 */
export function VendorCreditDetailsStatus({ vendorCredit }) {
  return (
    <Choose>
      <Choose.When condition={vendorCredit.is_open}>
        <Tag intent={Intent.WARNING} round={true}>
          <T id={'open'} />
        </Tag>
      </Choose.When>

      <Choose.When condition={vendorCredit.is_closed}>
        <Tag intent={Intent.SUCCESS} round={true}>
          <T id={'closed'} />
        </Tag>
      </Choose.When>

      <Choose.When condition={vendorCredit.is_draft}>
        <Tag intent={Intent.NONE} round={true} minimal={true}>
          <T id={'draft'} />
        </Tag>
      </Choose.When>
    </Choose>
  );
}
