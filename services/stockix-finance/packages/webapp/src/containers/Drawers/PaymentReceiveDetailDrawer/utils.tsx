// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import moment from 'moment';
import {
  Button,
  Popover,
  PopoverInteractionKind,
  Position,
  MenuItem,
  Menu,
} from '@blueprintjs/core';
import { Icon, FormatNumberCell } from '@/components';
import { getColumnWidth } from '@/utils';
import { usePaymentReceiveDetailContext } from './PaymentReceiveDetailProvider';
import { useCurrentOrganization } from '@/hooks/state';
import { DualCurrencyTableValueCell } from '@/components/DualCurrencyTotalLines';

/**
 * Retrieve payment entries table columns.
 * Payment amount columns show secondary-currency equivalents when display
 * currencies are configured.
 */
export const usePaymentReceiveEntriesColumns = () => {
  const {
    paymentReceive: { entries, payment_date, currency_code },
  } = usePaymentReceiveDetailContext();

  const org = useCurrentOrganization();
  const displayCurrencies = Array.isArray(org?.display_currencies) ? org.display_currencies : [];
  const hasSecondary = displayCurrencies.length > 0;

  return React.useMemo(
    () => [
      {
        Header: intl.get('date'),
        accessor: (row) => moment(row.payment_date).format('YYYY MMM DD'),
        width: 100,
        className: 'date',
        disableSortBy: true,
      },
      {
        Header: intl.get('invoice_no'),
        accessor: 'invoice.invoice_no',
        width: 150,
        className: 'invoice_number',
        disableSortBy: true,
      },
      {
        Header: intl.get('invoice_amount'),
        accessor: 'invoice.balance',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        width: getColumnWidth(entries, 'invoice.balance', { minWidth: 60, magicSpacing: 5 }),
        align: 'right',
        textOverview: true,
        invoiceCurrency: currency_code,
        invoiceDate: payment_date,
      },
      {
        Header: intl.get('amount_due'),
        accessor: 'invoice.due_amount',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        align: 'right',
        width: getColumnWidth(entries, 'invoice.due_amount', { minWidth: 60, magicSpacing: 5 }),
        disableSortBy: true,
        textOverview: true,
        invoiceCurrency: currency_code,
        invoiceDate: payment_date,
      },
      {
        Header: intl.get('payment_amount'),
        accessor: 'invoice.payment_amount',
        Cell: hasSecondary ? DualCurrencyTableValueCell : FormatNumberCell,
        align: 'right',
        width: getColumnWidth(entries, 'invoice.payment_amount', { minWidth: 60, magicSpacing: 5 }),
        disableSortBy: true,
        textOverview: true,
        invoiceCurrency: currency_code,
        invoiceDate: payment_date,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hasSecondary, payment_date, currency_code],
  );
};

export function PaymentReceiveMoreMenuItems({ payload: { onNotifyViaSMS } }) {
  return (
    <Popover
      minimal={true}
      content={
        <Menu>
          <MenuItem
            onClick={onNotifyViaSMS}
            text={intl.get('notify_via_sms.dialog.notify_via_sms')}
          />
        </Menu>
      }
      interactionKind={PopoverInteractionKind.CLICK}
      position={Position.BOTTOM_LEFT}
      modifiers={{
        offset: { offset: '0, 4' },
      }}
    >
      <Button icon={<Icon icon="more-vert" iconSize={16} />} minimal={true} />
    </Popover>
  );
}
