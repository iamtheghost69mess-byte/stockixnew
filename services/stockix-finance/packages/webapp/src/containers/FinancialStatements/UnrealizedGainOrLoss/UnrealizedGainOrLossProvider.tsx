// @ts-nocheck
import React from 'react';
import FinancialReportPage from '../FinancialReportPage';
import { useUnrealizedGainOrLoss } from '@/hooks/query/FinancialReports/use-unrealized-gain-loss';

const UnrealizedGainOrLossContext = React.createContext();

/**
 * Unrealized Gain or Loss provider.
 */
function UnrealizedGainOrLossProvider({ filter, ...props }) {
  const { data, isLoading, isFetching } = useUnrealizedGainOrLoss(filter || {});

  const provider = {
    report: data,
    isLoading,
    isFetching,
  };

  return (
    <FinancialReportPage name="unrealized-gain-loss">
      <UnrealizedGainOrLossContext.Provider value={provider} {...props} />
    </FinancialReportPage>
  );
}

const useUnrealizedGainOrLossContext = () =>
  React.useContext(UnrealizedGainOrLossContext);

export { UnrealizedGainOrLossProvider, useUnrealizedGainOrLossContext };
