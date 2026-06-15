"use client";

import * as React from "react";

import { useQuery } from "@tanstack/react-query";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardLocationScope } from "@/hooks/use-dashboard-location-scope";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type DashboardRange,
  fetchDashboardDefault,
  fetchDashboardLowStock,
  fetchDashboardRecentOrders,
  fetchDashboardRecentVoids,
} from "@/lib/pos-dashboard-api";

import { DevDashboardDataNotice } from "../_components/dev-dashboard-data-notice";
import { ChartAreaInteractive } from "./_components/chart-area-interactive";
import proposalDemoData from "./_components/data.json";
import { LowStockWidget } from "./_components/low-stock-widget";
import { ProposalSectionsTable } from "./_components/proposal-sections-table/table";
import { RecentOrdersWidget } from "./_components/recent-orders-widget";
import { RecentVoidsWidget } from "./_components/recent-voids-widget";
import { SectionCards } from "./_components/section-cards";

export function DashboardDefaultClient() {
  const isMobile = useIsMobile();
  const [range, setRange] = React.useState<DashboardRange>("90d");
  const scope = useDashboardLocationScope({ allowAllScope: true });

  React.useEffect(() => {
    if (isMobile) setRange("7d");
  }, [isMobile]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", "default", range, scope.effectiveBranchId, "live"],
    queryFn: () => fetchDashboardDefault(range),
    enabled: scope.scopeReady,
  });
  const recentVoidsQuery = useQuery({
    queryKey: ["dashboard", "recent-voids", scope.effectiveBranchId],
    queryFn: () => fetchDashboardRecentVoids(5),
    enabled: scope.scopeReady,
  });
  const recentOrdersQuery = useQuery({
    queryKey: ["dashboard", "recent-orders", scope.effectiveBranchId],
    queryFn: () => fetchDashboardRecentOrders(5),
    enabled: scope.scopeReady,
  });
  const lowStockQuery = useQuery({
    queryKey: ["dashboard", "low-stock", scope.effectiveBranchId],
    queryFn: fetchDashboardLowStock,
    enabled: scope.scopeReady,
  });

  const errMessage = error instanceof Error ? error.message : "Could not load dashboard.";

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {scope.needsBranchPicker ? (
        <div className="max-w-sm">
          <Select value={scope.selectedBranchId} onValueChange={scope.setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder={scope.locationsLoading ? "Loading branches..." : "Select dashboard scope"} />
            </SelectTrigger>
            <SelectContent>
              {scope.locations.map((location) => (
                <SelectItem key={location._id} value={location._id}>
                  {location.name || location.code || location._id}
                </SelectItem>
              ))}
              {scope.canUseAllScope ? <SelectItem value="all">All branches (aggregate)</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <DevDashboardDataNotice />
      <SectionCards
        summary={data?.summary}
        todayKpis={data?.todayKpis}
        displayCurrency={data?.displayCurrency ?? "USD"}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errMessage}
        range={range}
      />
      <ChartAreaInteractive
        range={range}
        onRangeChange={setRange}
        chartData={data?.chartData ?? []}
        displayCurrency={data?.displayCurrency ?? "USD"}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errMessage}
      />
      <RecentOrdersWidget rows={recentOrdersQuery.data ?? []} isLoading={recentOrdersQuery.isLoading} />
      <RecentVoidsWidget rows={recentVoidsQuery.data ?? []} isLoading={recentVoidsQuery.isLoading} />
      <LowStockWidget rows={lowStockQuery.data ?? []} isLoading={lowStockQuery.isLoading} />
      <ProposalSectionsTable data={proposalDemoData} />
    </div>
  );
}
