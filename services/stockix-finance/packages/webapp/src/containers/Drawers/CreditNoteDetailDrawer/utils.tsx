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
import { useCreditNoteDetailDrawerContext } from './CreditNoteDetailDrawerProvider';
import { useCurrentOrganization } from '@/hooks/state';
import {
  DualCurrencyTableCurrencyCell,
  DualCurrencyTableValueCell,
} from '@/components/DualCurrencyTotalLines';

export const useCreditNoteReadOnlyEntriesColumns = () => {
  const {
    creditNote: { entries, credit_note_date, currency_code },
  } = useCreditNoteDetailDrawerContext();

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
        className: 'name',
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
              invoiceDate: credit_note_date,
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
        invoiceDate: credit_note_date,
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
        invoiceDate: credit_note_date,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hasSecondary, credit_note_date, currency_code],
  );
};

/**
 * Credit note more actions menu.
 */
export function CreditNoteMenuItem({ payload: { onReconcile } }) {
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
            text={<T id={'credit_note.action.reconcile_with_invoices'} />}
          />
        </Menu>
      }
    >
      <Button icon={<Icon icon="more-vert" iconSize={16} />} minimal={true} />
    </Popover>
  );
}

/**
 * Credit note details status.
 */
export function CreditNoteDetailsStatus({ creditNote }) {
  return (
    <Choose>
      <Choose.When condition={creditNote.is_open}>
        <Tag intent={Intent.WARNING} round={true}>
          <T id={'open'} />
        </Tag>
      </Choose.When>

      <Choose.When condition={creditNote.is_closed}>
        <Tag intent={Intent.SUCCESS} round={true}>
          <T id={'closed'} />
        </Tag>
      </Choose.When>

      <Choose.When condition={creditNote.is_draft}>
        <Tag intent={Intent.NONE} round={true} minimal={true}>
          <T id={'draft'} />
        </Tag>
      </Choose.When>
    </Choose>
  );
}
