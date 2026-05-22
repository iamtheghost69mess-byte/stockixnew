"use client";

import * as React from "react";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DashboardDefaultChartRow, DashboardRange } from "@/lib/pos-dashboard-api";

export const description = "An interactive area chart";

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  desktop: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Visitors",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export type ChartAreaInteractiveProps = {
  readonly chartData: readonly DashboardDefaultChartRow[];
  readonly range: DashboardRange;
  readonly onRangeChange: (range: DashboardRange) => void;
  readonly displayCurrency: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
};

function rangeTitle(range: DashboardRange): string {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  return "Last 3 months";
}

function rangeDescriptionWide(range: DashboardRange): string {
  if (range === "7d") return "Revenue and visitors for the last 7 days";
  if (range === "30d") return "Revenue and visitors for the last 30 days";
  return "Revenue and visitors for the last 3 months";
}

function rangeDescriptionNarrow(range: DashboardRange): string {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  return "Last 3 months";
}

/** Recharts expects stable keys; keep `desktop`/`mobile` for layout/CSS variables. */
function toChartRows(rows: readonly DashboardDefaultChartRow[]): Array<{
  date: string;
  desktop: number;
  mobile: number;
}> {
  return rows.map((r) => ({
    date: r.date,
    desktop: r.revenue,
    mobile: r.visitors,
  }));
}

export function ChartAreaInteractive({
  chartData,
  range,
  onRangeChange,
  displayCurrency,
  isLoading,
  isError,
  errorMessage,
}: ChartAreaInteractiveProps) {
  const isMobile = useIsMobile();
  const rows = React.useMemo(() => toChartRows(chartData), [chartData]);
  const currencyCode = displayCurrency.length === 3 ? displayCurrency : "USD";
  const money = React.useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [currencyCode],
  );

  const onToggle = React.useCallback(
    (value: string) => {
      if (value === "7d" || value === "30d" || value === "90d") {
        onRangeChange(value);
      }
    },
    [onRangeChange],
  );

  const defaultIndex = isMobile ? -1 : Math.min(10, Math.max(0, rows.length - 1));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Total Visitors</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">{rangeDescriptionWide(range)}</span>
          <span className="@[540px]/card:hidden">{rangeDescriptionNarrow(range)}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={onToggle}
            variant="outline"
            className="@[767px]/card:flex hidden *:data-[slot=toggle-group-item]:px-4!"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={range} onValueChange={(v) => onToggle(v)}>
            <SelectTrigger
              className="flex @[767px]/card:hidden w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder={rangeTitle(range)} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectGroup>
                <SelectItem value="90d" className="rounded-lg">
                  Last 3 months
                </SelectItem>
                <SelectItem value="30d" className="rounded-lg">
                  Last 30 days
                </SelectItem>
                <SelectItem value="7d" className="rounded-lg">
                  Last 7 days
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>Chart</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <Skeleton className="aspect-auto h-62 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground flex aspect-auto h-62 items-center justify-center text-sm">
            No data in this range.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-62 w-full">
            <AreaChart data={rows}>
              <defs>
                <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-desktop)" stopOpacity={1.0} />
                  <stop offset="95%" stopColor="var(--color-desktop)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-mobile)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-mobile)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(`${value}T12:00:00`);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <ChartTooltip
                cursor={false}
                defaultIndex={defaultIndex}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      const date = new Date(`${value}T12:00:00`);
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                    formatter={(value, _name, item) => {
                      const isRevenue = item.dataKey === "desktop";
                      const n = Number(value);
                      const text = isRevenue
                        ? money.format(Number.isFinite(n) ? n : 0)
                        : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
                            Number.isFinite(n) ? n : 0,
                          );
                      return (
                        <div className="flex w-full flex-1 justify-between leading-none">
                          <span className="text-muted-foreground">{isRevenue ? "Revenue" : "Visitors"}</span>
                          <span className="font-mono font-medium text-foreground tabular-nums">{text}</span>
                        </div>
                      );
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area dataKey="mobile" type="natural" fill="url(#fillMobile)" stroke="var(--color-mobile)" />
              <Area dataKey="desktop" type="natural" fill="url(#fillDesktop)" stroke="var(--color-desktop)" />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
