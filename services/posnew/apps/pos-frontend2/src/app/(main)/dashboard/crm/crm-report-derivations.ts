import type { ReportRangeQuery, SalesReportBucket } from "@/lib/pos-reports-api";

/**
 * Hourly sales buckets use `period` like `YYYY-MM-DD HH:00` (see backend `dateGroupFormat` for `hour`).
 * Roll all days in the window into one 0–23 profile (operational volume, not a revenue series).
 */
export function aggregateOrderCountByHourOfDay(
  buckets: readonly SalesReportBucket[],
): readonly { hour: string; orders: number }[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const b of buckets) {
    const hour = parseHourFromSalesPeriod(typeof b.period === "string" ? b.period : "");
    if (hour === null) continue;
    const oc = Number(b.orderCount);
    counts[hour] += Number.isFinite(oc) ? Math.max(0, oc) : 0;
  }
  return counts.map((orders, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    orders,
  }));
}

function parseHourFromSalesPeriod(period: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/.exec(period.trim());
  if (!m) return null;
  const hour = Number(m[2]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

/** Four-stage daypart funnel from the same hourly rollup (distinct from the 24h bar chart). */
export function buildDaypartFunnelFromHourBins(
  bins: readonly { orders: number }[],
): readonly { stage: string; value: number }[] {
  const safeOrders = (o: number): number => {
    const n = Number(o);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const sumInclusive = (start: number, end: number): number =>
    bins.slice(start, end + 1).reduce((acc, b) => acc + safeOrders(b.orders), 0);

  const breakfast = sumInclusive(6, 10);
  const lunch = sumInclusive(11, 14);
  const dinner = sumInclusive(17, 21);
  const late = bins.reduce((acc, b, i) => {
    if ((i >= 6 && i <= 10) || (i >= 11 && i <= 14) || (i >= 17 && i <= 21)) return acc;
    return acc + safeOrders(b.orders);
  }, 0);

  return [
    { stage: "Breakfast", value: breakfast },
    { stage: "Lunch", value: lunch },
    { stage: "Dinner", value: dinner },
    { stage: "Late / off-peak", value: late },
  ];
}

export function formatCrmReportRangeDescription(w: ReportRangeQuery): string {
  try {
    const from = new Date(w.fromIso);
    const to = new Date(w.toIso);
    return `${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  } catch {
    return "Selected range";
  }
}

export function joinCrmErrorMessages(messages: readonly string[]): string {
  const uniq = [...new Set(messages.filter((m) => m.length > 0))];
  return uniq.join(" ");
}
