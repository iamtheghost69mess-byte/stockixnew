/** UTC calendar helpers for accounting report windows (consistent with GL date strings `yyyy-MM-dd`). */

export const FINANCE_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type FinanceMonthSlice = {
  readonly start: string;
  readonly end: string;
  readonly label: string;
  readonly key: string;
};

export function toIsoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Rolling window: calendar month offset from the current UTC month (0 = this month). */
export function utcMonthSliceRelative(offsetFromCurrentMonth: number, now: Date = new Date()): FinanceMonthSlice {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetFromCurrentMonth, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    start: toIsoDateUtc(start),
    end: toIsoDateUtc(end),
    label: FINANCE_MONTH_LABELS[m],
    key: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

/** Last N calendar months ending with the current UTC month (same shape as legacy finance hook). */
export function utcLastNMonthSlices(n: number, now: Date = new Date()): readonly FinanceMonthSlice[] {
  const startOffset = -(n - 1);
  return Array.from({ length: n }, (_, i) => utcMonthSliceRelative(startOffset + i, now));
}

/** Year-to-date through “today” in UTC: Jan 1 .. current UTC calendar date. */
export function utcYtdRangeThroughToday(now: Date = new Date()): { readonly start: string; readonly end: string } {
  const y = now.getUTCFullYear();
  const start = toIsoDateUtc(new Date(Date.UTC(y, 0, 1)));
  const end = toIsoDateUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  return { start, end };
}

/** Month-to-date in UTC: first day of current month .. today. */
export function utcMtdRange(now: Date = new Date()): { readonly start: string; readonly end: string } {
  const start = toIsoDateUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const end = toIsoDateUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  return { start, end };
}

/**
 * Calendar months from January of the current UTC year through the current month.
 * Past months are full months; the current month runs through today (UTC).
 */
export function utcYtdMonthSlicesForChart(now: Date = new Date()): readonly FinanceMonthSlice[] {
  const y = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const slices: FinanceMonthSlice[] = [];
  for (let m = 0; m <= currentMonth; m += 1) {
    const start = toIsoDateUtc(new Date(Date.UTC(y, m, 1)));
    const endDate = m === currentMonth ? new Date(Date.UTC(y, m, now.getUTCDate())) : new Date(Date.UTC(y, m + 1, 0));
    slices.push({
      start,
      end: toIsoDateUtc(endDate),
      label: FINANCE_MONTH_LABELS[m],
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
    });
  }
  return slices;
}
