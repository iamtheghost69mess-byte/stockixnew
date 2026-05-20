// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { FinancialSheet, DataTable } from '@/components';
import { useRealizedGainOrLossContext } from './RealizedGainOrLossProvider';

/**
 * Realized Gain or Loss table.
 */
function RealizedGainOrLossTable({ companyName }) {
  const { report, isLoading } = useRealizedGainOrLossContext();

  const columns = React.useMemo(
    () => [
      { Header: intl.get('date'), accessor: 'formattedDate', width: 120 },
      { Header: intl.get('type'), accessor: 'type', width: 60 },
      { Header: intl.get('contact'), accessor: 'contactName', width: 180 },
      { Header: intl.get('currency'), accessor: 'currencyCode', width: 80 },
      {
        Header: intl.get('foreign_amount'),
        accessor: 'formattedForeignAmount',
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
        Header: intl.get('payment_rate'),
        accessor: 'paymentRate',
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
      name="realized-gain-loss"
      companyName={companyName}
      sheetType={intl.get('realized_gain_or_loss.label')}
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

export default RealizedGainOrLossTable;
