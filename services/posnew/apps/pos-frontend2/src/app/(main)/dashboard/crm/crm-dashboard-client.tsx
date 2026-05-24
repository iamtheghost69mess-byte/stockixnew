"use client";

import * as React from "react";

import { DevDashboardDataNotice } from "../_components/dev-dashboard-data-notice";
import { InsightCards } from "./_components/insight-cards";
import { OperationalCards } from "./_components/operational-cards";
import { OverviewCards } from "./_components/overview-cards";
import { TopProductsTable } from "./_components/recent-leads-table/table";
import { CrmDashboardSkeleton } from "./crm-dashboard-skeleton";
import { CrmErrorBoundary } from "./crm-error-boundary";
import { useCrmDashboardQueries } from "./use-crm-dashboard-queries";

/**
 * Recharts + ResponsiveContainer can throw or race if they mount during SSR/hydration edge cases.
 * Defer chart trees until after the first client effect (avoids SSR `useLayoutEffect` noise + Recharts races).
 */
function useClientVisualReady(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

export function CrmDashboardClient() {
  const visualReady = useClientVisualReady();
  const {
    rangeLabel,
    staffRangeLabel,
    busyHourChart,
    aovChart,
    dailyOrdersChart,
    paidOrderCount,
    topProductName,
    topProductQuantity,
    overviewLoading,
    overviewErrorFlag,
    overviewErrors,
    insightTopItemsForBar,
    topItemsTableRows,
    staffPerformers,
    lowStockItems,
    insightLoading,
    insightErrorFlag,
    insightErrors,
    operationalLoading,
    operationalErrorFlag,
    operationalErrors,
    tableLoading,
    tableErrorFlag,
    tableErrors,
  } = useCrmDashboardQueries();

  if (!visualReady) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <DevDashboardDataNotice />
        <CrmDashboardSkeleton />
      </div>
    );
  }

  return (
    <CrmErrorBoundary>
      <div className="flex flex-col gap-4 md:gap-6">
        <DevDashboardDataNotice />
        <OverviewCards
          rangeLabel={rangeLabel}
          busyHourChart={busyHourChart}
          aovChart={aovChart}
          dailyOrdersChart={dailyOrdersChart}
          paidOrderCount={paidOrderCount}
          topProductName={topProductName}
          topProductQuantity={topProductQuantity}
          isLoading={overviewLoading}
          isError={overviewErrorFlag}
          errorMessage={overviewErrors}
        />
        <InsightCards
          rangeLabel={rangeLabel}
          topItemsForBar={insightTopItemsForBar}
          isLoading={insightLoading}
          isError={insightErrorFlag}
          errorMessage={insightErrors}
        />
        <OperationalCards
          rangeLabel={staffRangeLabel}
          staffRows={staffPerformers}
          lowStockItems={lowStockItems}
          isLoading={operationalLoading}
          isError={operationalErrorFlag}
          errorMessage={operationalErrors}
        />
        <TopProductsTable
          data={topItemsTableRows}
          rangeLabel={rangeLabel}
          isLoading={tableLoading}
          isError={tableErrorFlag}
          errorMessage={tableErrors}
        />
      </div>
    </CrmErrorBoundary>
  );
}
