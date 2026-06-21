"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

import { utcYtdRangeThroughToday } from "../_lib/date-range";
import { fetchProfitLossReport } from "../_lib/fetch-profit-loss-report";
import { FINANCE_QUERY_STALE_MS, financePnlRangeQueryKey } from "../_lib/finance-query-keys";

const MAX_VISIBLE = 7;

type ExpenseRow = {
  readonly key: string;
  readonly label: string;
  readonly amount: number;
};

export function SpendingBreakdown() {
  const ytd = utcYtdRangeThroughToday(new Date());
  const { data, isLoading } = useQuery({
    queryKey: financePnlRangeQueryKey(ytd.start, ytd.end),
    queryFn: () => fetchProfitLossReport({ start: ytd.start, end: ytd.end }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const expenseRows: readonly ExpenseRow[] = useMemo(() => {
    const rows = data?.trialBalance?.rows ?? [];
    return rows
      .filter((r) => r.type === "expense")
      .map((r) => {
        const key = r.accountId ?? r.code ?? r.name ?? "";
        const label = r.name ?? r.code ?? "Account";
        const amount = Math.abs(r.balance ?? 0);
        return { key: String(key || label), label, amount };
      })
      .filter((x) => x.amount > 0 && x.key.length > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, MAX_VISIBLE);
  }, [data]);

  const total = expenseRows.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Breakdown</CardTitle>
        <CardDescription>
          Year-to-date expense accounts from the P&amp;L trial balance (top {MAX_VISIBLE}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-xs">No posted expense activity yet this year.</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="font-medium text-2xl">{formatCurrency(total, { noDecimals: true })}</div>
              <div className="flex h-6 w-full overflow-hidden rounded-md">
                {expenseRows.map((item, index) => {
                  const width = (item.amount / total) * 100;
                  const alpha = Math.max(0.35, 1 - index * 0.08);
                  return (
                    <div
                      key={item.key}
                      className="h-full shrink-0 border-background border-l first:border-l-0"
                      style={{
                        width: `${width}%`,
                        background: `color-mix(in oklch, var(--primary) ${alpha * 100}%, transparent)`,
                      }}
                      title={`${item.label}: ${formatCurrency(item.amount)}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              {expenseRows.map((item, index) => {
                const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
                const alpha = Math.max(0.35, 1 - index * 0.08);
                return (
                  <div key={item.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-3 rounded-sm"
                        style={{
                          background: `color-mix(in oklch, var(--primary) ${alpha * 100}%, transparent)`,
                        }}
                      />
                      <span className="truncate text-muted-foreground text-sm">{item.label}</span>
                    </div>
                    <span className="font-medium text-sm tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
