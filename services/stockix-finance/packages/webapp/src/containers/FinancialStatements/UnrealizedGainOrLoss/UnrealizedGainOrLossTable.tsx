// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { FinancialSheet, DataTable } from '@/components';
import { useUnrealizedGainOrLossContext } from './UnrealizedGainOrLossProvider';

/**
 * Unrealized Gain or Loss table.
 */
function UnrealizedGainOrLossTable({ companyName }) {
  const { report, isLoading } = useUnrealizedGainOrLossContext();

  const columns = React.useMemo(
    () => [
      { Header: intl.get('date'), accessor: 'formattedDate', width: 120 },
      { Header: intl.get('type'), accessor: 'type', width: 60 },
      { Header: intl.get('contact'), accessor: 'contactName', width: 180 },
      { Header: intl.get('currency'), accessor: 'currencyCode', width: 80 },
      {
        Header: intl.get('foreign_due_amount'),
        accessor: 'formattedForeignDueAmount',
        width: 140,
        align: 'right',
      },
      {
        Header: intl.get('original_rate'),
        accessor: 'originalRate',
        width: 110,
        align: 'right',
      },
      {
        Header: intl.get('current_rate'),
        accessor: 'currentRate',
        width: 110,
        align: 'right',
      },
      {
        Header: intl.get('gain_loss'),
        accessor: 'formattedGainLoss',
        width: 130,
        align: 'right',
      },
    ],
    []
  );

  return (
    <FinancialSheet
      name="unrealized-gain-loss"
      companyName={companyName}
      sheetType={intl.get('unrealized_gain_or_loss.label')}
    >
      <DataTable
        columns={columns}
        data={report?.entries || []}
        loading={isLoading}
        noInitialFetch={true}
        sticky={true}
      />
    </FinancialSheet>
  );
}

export default UnrealizedGainOrLossTable;
