"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { Calendar, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

import { utcMtdRange } from "../../_lib/date-range";
import { fetchProfitLossReport } from "../../_lib/fetch-profit-loss-report";
import { FINANCE_QUERY_STALE_MS, financePnlRangeQueryKey } from "../../_lib/finance-query-keys";

export function MonthlyCashFlow() {
  const { start, end } = utcMtdRange(new Date());
  const { data: pnl, isLoading } = useQuery({
    queryKey: financePnlRangeQueryKey(start, end),
    queryFn: () => fetchProfitLossReport({ start, end }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const netOperating = pnl?.netOperating ?? null;
  const isPositive = netOperating != null && netOperating >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-content-center rounded-sm bg-muted">
              <Calendar className="size-5" />
            </span>
            Net operating (P&amp;L)
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : netOperating == null ? (
          <p className="text-muted-foreground text-xs">No P&amp;L data for the current month.</p>
        ) : (
          <div className="space-y-0.5">
            <p className={`font-medium text-xl tabular-nums ${isPositive ? "text-emerald-500" : "text-destructive"}`}>
              {isPositive ? "+" : ""}
              {formatCurrency(netOperating, { noDecimals: false })}
            </p>
            <p className="text-muted-foreground text-xs">
              MTD accrual netOperating from the ledger.{" "}
              <Link href="/dashboard/accounting/cash-flow" className="text-primary underline-offset-4 hover:underline">
                Cash flow statement
              </Link>
            </p>
          </div>
        )}

        <Separator />
        <p className="flex items-center text-muted-foreground text-xs">
          {netOperating != null ? (
            isPositive ? (
              <TrendingUp className="mr-1 size-4 text-emerald-500" />
            ) : (
              <TrendingDown className="mr-1 size-4 text-destructive" />
            )
          ) : null}
          &nbsp;Server-reported P&amp;L field
        </p>
      </CardContent>
    </Card>
  );
}
