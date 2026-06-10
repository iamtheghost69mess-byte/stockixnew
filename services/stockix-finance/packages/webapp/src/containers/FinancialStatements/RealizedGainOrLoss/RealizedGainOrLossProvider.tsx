// @ts-nocheck
import React from 'react';
import FinancialReportPage from '../FinancialReportPage';
import { useRealizedGainOrLoss } from '@/hooks/query/FinancialReports/use-realized-gain-loss';

const RealizedGainOrLossContext = React.createContext();

/**
 * Realized Gain or Loss provider.
 */
function RealizedGainOrLossProvider({ filter, ...props }) {
  const { data, isLoading, isFetching } = useRealizedGainOrLoss(filter || {});

  const provider = {
    report: data,
    isLoading,
    isFetching,
  };

  return (
    <FinancialReportPage name="realized-gain-loss">
      <RealizedGainOrLossContext.Provider value={provider} {...props} />
    </FinancialReportPage>
  );
}

const useRealizedGainOrLossContext = () =>
  React.useContext(RealizedGainOrLossContext);

export { RealizedGainOrLossProvider, useRealizedGainOrLossContext };
