// @ts-nocheck
import React from 'react';
import { If } from '@/components';
import { useRealizedGainOrLossContext } from './RealizedGainOrLossProvider';
import FinancialLoadingBar from '../FinancialLoadingBar';

/**
 * Realized Gain or Loss loading bar.
 */
export function RealizedGainOrLossLoadingBar() {
  const { isFetching } = useRealizedGainOrLossContext();
  return (
    <If condition={isFetching}>
      <FinancialLoadingBar />
    </If>
  );
}
