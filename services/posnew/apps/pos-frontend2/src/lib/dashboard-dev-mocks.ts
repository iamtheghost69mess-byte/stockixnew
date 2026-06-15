/**
 * Professional-looking placeholder data for local UI review when APIs are unavailable.
 *
 * Active in development unless `NEXT_PUBLIC_DASHBOARD_USE_LIVE_DATA=1` is set.
 */

import type { IngredientLean } from "@/lib/inventory-api";
import type {
  DashboardRange,
  DefaultDashboardChartRow,
  DefaultDashboardPayload,
  DefaultDashboardSummary,
} from "@/lib/pos-dashboard-api";
import {
  getResolvedReportTimeZone,
  type PaymentMethodsReportData,
  type ReportRangeQuery,
  type ReportSalesGroupBy,
  type SalesReportBucket,
  type SalesReportData,
  type StaffReportData,
  type TopItemsReportData,
} from "@/lib/pos-reports-api";

/** When true, default + CRM dashboards use in-memory fixtures instead of network calls. */
export function shouldUseDevDashboardMocks(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DASHBOARD_USE_LIVE_DATA !== "1";
}

function dayCountForRange(range: DashboardRange): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 90;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Executive default dashboard — revenue, COGS, profit, visitors + time series. */
export function buildMockDefaultDashboardPayload(range: DashboardRange): DefaultDashboardPayload {
  const n = dayCountForRange(range);
  const chartData: DefaultDashboardChartRow[] = [];
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const phase = (i / Math.max(1, n - 1)) * Math.PI * 2;
    const revenue = 9200 + Math.sin(phase * 1.4) * 2100 + i * 65;
    const cost = revenue * 0.36 + Math.cos(phase) * 180;
    const profit = revenue - cost;
    const visitors = 220 + Math.round(Math.sin(phase * 2.1) * 55) + Math.round(i * 1.4);
    chartData.push({
      date: iso,
      revenue: Math.round(revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      visitors: Math.max(40, visitors),
    });
  }

  const sum = (pick: (r: DefaultDashboardChartRow) => number): number => chartData.reduce((s, r) => s + pick(r), 0);

  const summary: DefaultDashboardSummary = {
    totalRevenue: sum((r) => r.revenue),
    totalCost: sum((r) => r.cost),
    totalProfit: sum((r) => r.profit),
    totalVisitors: sum((r) => r.visitors),
    revenueChange: 5.4,
    costChange: -0.8,
    profitChange: 7.1,
    visitorsChange: 3.2,
  };

  return {
    range,
    tz: getResolvedReportTimeZone(),
    displayCurrency: "USD",
    summary,
    chartData,
  };
}

function mockSalesDayBuckets(range: ReportRangeQuery): SalesReportBucket[] {
  const from = new Date(range.fromIso);
  const to = new Date(range.toIso);
  const buckets: SalesReportBucket[] = [];
  const stepMs = 86400000;
  for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
    const d = new Date(t);
    const period = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const i = buckets.length;
    const orderCount = 38 + (i % 5) * 12 + (i % 3) * 7;
    const revenue = orderCount * (17.2 + (i % 4) * 1.1);
    buckets.push({ period, revenue: Math.round(revenue * 100) / 100, orderCount });
  }
  return buckets.slice(0, 14);
}

function mockSalesHourBuckets(range: ReportRangeQuery): SalesReportBucket[] {
  const from = new Date(range.fromIso);
  from.setHours(0, 0, 0, 0);
  const buckets: SalesReportBucket[] = [];
  const maxDays = 7;
  for (let day = 0; day < maxDays; day += 1) {
    const base = new Date(from.getTime() + day * 86400000);
    const y = base.getFullYear();
    const m = pad2(base.getMonth() + 1);
    const dd = pad2(base.getDate());
    for (let h = 0; h < 24; h += 1) {
      const period = `${y}-${m}-${dd} ${pad2(h)}:00`;
      let orderCount = 3;
      if (h >= 7 && h <= 10) orderCount = 9 + (h % 4);
      if (h >= 11 && h <= 14) orderCount = 21 + (h % 6);
      if (h >= 17 && h <= 21) orderCount = 26 + (h % 8);
      if (h >= 22 || h <= 2) orderCount = 4 + (h % 3);
      const revenue = orderCount * (16.5 + (day % 3) * 0.6);
      buckets.push({ period, revenue: Math.round(revenue * 100) / 100, orderCount });
    }
  }
  return buckets;
}

function buildSalesReport(
  range: ReportRangeQuery,
  groupBy: ReportSalesGroupBy,
  buckets: SalesReportBucket[],
): SalesReportData {
  const tz = getResolvedReportTimeZone();
  const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
  const orderCount = buckets.reduce((s, b) => s + b.orderCount, 0);
  const totalSubtotal = totalRevenue * 0.91;
  const totalTax = totalRevenue * 0.09;
  return {
    from: range.fromIso,
    to: range.toIso,
    groupBy,
    timezone: tz,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalSubtotal: Math.round(totalSubtotal * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      orderCount,
      averageOrderValue: orderCount > 0 ? Math.round((totalRevenue / orderCount) * 100) / 100 : 0,
    },
    buckets,
  };
}

export function mockCrmSalesReport(range: ReportRangeQuery, groupBy: ReportSalesGroupBy): SalesReportData {
  const buckets = groupBy === "day" ? mockSalesDayBuckets(range) : mockSalesHourBuckets(range);
  return buildSalesReport(range, groupBy, buckets);
}

export function mockCrmTopItems(range: ReportRangeQuery): TopItemsReportData {
  const items = [
    { menuItemId: "mi-001", name: "Grilled Atlantic Salmon", quantity: 186, revenue: 4212.5, percentOfRevenue: 18.4 },
    { menuItemId: "mi-002", name: "Truffle Mushroom Risotto", quantity: 164, revenue: 3830.0, percentOfRevenue: 16.8 },
    { menuItemId: "mi-003", name: "Wagyu Burger & Frites", quantity: 142, revenue: 3198.0, percentOfRevenue: 14.0 },
    { menuItemId: "mi-004", name: "Caesar Salad (Large)", quantity: 201, revenue: 2410.0, percentOfRevenue: 10.5 },
    { menuItemId: "mi-005", name: "Seasonal Soup", quantity: 178, revenue: 1890.0, percentOfRevenue: 8.3 },
    { menuItemId: "mi-006", name: "Espresso Tiramisu", quantity: 133, revenue: 1722.0, percentOfRevenue: 7.5 },
    { menuItemId: "mi-007", name: "House Red (Btl)", quantity: 96, revenue: 1680.0, percentOfRevenue: 7.3 },
    { menuItemId: "mi-008", name: "Kids Mac & Cheese", quantity: 124, revenue: 1240.0, percentOfRevenue: 5.4 },
    { menuItemId: "mi-009", name: "Iced Matcha Latte", quantity: 212, revenue: 1166.0, percentOfRevenue: 5.1 },
    { menuItemId: "mi-010", name: "Charred Broccolini", quantity: 98, revenue: 882.0, percentOfRevenue: 3.9 },
    { menuItemId: "mi-011", name: "Garlic Naan (2pc)", quantity: 156, revenue: 468.0, percentOfRevenue: 2.0 },
  ];
  return { from: range.fromIso, to: range.toIso, items };
}

export function mockCrmPaymentMethods(range: ReportRangeQuery): PaymentMethodsReportData {
  const breakdown = [
    { method: "Card", amount: 28420.5, orderCount: 612, percentOfTotal: 58.2 },
    { method: "Cash", amount: 8420.0, orderCount: 318, percentOfTotal: 17.2 },
    { method: "Digital wallet", amount: 6230.25, orderCount: 204, percentOfTotal: 12.8 },
    { method: "Gift card", amount: 3100.0, orderCount: 88, percentOfTotal: 6.4 },
    { method: "House account", amount: 2650.0, orderCount: 42, percentOfTotal: 5.4 },
  ];
  const total = breakdown.reduce((s, b) => s + b.amount, 0);
  return { from: range.fromIso, to: range.toIso, breakdown, total: Math.round(total * 100) / 100 };
}

export function mockCrmStaff(range: ReportRangeQuery): StaffReportData {
  const staff = [
    {
      userId: "u1",
      name: "Jordan Lee",
      role: "Server",
      orderCount: 142,
      revenue: 6820,
      tips: 920,
      totalItemsOrdered: 420,
      totalDiscountApplied: 120,
      averageOrderValue: 48.0,
    },
    {
      userId: "u2",
      name: "Sam Rivera",
      role: "Server",
      orderCount: 128,
      revenue: 6010,
      tips: 804,
      totalItemsOrdered: 380,
      totalDiscountApplied: 95,
      averageOrderValue: 47.0,
    },
    {
      userId: "u3",
      name: "Alex Morgan",
      role: "Bartender",
      orderCount: 118,
      revenue: 5340,
      tips: 1102,
      totalItemsOrdered: 310,
      totalDiscountApplied: 210,
      averageOrderValue: 45.3,
    },
    {
      userId: "u4",
      name: "Riley Chen",
      role: "Server",
      orderCount: 104,
      revenue: 4980,
      tips: 688,
      totalItemsOrdered: 290,
      totalDiscountApplied: 88,
      averageOrderValue: 47.9,
    },
    {
      userId: "u5",
      name: "Taylor Brooks",
      role: "Shift lead",
      orderCount: 96,
      revenue: 4720,
      tips: 512,
      totalItemsOrdered: 260,
      totalDiscountApplied: 72,
      averageOrderValue: 49.2,
    },
    {
      userId: "u6",
      name: "Casey Nguyen",
      role: "Server",
      orderCount: 88,
      revenue: 3980,
      tips: 440,
      totalItemsOrdered: 240,
      totalDiscountApplied: 60,
      averageOrderValue: 45.2,
    },
  ];
  return { from: range.fromIso, to: range.toIso, staff };
}

export function mockCrmLowStockItems(): IngredientLean[] {
  return [
    { _id: "ing-1", name: "Heavy cream (32oz)", currentStock: 4, reorderThreshold: 12, unit: "ea" },
    { _id: "ing-2", name: "Arborio rice (10lb)", currentStock: 1, reorderThreshold: 3, unit: "bag" },
    { _id: "ing-3", name: "Parmigiano wedge", currentStock: 2, reorderThreshold: 6, unit: "ea" },
    { _id: "ing-4", name: "Fresh basil (bulk)", currentStock: 0.4, reorderThreshold: 1.5, unit: "lb" },
    { _id: "ing-5", name: "Olive oil blend (3L)", currentStock: 2, reorderThreshold: 4, unit: "btl" },
    { _id: "ing-6", name: "Free-range chicken breast", currentStock: 8, reorderThreshold: 20, unit: "lb" },
  ];
}
