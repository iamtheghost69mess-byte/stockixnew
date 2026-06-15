"use client";

import { useQuery } from "@tanstack/react-query";
import { HandCoins, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

import { utcYtdRangeThroughToday } from "../../_lib/date-range";
import { fetchProfitLossReport } from "../../_lib/fetch-profit-loss-report";
import { FINANCE_QUERY_STALE_MS, financePnlRangeQueryKey } from "../../_lib/finance-query-keys";

export function SavingsRate() {
  const ytd = utcYtdRangeThroughToday(new Date());
  const { data, isLoading } = useQuery({
    queryKey: financePnlRangeQueryKey(ytd.start, ytd.end),
    queryFn: () => fetchProfitLossReport({ start: ytd.start, end: ytd.end }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const revenue = data?.revenue ?? null;
  const netOperating = data?.netOperating ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-content-center rounded-sm bg-muted">
              <HandCoins className="size-5" />
            </span>
            <span>Savings Rate</span>
          </div>
        </CardTitle>
        <CardDescription>YTD revenue and net operating from one P&amp;L request.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">Revenue</span>
              <span className="font-medium text-lg tabular-nums">
                {revenue == null ? "—" : formatCurrency(revenue, { noDecimals: false })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">Net operating</span>
              <span className="font-medium text-lg tabular-nums">
                {netOperating == null ? "—" : formatCurrency(netOperating, { noDecimals: false })}
              </span>
            </div>
          </div>
        )}
        <Separator />
        <p className="text-muted-foreground text-xs">
          Year-to-date figures from a single P&amp;L report (no derived KPIs).
        </p>
      </CardContent>
    </Card>
  );
}
