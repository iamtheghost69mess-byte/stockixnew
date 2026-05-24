/** Shared TanStack Query keys so parallel cards dedupe identical P&amp;L windows. */

export const FINANCE_QUERY_STALE_MS = 5 * 60 * 1000;

/** One key per explicit `start`/`end` pair returned by the P&amp;L API. */
export function financePnlRangeQueryKey(
  start: string,
  end: string,
): readonly ["finance", "pnl", "range", string, string] {
  return ["finance", "pnl", "range", start, end] as const;
}
