import { posApiJson } from "@/lib/pos-api-fetch";

export type DashboardRange = "7d" | "30d" | "90d";

export type DefaultDashboardChartRow = {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  visitors: number;
};

/** Alias for chart row mapping (revenue / visitors series). */
export type DashboardDefaultChartRow = DefaultDashboardChartRow;

export type DefaultDashboardSummary = {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalVisitors: number;
  revenueChange: number;
  costChange: number;
  profitChange: number;
  visitorsChange: number;
};

export type DefaultDashboardPayload = {
  range: DashboardRange;
  tz: string;
  displayCurrency: string;
  summary: DefaultDashboardSummary;
  todayKpis?: {
    todayRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    openTables: number;
  };
  chartData: DefaultDashboardChartRow[];
};

export type DashboardRecentVoidRow = {
  itemName: string;
  orderRef: string;
  tableNumber: string;
  voidedBy: string;
  reason: string;
  createdAt: string;
};

export type DashboardRecentOrderRow = {
  orderId: string;
  /** Present when the order still resolves to a floor table (deep link into POS session). */
  tableId?: string;
  tableNumber: string;
  waiterName: string;
  totalAmount: number;
  status: string;
  accountingSaleStatus?: "ok" | "failed" | "skipped" | null;
  accountingSaleError?: string;
  createdAt: string;
};

export type DashboardLowStockRow = {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  minStock: number;
  unit: string;
};

export async function fetchDashboardDefault(range: DashboardRange): Promise<DefaultDashboardPayload> {
  const q = new URLSearchParams({ range });
  const res = await posApiJson<DefaultDashboardPayload>(`/api/dashboard/default?${q.toString()}`);
  if (!res.data) {
    throw new Error("Missing dashboard data.");
  }
  const d = res.data;
  const normalizedRange: DashboardRange = d.range === "7d" || d.range === "30d" || d.range === "90d" ? d.range : "90d";
  return { ...d, range: normalizedRange };
}

export async function fetchDashboardRecentVoids(limit = 5): Promise<DashboardRecentVoidRow[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await posApiJson<DashboardRecentVoidRow[]>(`/api/dashboard/recent-voids?${q.toString()}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchDashboardRecentOrders(limit = 5): Promise<DashboardRecentOrderRow[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await posApiJson<DashboardRecentOrderRow[]>(`/api/dashboard/recent-orders?${q.toString()}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchDashboardLowStock(): Promise<DashboardLowStockRow[]> {
  const res = await posApiJson<DashboardLowStockRow[]>("/api/dashboard/low-stock");
  return Array.isArray(res.data) ? res.data : [];
}
