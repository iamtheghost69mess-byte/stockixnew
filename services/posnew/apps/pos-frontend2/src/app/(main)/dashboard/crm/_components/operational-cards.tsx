"use client";

import * as React from "react";

import { Clock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { IngredientLean } from "@/lib/inventory-api";
import type { StaffReportRow } from "@/lib/pos-reports-api";
import { formatCurrency } from "@/lib/utils";

const STAFF_SKELETON_KEYS = ["ss1", "ss2", "ss3", "ss4", "ss5"] as const;
const LOW_STOCK_SKELETON_KEYS = ["ls1", "ls2", "ls3", "ls4"] as const;

export type OperationalCardsProps = {
  readonly rangeLabel: string;
  readonly staffRows: readonly StaffReportRow[];
  readonly lowStockItems: readonly IngredientLean[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
};

function formatStockLine(ing: IngredientLean): string {
  const cur = ing.currentStock;
  const th = ing.reorderThreshold;
  const curLabel = typeof cur === "number" ? new Intl.NumberFormat(undefined).format(cur) : "—";
  const thLabel = typeof th === "number" ? new Intl.NumberFormat(undefined).format(th) : "—";
  return `${curLabel} on hand · reorder at ${thLabel}`;
}

export function OperationalCards(props: OperationalCardsProps) {
  const maxRevenue = React.useMemo(() => {
    if (props.staffRows.length === 0) return 1;
    return Math.max(...props.staffRows.map((s) => s.revenue), 1);
  }, [props.staffRows]);

  const staffWithRevenue = React.useMemo(() => props.staffRows.filter((s) => s.revenue > 0), [props.staffRows]);

  let staffBody: React.ReactNode;
  if (props.isLoading) {
    staffBody = (
      <div className="space-y-2.5">
        {STAFF_SKELETON_KEYS.map((k) => (
          <div key={k} className="space-y-0.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  } else if (props.staffRows.length === 0) {
    staffBody = (
      <div className="flex min-h-32 items-center justify-center text-muted-foreground text-sm">
        No staff revenue in this range.
      </div>
    );
  } else {
    staffBody = (
      <div className="space-y-2.5">
        {props.staffRows.map((member, index) => {
          const revenue = Number(member.revenue);
          const safeRevenue = Number.isFinite(revenue) && revenue >= 0 ? revenue : 0;
          const pctRaw = Math.round((safeRevenue / maxRevenue) * 100);
          const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;
          const username = typeof member.username === "string" ? member.username.trim() : "";
          const usernameLabel = username.length > 0 ? `@${username}` : "@unassigned";
          return (
            <div
              key={`${member.userId ?? "anon"}-${member.role}-${member.name}-${String(index)}`}
              className="space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-sm">{member.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{usernameLabel}</span>
                </div>
                <div className="flex shrink-0 items-baseline gap-1">
                  <span className="font-semibold text-sm tabular-nums">
                    {formatCurrency(safeRevenue, { currency: "USD", noDecimals: true })}
                  </span>
                  <span className="text-muted-foreground text-xs">closed</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={pct} />
                <span className="font-medium text-muted-foreground text-xs tabular-nums">{pct}%</span>
              </div>
              <div
                className="text-muted-foreground text-xs tabular-nums"
                title={formatCurrency(member.tips, { currency: "USD" })}
              >
                Tips {formatCurrency(member.tips, { currency: "USD", noDecimals: true })} • Orders{" "}
                {new Intl.NumberFormat(undefined).format(member.orderCount)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  let lowStockBody: React.ReactNode;
  if (props.isLoading) {
    lowStockBody = (
      <ul className="space-y-2.5">
        {LOW_STOCK_SKELETON_KEYS.map((k) => (
          <li key={k} className="space-y-2 rounded-md border px-3 py-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
          </li>
        ))}
      </ul>
    );
  } else if (props.lowStockItems.length === 0) {
    lowStockBody = (
      <div className="flex min-h-32 items-center justify-center text-muted-foreground text-sm">
        No low-stock rows returned.
      </div>
    );
  } else {
    lowStockBody = (
      <ul className="space-y-2.5">
        {props.lowStockItems.map((ing, index) => {
          const title = typeof ing.name === "string" && ing.name.length > 0 ? ing.name : "Ingredient";
          const id = typeof ing._id === "string" ? ing._id : title;
          return (
            <li key={`${id}-${String(index)}`} className="space-y-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <Checkbox aria-label={`Low stock: ${title}`} />
                <span className="font-medium text-sm">{title}</span>
                <span className="w-fit rounded-md bg-destructive/15 px-2 py-1 font-medium text-destructive text-xs">
                  Low
                </span>
              </div>
              <div className="font-medium text-muted-foreground text-xs">{formatStockLine(ing)}</div>
              <div className="flex items-center gap-1">
                <Clock className="size-3 text-muted-foreground" aria-hidden />
                <span className="font-medium text-muted-foreground text-xs">Review restock</span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {props.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Operations</AlertTitle>
          <AlertDescription>{props.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Staff performance</CardTitle>
            <CardDescription className="font-medium tabular-nums">{props.rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>{staffBody}</CardContent>
          <CardFooter>
            <div className="flex justify-between gap-1 text-muted-foreground text-xs">
              <span>{staffWithRevenue.length} staff with revenue</span>
              <span>•</span>
              <span>Sorted by closed revenue</span>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
            <CardDescription>Ingredients at or below reorder threshold</CardDescription>
          </CardHeader>
          <CardContent>{lowStockBody}</CardContent>
        </Card>
      </div>
    </div>
  );
}
