/**
 * Typed clients for POS operational reports (`/api/reports/*`).
 * Query window semantics mirror `parseReportQuery` in `apps/pos-backend/utils/reportRange.js`.
 */

import { posApiFetch, posApiJson } from "@/lib/pos-api-fetch";

/** Allowed `groupBy` values for sales aggregation (backend). */
export type ReportSalesGroupBy = "day" | "hour" | "week" | "month";

/** Parameters sent on the query string for ranged reports. */
export type ReportRangeQuery = {
  readonly fromIso: string;
  readonly toIso: string;
  readonly tz: string;
};

export type SalesReportSummary = {
  totalRevenue: number;
  totalSubtotal: number;
  totalTax: number;
  orderCount: number;
  averageOrderValue: number;
};

export type SalesReportBucket = {
  period: string;
  revenue: number;
  orderCount: number;
};

export type SalesReportData = {
  from: string;
  to: string;
  groupBy: ReportSalesGroupBy;
  timezone: string;
  summary: SalesReportSummary;
  buckets: SalesReportBucket[];
};

export type TopItemRow = {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
  percentOfRevenue: number;
};

export type TopItemsReportData = {
  from: string;
  to: string;
  items: TopItemRow[];
};

export type PaymentMethodBreakdownRow = {
  method: string;
  amount: number;
  orderCount: number;
  percentOfTotal: number;
};

export type PaymentMethodsReportData = {
  from: string;
  to: string;
  breakdown: PaymentMethodBreakdownRow[];
  total: number;
};

export type StaffReportRow = {
  userId: string | null;
  name: string;
  username?: string;
  role: string;
  orderCount: number;
  revenue: number;
  tips: number;
  totalItemsOrdered: number;
  totalDiscountApplied: number;
  averageOrderValue: number;
};

export type StaffReportData = {
  from: string;
  to: string;
  staff: StaffReportRow[];
};

export type VatReportData = {
  period: string;
  locationId: string | null;
  vatRate: number;
  totalSales: number;
  netSales: number;
  totalVATCollected: number;
};

export type BranchComparisonRow = {
  locationId: string;
  locationName: string;
  locationCode: string;
  orderCount: number;
  totalRevenue: number;
  totalTax: number;
  netSales: number;
  averageOrderValue: number;
};

export type BranchComparisonData = {
  from: string;
  to: string;
  summary: {
    totalRevenue: number;
    totalTax: number;
    totalNetSales: number;
    totalOrders: number;
    averageOrderValue: number;
    branchCount: number;
  };
  branches: BranchComparisonRow[];
};

export type VoidReportRow = {
  action: string;
  itemName: string;
  orderRef: string;
  tableNumber: string;
  voidedBy: string;
  reason: string;
  createdAt: string;
};

export type VoidsReportData = {
  from: string;
  to: string;
  count: number;
  items: VoidReportRow[];
};

export type SalesByCategoryRow = {
  categoryId: string | null;
  categoryName: string;
  itemCount: number;
  totalRevenue: number;
  percentageOfTotal: number;
};

export type SalesByCategoryData = {
  from: string;
  to: string;
  totalRevenue: number;
  categories: SalesByCategoryRow[];
};

export type ExpenseBreakdownRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
};

export type ExpenseBreakdownData = {
  from: string;
  to: string;
  totalExpense: number;
  groups: ExpenseBreakdownRow[];
};

export type DiscountAuditRow = {
  _id: string;
  tableNo?: number;
  totalBefore?: number;
  totalAfter?: number;
  discountAmount?: number;
  discountType?: string;
  discountScope?: string;
  discountValue?: number;
  orderItemName?: string;
  reason?: string;
  createdAt?: string;
  appliedBy?: { name?: string; role?: string } | null;
  /** Denormalized staff name from API (when populated). */
  discountedBy?: string;
};

export type DiscountAuditListResult = {
  readonly rows: readonly DiscountAuditRow[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly summary: {
    readonly totalDiscountAmount: number;
    readonly totalEntries: number;
    readonly paidRevenueInPeriod?: number | null;
    readonly revenueImpactPercent?: number | null;
  };
};

export type PosAuditRow = {
  readonly id: string;
  readonly action: string;
  readonly metadata: Record<string, unknown>;
  readonly ip: string;
  readonly createdAt: string;
  readonly user: { readonly id: string; readonly name?: string; readonly username?: string; readonly role?: string } | null;
  readonly location: { readonly id: string; readonly name?: string; readonly code?: string } | null;
};

export type PosAuditListResult = {
  readonly rows: readonly PosAuditRow[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
};

export type ReportSchedule = {
  _id: string;
  name: string;
  reportType: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  webhookUrl?: string;
  isActive: boolean;
  nextRunAt: string;
  lastRunAt?: string | null;
};

const CRM_REPORTS_ROOT = ["crm", "reports"] as const;

export function crmReportSalesQueryKey(parts: ReportRangeQuery & { readonly groupBy: ReportSalesGroupBy }) {
  return [...CRM_REPORTS_ROOT, "sales", parts] as const;
}

export function crmReportTopItemsQueryKey(parts: ReportRangeQuery) {
  return [...CRM_REPORTS_ROOT, "top-items", parts] as const;
}

export function crmReportPaymentMethodsQueryKey(parts: ReportRangeQuery) {
  return [...CRM_REPORTS_ROOT, "payment-methods", parts] as const;
}

export function crmReportStaffQueryKey(parts: ReportRangeQuery) {
  return [...CRM_REPORTS_ROOT, "staff", parts] as const;
}

export function vatReportQueryKey(parts: { readonly year: number; readonly month: number }) {
  return [...CRM_REPORTS_ROOT, "vat", parts] as const;
}

export function branchComparisonQueryKey(parts: ReportRangeQuery) {
  return [...CRM_REPORTS_ROOT, "branch-comparison", parts] as const;
}

export function voidsReportQueryKey(parts: ReportRangeQuery & { readonly userId?: string }) {
  return [...CRM_REPORTS_ROOT, "voids", parts] as const;
}

export function salesByCategoryQueryKey(parts: ReportRangeQuery) {
  return [...CRM_REPORTS_ROOT, "sales-by-category", parts] as const;
}

export function expensesReportQueryKey(parts: ReportRangeQuery) {
  return [...CRM_REPORTS_ROOT, "expenses", parts] as const;
}

/**
 * IANA timezone for `$dateToString` on the backend (defaults to UTC when missing/invalid there).
 * Use the browser zone so bucket labels align with staff expectations.
 */
export function getResolvedReportTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * Default window: `to` = end of today, `from` = start of the calendar day `daySpan` days before `to`,
 * after the same midnight/end-of-day normalization as `parseReportQuery`.
 *
 * @param daySpan Number of days to subtract from `to` before clamping `from` to 00:00:00 (backend uses 7).
 */
export function buildReportRangeWindow(params?: { readonly daySpan?: number }): ReportRangeQuery {
  const daySpan = params?.daySpan ?? 7;
  const to = new Date();
  const from = new Date(to.getTime() - daySpan * 86400000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    tz: getResolvedReportTimeZone(),
  };
}

/** Build `ReportRangeQuery` from dashboard date strings (`yyyy-MM-dd`, local midnight bounds). */
export function reportRangeFromLocalDates(fromYmd: string, toYmd: string): ReportRangeQuery {
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T23:59:59.999`);
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    tz: getResolvedReportTimeZone(),
  };
}

export function buildSalesReportSearchParams(
  parts: ReportRangeQuery & { readonly groupBy: ReportSalesGroupBy },
): string {
  const q = new URLSearchParams();
  q.set("from", parts.fromIso);
  q.set("to", parts.toIso);
  q.set("groupBy", parts.groupBy);
  q.set("tz", parts.tz);
  return q.toString();
}

export function buildRangedReportSearchParams(parts: ReportRangeQuery): string {
  const q = new URLSearchParams();
  q.set("from", parts.fromIso);
  q.set("to", parts.toIso);
  q.set("tz", parts.tz);
  return q.toString();
}

async function readReportData<T>(path: string): Promise<T> {
  const res = await posApiJson<T>(path);
  if (res.data === undefined) {
    throw new Error("Report response missing data.");
  }
  return res.data;
}

export async function fetchSalesReport(
  parts: ReportRangeQuery & { readonly groupBy: ReportSalesGroupBy },
): Promise<SalesReportData> {
  const qs = buildSalesReportSearchParams(parts);
  return readReportData<SalesReportData>(`/api/reports/sales?${qs}`);
}

export async function fetchTopItemsReport(parts: ReportRangeQuery): Promise<TopItemsReportData> {
  const qs = buildRangedReportSearchParams(parts);
  return readReportData<TopItemsReportData>(`/api/reports/top-items?${qs}`);
}

export async function fetchPaymentMethodsReport(parts: ReportRangeQuery): Promise<PaymentMethodsReportData> {
  const qs = buildRangedReportSearchParams(parts);
  return readReportData<PaymentMethodsReportData>(`/api/reports/payment-methods?${qs}`);
}

export async function fetchStaffReport(parts: ReportRangeQuery): Promise<StaffReportData> {
  const qs = buildRangedReportSearchParams(parts);
  return readReportData<StaffReportData>(`/api/reports/staff?${qs}`);
}

function buildVatSearchParams(parts: { readonly year: number; readonly month: number }): string {
  const q = new URLSearchParams();
  q.set("year", String(parts.year));
  q.set("month", String(parts.month));
  return q.toString();
}

export async function fetchVatReport(parts: {
  readonly year: number;
  readonly month: number;
}): Promise<VatReportData> {
  const qs = buildVatSearchParams(parts);
  return readReportData<VatReportData>(`/api/reports/vat?${qs}`);
}

export async function downloadVatReportPdf(parts: {
  readonly year: number;
  readonly month: number;
}): Promise<void> {
  const qs = buildVatSearchParams(parts);
  const response = await posApiFetch(`/api/reports/vat/pdf?${qs}`);
  if (!response.ok) {
    throw new Error(`VAT PDF export failed (${response.status}).`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `vat-report-${parts.year}-${String(parts.month).padStart(2, "0")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function fetchBranchComparisonReport(
  parts: ReportRangeQuery,
): Promise<BranchComparisonData> {
  const qs = buildRangedReportSearchParams(parts);
  return readReportData<BranchComparisonData>(`/api/reports/branch-comparison?${qs}`);
}

export async function fetchVoidsReport(
  parts: ReportRangeQuery & { readonly userId?: string },
): Promise<VoidsReportData> {
  const query = new URLSearchParams(buildRangedReportSearchParams(parts));
  if (parts.userId) query.set("userId", parts.userId);
  return readReportData<VoidsReportData>(`/api/reports/voids?${query.toString()}`);
}

export async function fetchSalesByCategoryReport(
  parts: ReportRangeQuery,
): Promise<SalesByCategoryData> {
  const qs = buildRangedReportSearchParams(parts);
  return readReportData<SalesByCategoryData>(`/api/reports/sales-by-category?${qs}`);
}

export async function fetchExpensesReport(
  parts: ReportRangeQuery,
): Promise<ExpenseBreakdownData> {
  const qs = buildRangedReportSearchParams(parts);
  return readReportData<ExpenseBreakdownData>(`/api/reports/expenses?${qs}`);
}

export async function fetchDiscountAuditPage(params: {
  readonly page?: number;
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
}): Promise<DiscountAuditListResult> {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await posApiJson<DiscountAuditRow[]>(`/api/reports/discount-audit${suffix}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  const summaryRaw = res as {
    summary?: {
      totalDiscountAmount?: number;
      totalEntries?: number;
      paidRevenueInPeriod?: number | null;
      revenueImpactPercent?: number | null;
    };
  };
  const summary = summaryRaw.summary ?? {
    totalDiscountAmount: 0,
    totalEntries: res.total ?? rows.length,
  };
  return {
    rows,
    page: res.page ?? 1,
    limit: res.limit ?? 50,
    total: res.total ?? rows.length,
    summary: {
      totalDiscountAmount: Number(summary.totalDiscountAmount ?? 0),
      totalEntries: Number(summary.totalEntries ?? res.total ?? rows.length),
      paidRevenueInPeriod:
        summary.paidRevenueInPeriod != null && Number.isFinite(Number(summary.paidRevenueInPeriod))
          ? Number(summary.paidRevenueInPeriod)
          : null,
      revenueImpactPercent:
        summary.revenueImpactPercent != null && Number.isFinite(Number(summary.revenueImpactPercent))
          ? Number(summary.revenueImpactPercent)
          : null,
    },
  };
}

export async function fetchPosAuditPage(params: {
  readonly page?: number;
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
  readonly action?: string;
  readonly userId?: string;
}): Promise<PosAuditListResult> {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.action) q.set("action", params.action);
  if (params.userId) q.set("userId", params.userId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await posApiJson<PosAuditRow[]>(`/api/reports/pos-audit${suffix}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    rows,
    page: res.page ?? 1,
    limit: res.limit ?? 50,
    total: res.total ?? rows.length,
  };
}

export async function fetchReportSchedules(): Promise<ReportSchedule[]> {
  const response = await posApiJson<ReportSchedule[]>("/api/report-schedules");
  return Array.isArray(response.data) ? response.data : [];
}

export async function createReportSchedule(body: {
  name: string;
  reportType: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  webhookUrl?: string;
}) {
  return posApiJson<ReportSchedule>("/api/report-schedules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function testSendReportSchedule(scheduleId: string) {
  return posApiJson<{ tested: boolean }>(`/api/report-schedules/${scheduleId}/test-send`, {
    method: "POST",
  });
}
