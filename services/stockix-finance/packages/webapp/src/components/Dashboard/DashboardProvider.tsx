// @ts-nocheck
import React from 'react';
import { DashboardAbilityProvider } from '../../components';
import DashboardLoadingIndicator from '@/components/Dashboard/DashboardLoadingIndicator';
import { useDashboardMetaBoot } from './DashboardBoot';

/**
 * Dashboard provider.
 */
export default function DashboardProvider({ children }) {
  const { isLoading } = useDashboardMetaBoot();

  return (
    <DashboardLoadingIndicator isLoading={isLoading}>
      <DashboardAbilityProvider>{children}</DashboardAbilityProvider>
    </DashboardLoadingIndicator>
  );
}
