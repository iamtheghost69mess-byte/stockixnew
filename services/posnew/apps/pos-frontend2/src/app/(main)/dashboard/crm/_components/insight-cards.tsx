"use client";

import * as React from "react";

import { Bar } from "recharts/es6/cartesian/Bar";
import { BarChart } from "recharts/es6/chart/BarChart";
import { CartesianGrid } from "recharts/es6/cartesian/CartesianGrid";
import { LabelList } from "recharts/es6/component/LabelList";
import { XAxis } from "recharts/es6/cartesian/XAxis";
import { YAxis } from "recharts/es6/cartesian/YAxis";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { TopItemRow } from "@/lib/pos-reports-api";

const topProductsBarConfig = {
  quantity: {
    label: "Quantity sold",
    color: "var(--chart-1)",
  },
  remaining: {
    label: "Remaining vs top",
    color: "var(--chart-2)",
  },
  label: {
    color: "var(--primary-foreground)",
  },
} satisfies ChartConfig;

export type InsightCardsProps = {
  readonly rangeLabel: string;
  readonly topItemsForBar: readonly TopItemRow[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
};

function buildTopItemsBarRows(items: readonly TopItemRow[]): { name: string; quantity: number; remaining: number }[] {
  if (items.length === 0) return [];
  const maxQty = Math.max(
    ...items.map((i) => {
      const q = Number(i.quantity);
      return Number.isFinite(q) ? q : 0;
    }),
    1,
  );
  return items.map((row) => {
    const full = String(row.name ?? "").trim();
    const name = full.length > 28 ? `${full.slice(0, 28)}…` : full;
    const qty = Number(row.quantity);
    const safeQty = Number.isFinite(qty) ? qty : 0;
    return {
      name,
      quantity: safeQty,
      remaining: Math.max(0, maxQty - safeQty),
    };
  });
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatTopProductsBarFooter(params: {
  readonly isLoading: boolean;
  readonly barRowCount: number;
  readonly barTotalQty: number;
  readonly rangeLabel: string;
}): string {
  if (params.isLoading) return "Loading…";
  if (params.barRowCount === 0) return "—";
  const qty = new Intl.NumberFormat(undefined).format(params.barTotalQty);
  return `${qty} units across top ${params.barRowCount} SKUs · ${params.rangeLabel}`;
}

export function InsightCards(props: InsightCardsProps) {
  const barRows = React.useMemo(() => buildTopItemsBarRows(props.topItemsForBar), [props.topItemsForBar]);
  const barTotalQty = React.useMemo(() => barRows.reduce((acc, row) => acc + row.quantity, 0), [barRows]);

  let barBody: React.ReactNode;
  if (props.isLoading) {
    barBody = <Skeleton className="size-full min-h-52 rounded-md" />;
  } else if (barRows.length === 0) {
    barBody = (
      <div className="flex min-h-52 items-center justify-center text-muted-foreground text-sm">
        No product mix in this range.
      </div>
    );
  } else {
    barBody = (
      <ChartContainer config={topProductsBarConfig} className="size-full">
        <BarChart accessibilityLayer data={barRows} layout="vertical">
          <CartesianGrid horizontal={false} />
          <YAxis dataKey="name" type="category" tickLine={false} tickMargin={10} axisLine={false} hide />
          <XAxis dataKey="quantity" type="number" hide />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || payload == null || payload.length === 0) return null;
              const row = payload[0]?.payload as { name?: string; quantity?: number } | undefined;
              const qty = typeof row?.quantity === "number" ? row.quantity : 0;
              const label = typeof row?.name === "string" ? row.name : "—";
              return (
                <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium">{label}</div>
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <span>Quantity</span>
                    <span className="font-medium font-mono text-foreground tabular-nums">
                      {new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(qty)}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <Bar stackId="a" dataKey="quantity" fill="var(--color-quantity)" isAnimationActive={false}>
            <LabelList dataKey="name" position="insideLeft" offset={8} className="fill-primary-foreground text-xs" />
            <LabelList
              dataKey="quantity"
              position="insideRight"
              offset={8}
              className="fill-primary-foreground text-xs tabular-nums"
            />
          </Bar>
          <Bar
            stackId="a"
            dataKey="remaining"
            fill="var(--color-remaining)"
            isAnimationActive={false}
            radius={[0, 6, 6, 0]}
          />
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {props.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Insights</AlertTitle>
          <AlertDescription>{props.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs">
        <Card>
          <CardHeader>
            <CardTitle>Top selling products</CardTitle>
          </CardHeader>
          <CardContent className="size-full max-h-52">{barBody}</CardContent>
          <CardFooter>
            <p className="text-muted-foreground text-xs">
              {formatTopProductsBarFooter({
                isLoading: props.isLoading,
                barRowCount: barRows.length,
                barTotalQty,
                rangeLabel: props.rangeLabel,
              })}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
