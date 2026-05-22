import type { ProfitLossReport } from "@/lib/pos-accounting-api";
import { posApiJson } from "@/lib/pos-api-fetch";

/**
 * Finance-local P&amp;L fetch (same endpoint as `posFetchPnL`, without importing that symbol in the finance tree).
 */
export async function fetchProfitLossReport(params?: { start?: string; end?: string }): Promise<ProfitLossReport> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs ? `/api/accounting/reports/pnl?${qs}` : "/api/accounting/reports/pnl";
  const res = await posApiJson<ProfitLossReport>(path);
  if (res.data == null) {
    throw new Error(typeof res.message === "string" && res.message ? res.message : "P&L report unavailable");
  }
  return res.data;
}
