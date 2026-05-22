"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { WalletMinimal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { posFetchAccountingConfig, posFetchBalanceSheet, posFetchCashFlow } from "@/lib/pos-accounting-api";
import { formatCurrency } from "@/lib/utils";

import { toIsoDateUtc, utcMtdRange } from "../../_lib/date-range";

function resolveAccountingAccountId(ref: string | { _id?: string } | null | undefined): string | null {
  if (ref == null) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref._id === "string") return ref._id;
  return null;
}

export function PrimaryAccount() {
  const asOf = toIsoDateUtc(new Date());
  const mtd = utcMtdRange(new Date());

  const configQuery = useQuery({
    queryKey: ["finance", "accounting-config", "primary-cash"] as const,
    queryFn: () => posFetchAccountingConfig(),
  });

  const bsQuery = useQuery({
    queryKey: ["finance", "balance-sheet", "primary-account", asOf] as const,
    queryFn: () => posFetchBalanceSheet({ asOf }),
  });

  const cfQuery = useQuery({
    queryKey: ["finance", "cash-flow", "mtd-primary-foot", mtd.start, mtd.end] as const,
    queryFn: () => posFetchCashFlow({ start: mtd.start, end: mtd.end }),
  });

  const isLoading = configQuery.isLoading || bsQuery.isLoading;
  const cashAccountId = resolveAccountingAccountId(configQuery.data?.defaultCashAccount ?? null);
  const cashLine =
    cashAccountId && bsQuery.data?.assets
      ? bsQuery.data.assets.find((a) => String(a.accountId ?? "") === String(cashAccountId))
      : undefined;
  const balance = cashLine?.netBalance;
  const accountName = cashLine?.name ?? (cashAccountId ? "Cash account" : null);
  const periodNetChange = cfQuery.data?.categories?.netChange;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-content-center rounded-sm bg-muted">
              <WalletMinimal className="size-5" />
            </span>
            Primary Account
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : balance == null || !accountName ? (
          <p className="text-muted-foreground text-xs">
            Set a default cash account in accounting configuration to show this balance.
          </p>
        ) : (
          <div className="space-y-0.5">
            <p className="font-medium text-xl tabular-nums">{formatCurrency(balance, { noDecimals: false })}</p>
            <p className="text-muted-foreground text-xs">{accountName}</p>
            {periodNetChange != null ? (
              <CardDescription className="pt-1 text-xs">
                Cash-mapped accounts (MTD) net change: {formatCurrency(periodNetChange, { noDecimals: false })}
              </CardDescription>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button className="flex-1" size="sm" asChild>
            <Link href="/dashboard/accounting/ledger">Transfer</Link>
          </Button>
          <Button className="flex-1" size="sm" variant="outline" asChild>
            <Link href="/dashboard/accounting/ledger">Ledger</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
