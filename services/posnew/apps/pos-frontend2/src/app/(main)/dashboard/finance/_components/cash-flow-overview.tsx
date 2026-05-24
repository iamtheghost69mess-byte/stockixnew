"use client";

import type { ReactElement } from "react";

import Link from "next/link";

import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

import { utcYtdMonthSlicesForChart, utcYtdRangeThroughToday } from "../_lib/date-range";
import { fetchProfitLossReport } from "../_lib/fetch-profit-loss-report";
import { FINANCE_QUERY_STALE_MS, financePnlRangeQueryKey } from "../_lib/finance-query-keys";

const chartConfig = {
  income: {
    label: "Revenue",
    color: "hsl(var(--chart-1))",
  },
  expenses: {
    label: "Expenses",
    color: "hsl(var(--chart-2))",
  },
} as const satisfies ChartConfig;

type PlOverviewChartRow = {
  readonly month: string;
  readonly income: number;
  readonly expenses: number;
};

function PlOverviewChartSection(props: {
  readonly chartLoading: boolean;
  readonly chartError: boolean;
  readonly chartData: readonly PlOverviewChartRow[];
}): ReactElement {
  if (props.chartLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (props.chartError) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        Could not load one or more monthly P&amp;L slices.
      </p>
    );
  }
  if (props.chartData.length === 0) {
    return <p className="py-8 text-center text-muted-foreground text-sm">No months in range for this year yet.</p>;
  }
  return (
    <ChartContainer className="mt-4 max-h-72 w-full" config={chartConfig}>
      <BarChart
        stackOffset="sign"
        margin={{ left: -25, right: 0, top: 25, bottom: 0 }}
        accessibilityLayer
        data={[...props.chartData]}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          tickFormatter={(value) => {
            const abs = Math.abs(value);
            const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(0)}k` : `${abs}`;
            return value < 0 ? `-${formatted}` : formatted;
          }}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
        <Bar dataKey="income" stackId="a" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} barSize={32} />
        <Bar dataKey="expenses" stackId="a" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} barSize={32} />
      </BarChart>
    </ChartContainer>
  );
}

export function CashFlowOverview() {
  const ytd = utcYtdRangeThroughToday(new Date());
  const monthSlices = utcYtdMonthSlicesForChart(new Date());

  const ytdQuery = useQuery({
    queryKey: financePnlRangeQueryKey(ytd.start, ytd.end),
    queryFn: () => fetchProfitLossReport({ start: ytd.start, end: ytd.end }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const monthQueries = useQueries({
    queries: monthSlices.map((m) => ({
      queryKey: financePnlRangeQueryKey(m.start, m.end),
      queryFn: () => fetchProfitLossReport({ start: m.start, end: m.end }),
      staleTime: FINANCE_QUERY_STALE_MS,
    })),
  });

  const chartLoading = monthQueries.some((q) => q.isLoading);
  const chartError = monthQueries.some((q) => q.isError);
  const chartReady = monthQueries.length > 0 && monthQueries.every((q) => q.isSuccess);

  const chartData: readonly PlOverviewChartRow[] = chartReady
    ? monthSlices.map((m, i) => ({
        month: m.label,
        income: monthQueries[i].data?.revenue ?? 0,
        expenses: monthQueries[i].data?.expense ?? 0,
      }))
    : [];

  const totalIncome = ytdQuery.data?.revenue ?? null;
  const totalExpenses = ytdQuery.data?.expense ?? null;
  const summaryLoading = ytdQuery.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>P&amp;L overview</CardTitle>
        <CardDescription>
          Year-to-date (UTC) monthly revenue vs expense from the ledger (one request per month in the chart). For
          movement on cash-mapped accounts, see{" "}
          <Link href="/dashboard/accounting/cash-flow" className="text-primary underline-offset-4 hover:underline">
            Cash flow
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Separator />
        {summaryLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 py-5 md:items-stretch md:gap-0">
              <div className="flex flex-1 items-center justify-center gap-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                  <ArrowDownLeft className="size-6 text-emerald-500" />
                </div>
                <div>
                  <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-tight">Revenue</p>
                  <p className="font-semibold text-lg tabular-nums">
                    {totalIncome == null ? "—" : formatCurrency(totalIncome, { noDecimals: true })}
                  </p>
                </div>
              </div>
              <Separator orientation="vertical" className="mx-4 h-auto! self-stretch" />
              <div className="flex flex-1 items-center justify-center gap-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
                  <ArrowUpRight className="size-6 text-destructive" />
                </div>
                <div>
                  <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-tight">Expenses</p>
                  <p className="font-semibold text-lg tabular-nums">
                    {totalExpenses == null ? "—" : formatCurrency(totalExpenses, { noDecimals: true })}
                  </p>
                </div>
              </div>
            </div>
            <Separator />
            <PlOverviewChartSection chartLoading={chartLoading} chartError={chartError} chartData={chartData} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
