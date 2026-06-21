"use client";

import * as React from "react";

import { useQuery } from "@tanstack/react-query";

import {
  mockCrmLowStockItems,
  mockCrmSalesReport,
  mockCrmTopItems,
  shouldUseDevDashboardMocks,
} from "@/lib/dashboard-dev-mocks";
import { fetchInventoryLowStock, inventoryLowStockQueryKey } from "@/lib/inventory-api";
import {
  buildReportRangeWindow,
  crmReportSalesQueryKey,
  crmReportStaffQueryKey,
  crmReportTopItemsQueryKey,
  fetchSalesReport,
  fetchStaffReport,
  fetchTopItemsReport,
  type TopItemRow,
} from "@/lib/pos-reports-api";

import {
  aggregateOrderCountByHourOfDay,
  formatCrmReportRangeDescription,
  joinCrmErrorMessages,
} from "./crm-report-derivations";

const LOW_STOCK_LIMIT = 20;

/** Shared TanStack Query options — limits retry storms and matches app stale policy. */
const CRM_QUERY_OPTIONS = {
  retry: 1,
  staleTime: 60_000,
} as const;

function safeFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * TanStack Table requires unique `getRowId`; the API can occasionally repeat `menuItemId`.
 * Merges duplicate rows by summing quantity and revenue.
 */
function dedupeTopItemsByMenuItemId(items: readonly TopItemRow[]): TopItemRow[] {
  const map = new Map<string, TopItemRow>();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const rawId = typeof item.menuItemId === "string" ? item.menuItemId.trim() : "";
    const id = rawId.length > 0 ? rawId : `missing-${i}`;
    const prev = map.get(id);
    const quantity = safeFiniteNumber(item.quantity, 0);
    const revenue = safeFiniteNumber(item.revenue, 0);
    const pct = safeFiniteNumber(item.percentOfRevenue, 0);
    const name = typeof item.name === "string" ? item.name : "";
    if (prev === undefined) {
      map.set(id, {
        ...item,
        menuItemId: rawId.length > 0 ? rawId : id,
        name,
        quantity,
        revenue,
        percentOfRevenue: pct,
      });
      continue;
    }
    map.set(id, {
      ...prev,
      quantity: prev.quantity + quantity,
      revenue: prev.revenue + revenue,
      name: prev.name.length > 0 ? prev.name : name,
    });
  }
  return [...map.values()];
}

export function useCrmDashboardQueries() {
  const range = React.useMemo(() => buildReportRangeWindow({ daySpan: 7 }), []);
  const staffRange = React.useMemo(() => buildReportRangeWindow({ daySpan: 30 }), []);
  const rangeLabel = React.useMemo(() => formatCrmReportRangeDescription(range), [range]);
  const staffRangeLabel = React.useMemo(() => formatCrmReportRangeDescription(staffRange), [staffRange]);
  const useMocks = shouldUseDevDashboardMocks();

  const salesDayQuery = useQuery({
    queryKey: [...crmReportSalesQueryKey({ ...range, groupBy: "day" }), useMocks],
    queryFn: () =>
      useMocks ? Promise.resolve(mockCrmSalesReport(range, "day")) : fetchSalesReport({ ...range, groupBy: "day" }),
    ...CRM_QUERY_OPTIONS,
  });

  const salesHourQuery = useQuery({
    queryKey: [...crmReportSalesQueryKey({ ...range, groupBy: "hour" }), useMocks],
    queryFn: () =>
      useMocks ? Promise.resolve(mockCrmSalesReport(range, "hour")) : fetchSalesReport({ ...range, groupBy: "hour" }),
    ...CRM_QUERY_OPTIONS,
  });

  const topItemsQuery = useQuery({
    queryKey: [...crmReportTopItemsQueryKey(range), useMocks],
    queryFn: () => (useMocks ? Promise.resolve(mockCrmTopItems(range)) : fetchTopItemsReport(range)),
    ...CRM_QUERY_OPTIONS,
  });

  const staffQuery = useQuery({
    queryKey: [...crmReportStaffQueryKey(staffRange), "live-only"],
    queryFn: () => fetchStaffReport(staffRange),
    ...CRM_QUERY_OPTIONS,
  });

  const lowStockQuery = useQuery({
    queryKey: [...inventoryLowStockQueryKey(1, LOW_STOCK_LIMIT), useMocks],
    queryFn: async () => {
      if (useMocks) {
        return { success: true as const, data: mockCrmLowStockItems() };
      }
      return fetchInventoryLowStock({ page: 1, limit: LOW_STOCK_LIMIT });
    },
    ...CRM_QUERY_OPTIONS,
  });

  const busyHourChart = React.useMemo(
    () => aggregateOrderCountByHourOfDay(salesHourQuery.data?.buckets ?? []),
    [salesHourQuery.data?.buckets],
  );

  const aovChart = React.useMemo(() => {
    const buckets = salesDayQuery.data?.buckets ?? [];
    return buckets.map((b) => {
      const revenue = Number(b.revenue);
      const oc = Number(b.orderCount);
      const r = Number.isFinite(revenue) ? revenue : 0;
      const c = Number.isFinite(oc) ? Math.max(0, oc) : 0;
      const aov = c > 0 ? r / c : 0;
      return {
        day: typeof b.period === "string" ? b.period : "",
        aov: Number.isFinite(aov) ? aov : 0,
      };
    });
  }, [salesDayQuery.data?.buckets]);

  const dailyOrdersChart = React.useMemo(() => {
    const buckets = salesDayQuery.data?.buckets ?? [];
    return buckets.map((b) => {
      const oc = Number(b.orderCount);
      return {
        day: typeof b.period === "string" ? b.period : "",
        orders: Number.isFinite(oc) ? Math.max(0, oc) : 0,
      };
    });
  }, [salesDayQuery.data?.buckets]);

  const paidOrderCount = React.useMemo(() => {
    const n = Number(salesDayQuery.data?.summary?.orderCount);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [salesDayQuery.data?.summary?.orderCount]);

  const dedupedTopItems = React.useMemo(
    () => dedupeTopItemsByMenuItemId(topItemsQuery.data?.items ?? []),
    [topItemsQuery.data?.items],
  );

  const topItem = dedupedTopItems[0];

  const overviewErrors = React.useMemo(() => {
    const msgs: string[] = [];
    if (salesDayQuery.isError && salesDayQuery.error instanceof Error) msgs.push(salesDayQuery.error.message);
    if (salesHourQuery.isError && salesHourQuery.error instanceof Error) msgs.push(salesHourQuery.error.message);
    if (topItemsQuery.isError && topItemsQuery.error instanceof Error) msgs.push(topItemsQuery.error.message);
    return joinCrmErrorMessages(msgs);
  }, [
    salesDayQuery.isError,
    salesDayQuery.error,
    salesHourQuery.isError,
    salesHourQuery.error,
    topItemsQuery.isError,
    topItemsQuery.error,
  ]);

  const overviewLoading = salesDayQuery.isLoading || salesHourQuery.isLoading || topItemsQuery.isLoading;
  const overviewErrorFlag = salesDayQuery.isError || salesHourQuery.isError || topItemsQuery.isError;

  const insightTopItemsForBar = React.useMemo(() => {
    const items = [...dedupedTopItems];
    items.sort((a, b) => b.quantity - a.quantity);
    return items.slice(0, 6);
  }, [dedupedTopItems]);

  const topItemsTableRows = React.useMemo(() => dedupedTopItems, [dedupedTopItems]);

  const staffPerformers = React.useMemo(() => {
    const staff = [...(staffQuery.data?.staff ?? [])]
      .filter((row) => {
        const role = typeof row.role === "string" ? row.role.trim().toLowerCase() : "";
        return role === "waiter";
      })
      .map((row) => ({
        ...row,
        orderCount: safeFiniteNumber(row.orderCount, 0),
        revenue: safeFiniteNumber(row.revenue, 0),
        tips: safeFiniteNumber(row.tips, 0),
        averageOrderValue: safeFiniteNumber(row.averageOrderValue, 0),
        username: typeof row.username === "string" ? row.username : "",
      }));
    staff.sort((a, b) => b.revenue - a.revenue);
    return staff.slice(0, 8);
  }, [staffQuery.data?.staff]);

  const lowStockItems = React.useMemo(() => {
    const rows = lowStockQuery.data?.data;
    return Array.isArray(rows) ? rows.slice(0, 8) : [];
  }, [lowStockQuery.data?.data]);

  const insightErrors = React.useMemo(() => {
    const msgs: string[] = [];
    if (topItemsQuery.isError && topItemsQuery.error instanceof Error) {
      msgs.push(topItemsQuery.error.message);
    }
    return joinCrmErrorMessages(msgs);
  }, [topItemsQuery.isError, topItemsQuery.error]);

  const insightLoading = topItemsQuery.isLoading;
  const insightErrorFlag = topItemsQuery.isError;

  const operationalErrors = React.useMemo(() => {
    const msgs: string[] = [];
    if (staffQuery.isError && staffQuery.error instanceof Error) {
      msgs.push(staffQuery.error.message);
    }
    if (lowStockQuery.isError && lowStockQuery.error instanceof Error) {
      msgs.push(lowStockQuery.error.message);
    }
    return joinCrmErrorMessages(msgs);
  }, [
    staffQuery.isError,
    staffQuery.error,
    lowStockQuery.isError,
    lowStockQuery.error,
  ]);

  const operationalLoading = staffQuery.isLoading || lowStockQuery.isLoading;
  const operationalErrorFlag = staffQuery.isError || lowStockQuery.isError;

  const tableErrors = React.useMemo(() => {
    const msgs: string[] = [];
    if (topItemsQuery.isError && topItemsQuery.error instanceof Error) {
      msgs.push(topItemsQuery.error.message);
    }
    return joinCrmErrorMessages(msgs);
  }, [topItemsQuery.isError, topItemsQuery.error]);

  return {
    rangeLabel,
    staffRangeLabel,
    busyHourChart,
    aovChart,
    dailyOrdersChart,
    paidOrderCount,
    topProductName: topItem?.name ?? null,
    topProductQuantity: topItem?.quantity ?? null,
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
    tableLoading: topItemsQuery.isLoading,
    tableErrorFlag: topItemsQuery.isError,
    tableErrors,
  };
}
