// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { getColumnWidth } from '@/utils';
import { FormatNumberCell, TextOverviewTooltipCell } from '@/components';
import { useEstimateDetailDrawerContext } from './EstimateDetailDrawerProvider';
import { useCurrentOrganization } from '@/hooks/state';
import {
  DualCurrencyTableCurrencyCell,
  DualCurrencyTableValueCell,
} from '@/components/DualCurrencyTotalLines';

/**
 * Retrieve table columns of estimate readonly entries details.
 */
export const useEstimateReadonlyEntriesColumns = () => {
  const {
    estimate: { entries, estimate_date, currency_code },
  } = useEstimateDetailDrawerContext();

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
              invoiceDate: estimate_date,
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
        invoiceDate: estimate_date,
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
        invoiceDate: estimate_date,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hasSecondary, estimate_date, currency_code],
  );
};
