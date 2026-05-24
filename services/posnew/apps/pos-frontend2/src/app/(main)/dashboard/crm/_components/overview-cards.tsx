"use client";

import * as React from "react";

import { BarChart3, LineChart as LineChartIcon, Package, ShoppingCart } from "lucide-react";
import { Area } from "recharts/es6/cartesian/Area";
import { AreaChart } from "recharts/es6/chart/AreaChart";
import { Bar } from "recharts/es6/cartesian/Bar";
import { BarChart } from "recharts/es6/chart/BarChart";
import { Line } from "recharts/es6/cartesian/Line";
import { LineChart } from "recharts/es6/chart/LineChart";
import { XAxis } from "recharts/es6/cartesian/XAxis";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

const busyChartConfig = {
  orders: {
    label: "Orders",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const aovChartConfig = {
  aov: {
    label: "AOV",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const dailyOrdersChartConfig = {
  orders: {
    label: "Paid orders",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export type OverviewCardsProps = {
  readonly rangeLabel: string;
  readonly busyHourChart: readonly { hour: string; orders: number }[];
  readonly aovChart: readonly { day: string; aov: number }[];
  readonly dailyOrdersChart: readonly { day: string; orders: number }[];
  readonly paidOrderCount: number;
  readonly topProductName: string | null;
  readonly topProductQuantity: number | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
};

function useMoneyFormatter(currencyCode: string) {
  const code = currencyCode.length === 3 ? currencyCode : "USD";
  return React.useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [code],
  );
}

function formatDayTick(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDayTooltipLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatInteger(value: unknown): string {
  const n = Number(value);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

function formatOrdersCountTooltipRow(value: unknown) {
  return (
    <div className="flex w-full flex-1 justify-between gap-4 leading-none">
      <span className="text-muted-foreground">Orders</span>
      <span className="font-mono font-medium text-foreground tabular-nums">{formatInteger(value)}</span>
    </div>
  );
}

function formatAovTooltipRow(money: Intl.NumberFormat, value: unknown) {
  const n = Number(value);
  return (
    <div className="flex w-full flex-1 justify-between gap-4 leading-none">
      <span className="text-muted-foreground">AOV</span>
      <span className="font-mono font-medium text-foreground tabular-nums">
        {money.format(Number.isFinite(n) ? n : 0)}
      </span>
    </div>
  );
}

type BusyHoursCardProps = {
  readonly rangeLabel: string;
  readonly data: readonly { hour: string; orders: number }[];
  readonly totalOrders: number;
  readonly isLoading: boolean;
};

function BusyHoursCard({ rangeLabel, data, totalOrders, isLoading }: BusyHoursCardProps) {
  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton className="size-full min-h-24 rounded-lg" />;
  } else if (data.length === 0) {
    body = (
      <div className="text-muted-foreground flex min-h-24 items-center justify-center text-sm">No hourly data.</div>
    );
  } else {
    body = (
      <ChartContainer className="size-full min-h-24" config={busyChartConfig}>
        <BarChart accessibilityLayer data={[...data]} barSize={6} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            tickLine={false}
            tickMargin={8}
            axisLine={false}
            interval={3}
            tickFormatter={(v) => (typeof v === "string" ? v.slice(0, 2) : v)}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatOrdersCountTooltipRow(v)} />} />
          <Bar dataKey="orders" fill="var(--color-orders)" isAnimationActive={false} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    );
  }

  let footer: React.ReactNode;
  if (isLoading) {
    footer = <Skeleton className="h-8 w-20" />;
  } else {
    footer = (
      <>
        <span className="font-semibold text-xl tabular-nums">{totalOrders}</span>
        <span className="text-muted-foreground text-xs">orders by hour-of-day</span>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Busy hours</CardTitle>
        <CardDescription>{rangeLabel}</CardDescription>
      </CardHeader>
      <CardContent className="size-full">{body}</CardContent>
      <CardFooter className="flex items-center justify-between">{footer}</CardFooter>
    </Card>
  );
}

type AovTrendCardProps = {
  readonly rangeLabel: string;
  readonly data: readonly { day: string; aov: number }[];
  readonly isLoading: boolean;
};

function AovTrendCard({ rangeLabel, data, isLoading }: AovTrendCardProps) {
  const money = useMoneyFormatter("USD");
  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton className="size-full min-h-24 rounded-none" />;
  } else if (data.length === 0) {
    body = (
      <div className="text-muted-foreground flex min-h-24 items-center justify-center px-4 text-sm">
        No daily buckets.
      </div>
    );
  } else {
    body = (
      <ChartContainer className="size-full min-h-24" config={aovChartConfig}>
        <AreaChart
          data={[...data]}
          margin={{
            left: 0,
            right: 0,
            top: 5,
          }}
        >
          <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} hide />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => formatDayTooltipLabel(String(label))}
                hideIndicator
                formatter={(v) => formatAovTooltipRow(money, v)}
              />
            }
          />
          <Area
            dataKey="aov"
            fill="var(--color-aov)"
            fillOpacity={0.08}
            stroke="var(--color-aov)"
            strokeWidth={2}
            type="monotone"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    );
  }

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>Average order value</CardTitle>
        <CardDescription>{rangeLabel}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-0">{body}</CardContent>
    </Card>
  );
}

type PaidOrdersCardProps = {
  readonly rangeLabel: string;
  readonly paidOrderCount: number;
  readonly isLoading: boolean;
};

function PaidOrdersCard({ rangeLabel, paidOrderCount, isLoading }: PaidOrdersCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="w-fit rounded-lg bg-primary/10 p-2">
          <ShoppingCart className="size-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col justify-between">
        <div className="space-y-1.5">
          <CardTitle>Paid orders</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </div>
        {isLoading ? (
          <Skeleton className="mt-4 h-9 w-24" />
        ) : (
          <p className="font-medium text-2xl tabular-nums">{new Intl.NumberFormat(undefined).format(paidOrderCount)}</p>
        )}
      </CardContent>
    </Card>
  );
}

type TopProductCardProps = {
  readonly rangeLabel: string;
  readonly topProductName: string | null;
  readonly topProductQuantity: number | null;
  readonly isLoading: boolean;
};

function TopProductCard({ rangeLabel, topProductName, topProductQuantity, isLoading }: TopProductCardProps) {
  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton className="mt-4 h-9 w-32" />;
  } else if (topProductName == null || topProductName.length === 0) {
    body = <p className="text-muted-foreground mt-2 text-sm">No line items in range.</p>;
  } else {
    const qtyLabel =
      topProductQuantity === null || topProductQuantity === undefined
        ? "—"
        : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(topProductQuantity)} sold`;
    body = (
      <>
        <p className="mt-1 line-clamp-2 font-medium text-lg leading-snug">{topProductName}</p>
        <p className="text-muted-foreground text-sm tabular-nums">{qtyLabel}</p>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="w-fit rounded-lg bg-chart-2/15 p-2">
          <Package className="size-5 text-chart-2" />
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col justify-between">
        <div className="space-y-1.5">
          <CardTitle>Top product</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}

type DailyOrderVolumeCardProps = {
  readonly rangeLabel: string;
  readonly data: readonly { day: string; orders: number }[];
  readonly isLoading: boolean;
};

function DailyOrderVolumeCard({ rangeLabel, data, isLoading }: DailyOrderVolumeCardProps) {
  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton className="h-24 w-full rounded-lg" />;
  } else if (data.length === 0) {
    body = (
      <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
        No paid orders in this range.
      </div>
    );
  } else {
    body = (
      <ChartContainer config={dailyOrdersChartConfig} className="h-24 w-full">
        <LineChart
          data={[...data]}
          margin={{
            top: 5,
            right: 10,
            left: 10,
            bottom: 0,
          }}
        >
          <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={formatDayTick} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => formatDayTooltipLabel(String(label))}
                formatter={(v) => formatOrdersCountTooltipRow(v)}
              />
            }
          />
          <Line
            type="monotone"
            strokeWidth={2}
            dataKey="orders"
            stroke="var(--color-orders)"
            isAnimationActive={false}
            activeDot={{
              r: 6,
            }}
          />
        </LineChart>
      </ChartContainer>
    );
  }

  return (
    <Card className="col-span-1 xl:col-span-2">
      <CardHeader>
        <div className="flex items-start gap-2">
          <div className="w-fit rounded-lg bg-muted p-2">
            <LineChartIcon className="size-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Daily order volume</CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
      <CardFooter>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <BarChart3 className="size-4 shrink-0 opacity-70" aria-hidden />
          Paid order count per day (same window as above).
        </p>
      </CardFooter>
    </Card>
  );
}

export function OverviewCards(props: OverviewCardsProps) {
  const ordersByHourTotal = React.useMemo(
    () => props.busyHourChart.reduce((acc, row) => acc + row.orders, 0),
    [props.busyHourChart],
  );

  return (
    <div className="flex flex-col gap-4">
      {props.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Operations overview</AlertTitle>
          <AlertDescription>{props.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <BusyHoursCard
          rangeLabel={props.rangeLabel}
          data={props.busyHourChart}
          totalOrders={ordersByHourTotal}
          isLoading={props.isLoading}
        />
        <AovTrendCard rangeLabel={props.rangeLabel} data={props.aovChart} isLoading={props.isLoading} />
        <PaidOrdersCard
          rangeLabel={props.rangeLabel}
          paidOrderCount={props.paidOrderCount}
          isLoading={props.isLoading}
        />
        <TopProductCard
          rangeLabel={props.rangeLabel}
          topProductName={props.topProductName}
          topProductQuantity={props.topProductQuantity}
          isLoading={props.isLoading}
        />
        <DailyOrderVolumeCard rangeLabel={props.rangeLabel} data={props.dailyOrdersChart} isLoading={props.isLoading} />
      </div>
    </div>
  );
}
