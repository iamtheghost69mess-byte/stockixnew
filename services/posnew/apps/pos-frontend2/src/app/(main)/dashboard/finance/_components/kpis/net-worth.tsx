"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { posFetchBalanceSheet } from "@/lib/pos-accounting-api";
import { formatCurrency } from "@/lib/utils";

import { toIsoDateUtc } from "../../_lib/date-range";

export function NetWorth() {
  const asOf = toIsoDateUtc(new Date());
  const { data: bs, isLoading } = useQuery({
    queryKey: ["finance", "balance-sheet", "net-worth", asOf] as const,
    queryFn: () => posFetchBalanceSheet({ asOf }),
  });

  const totalEquity = bs?.totalEquity ?? null;
  const totalAssets = bs?.totalAssets ?? null;
  const totalLiabilities = bs?.totalLiabilities ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-content-center rounded-sm bg-muted">
              <Banknote className="size-5" />
            </span>
            Net Worth
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : totalEquity == null ? (
          <p className="text-muted-foreground text-xs">Balance sheet data is not available.</p>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <p className="font-medium text-xl tabular-nums">{formatCurrency(totalEquity, { noDecimals: false })}</p>
            </div>
            <p className="text-muted-foreground text-xs">Total equity (from balance sheet)</p>
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
          <div>
            Assets:{" "}
            <span className="font-medium text-foreground">
              {totalAssets == null ? "—" : formatCurrency(totalAssets)}
            </span>
          </div>
          <div className="text-right">
            Liab:{" "}
            <span className="font-medium text-foreground">
              {totalLiabilities == null ? "—" : formatCurrency(totalLiabilities)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
