// @ts-nocheck
import React from 'react';
import { If } from '@/components';
import { useUnrealizedGainOrLossContext } from './UnrealizedGainOrLossProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';

/**
 * Unrealized Gain or Loss loading bar.
 */
export function UnrealizedGainOrLossLoadingBar() {
  const { isFetching } = useUnrealizedGainOrLossContext();
  return (
    <If condition={isFetching}>
      <FinancialLoadingBar />
    </If>
  );
}
