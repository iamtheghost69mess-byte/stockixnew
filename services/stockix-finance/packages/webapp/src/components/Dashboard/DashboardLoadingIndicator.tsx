// @ts-nocheck
import React from 'react';
import { Choose } from '@/components';
import StockixLoading from './StockixLoading';

/**
 * Dashboard loading indicator.
 */
export default function DashboardLoadingIndicator({
  isLoading = false,
  className,
  children,
}) {
  return (
    <Choose>
      <Choose.When condition={isLoading}>
        <StockixLoading />        
      </Choose.When>

      <Choose.Otherwise>
        { children }
      </Choose.Otherwise>
    </Choose>
  );
}
