// @ts-nocheck
import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation } from 'react-router-dom';
import DashboardTopbar from '@/components/Dashboard/DashboardTopbar';
import DashboardContentRoutes from '@/components/Dashboard/DashboardContentRoute';
import DashboardErrorBoundary from './DashboardErrorBoundary';

export default React.forwardRef(({}, ref) => {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary
      FallbackComponent={DashboardErrorBoundary}
      resetKeys={[pathname]}
    >
      <div className="dashboard-content" id="dashboard" ref={ref}>
        <DashboardTopbar />
        <DashboardContentRoutes />
      </div>
    </ErrorBoundary>
  );
});
