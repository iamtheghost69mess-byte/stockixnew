// @ts-nocheck
import React from 'react';
import { useApplicationBoot } from '@/components';
import DashboardLoadingIndicator from '@/components/Dashboard/DashboardLoadingIndicator';
import { useAuthMetadata } from '@/hooks/query/authentication';

/**
 * Private pages provider.
 */
export function PrivatePagesProvider({
  // #ownProps
  children,
}) {
  const { isLoading: isAppBootLoading } = useApplicationBoot();
  const { isLoading: isAuthMetaLoading } = useAuthMetadata();

  const isLoading = isAppBootLoading || isAuthMetaLoading;

  return (
    <DashboardLoadingIndicator isLoading={isLoading}>
      {children}
    </DashboardLoadingIndicator>
  );
}
