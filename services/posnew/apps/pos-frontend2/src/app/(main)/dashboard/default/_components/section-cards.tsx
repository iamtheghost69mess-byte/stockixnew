import { TrendingDown, TrendingUp } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardRange, DefaultDashboardSummary } from "@/lib/pos-dashboard-api";

function formatCurrency(amount: number, currency: string): string {
  const code = currency.length === 3 ? currency : "USD";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatVisitors(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function formatPercentChange(change: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function rangeCompareLabel(range: DashboardRange): string {
  if (range === "7d") return "vs prior 7 days";
  if (range === "30d") return "vs prior 30 days";
  return "vs prior 90 days";
}

export type SectionCardsProps = {
  readonly summary: DefaultDashboardSummary | undefined;
  readonly todayKpis:
    | {
        todayRevenue: number;
        totalOrders: number;
        averageOrderValue: number;
        openTables: number;
      }
    | undefined;
  readonly displayCurrency: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
  readonly range: DashboardRange;
};

export function SectionCards({ summary, todayKpis, displayCurrency, isLoading, isError, errorMessage, range }: SectionCardsProps) {
  const cmp = rangeCompareLabel(range);

  const revenue = todayKpis?.todayRevenue ?? 0;
  const totalOrders = todayKpis?.totalOrders ?? 0;
  const averageOrderValue = todayKpis?.averageOrderValue ?? 0;
  const openTables = todayKpis?.openTables ?? 0;
  const rc = summary?.revenueChange ?? 0;
  const cc = summary?.costChange ?? 0;
  const pc = summary?.profitChange ?? 0;
  const vc = summary?.visitorsChange ?? 0;

  const cards = [
    {
      key: "revenue",
      label: "Today's Revenue",
      value: formatCurrency(revenue, displayCurrency),
      change: rc,
      deltaGood: rc >= 0,
      footerLine: rc >= 0 ? "Revenue up for this period" : "Revenue down for this period",
      footerMuted: cmp,
    },
    {
      key: "orders",
      label: "Total Orders",
      value: formatVisitors(totalOrders),
      change: cc,
      deltaGood: cc <= 0,
      footerLine: "Paid orders today",
      footerMuted: "Filtered by selected branch scope",
    },
    {
      key: "aov",
      label: "Average Order Value",
      value: formatCurrency(averageOrderValue, displayCurrency),
      change: pc,
      deltaGood: pc >= 0,
      footerLine: "Today's revenue / today's orders",
      footerMuted: "Shows 0 when no paid orders",
    },
    {
      key: "open-tables",
      label: "Open Tables",
      value: formatVisitors(openTables),
      change: vc,
      deltaGood: vc >= 0,
      footerLine: "Tables in occupied or billed status",
      footerMuted: "Live floor occupancy",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Dashboard</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
        {cards.map((c) => (
          <Card key={c.key} className="@container/card">
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              {isLoading ? (
                <Skeleton className="mt-1 @[250px]/card:h-10 h-9 @[250px]/card:w-40 w-32" />
              ) : (
                <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">{c.value}</CardTitle>
              )}
              <CardAction>
                {isLoading ? (
                  <Skeleton className="h-6 w-16 rounded-full" />
                ) : (
                  <Badge variant="outline">
                    {c.deltaGood ? <TrendingUp /> : <TrendingDown />}
                    {formatPercentChange(c.change)}
                  </Badge>
                )}
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-36" />
                </>
              ) : (
                <>
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    {c.footerLine}{" "}
                    {c.deltaGood ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  </div>
                  <div className="text-muted-foreground">{c.footerMuted}</div>
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
