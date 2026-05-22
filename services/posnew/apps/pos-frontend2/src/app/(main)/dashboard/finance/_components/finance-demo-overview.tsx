"use client";

import type { ReactElement } from "react";

import Link from "next/link";

import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Banknote, Calendar, FileText, HandCoins, WalletMinimal } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

/** Static “Acme” style figures — UI preview only, never mixed with API responses. */
const DEMO_PRIMARY_BALANCE = 48290.55;
const DEMO_PRIMARY_LABEL = "Operating cash · Main Street";
const DEMO_NET_EQUITY = 312400;
const DEMO_ASSETS = 518200;
const DEMO_LIABILITIES = 205800;
const DEMO_NET_OPERATING_MTD = 18420.33;
const DEMO_REVENUE_YTD = 428_500;
const DEMO_NET_OPERATING_YTD = 71_240;

const DEMO_PL_BY_MONTH = [
  { month: "Jan", income: 108_400, expenses: 76_200 },
  { month: "Feb", income: 112_800, expenses: 79_100 },
  { month: "Mar", income: 118_200, expenses: 81_400 },
  { month: "Apr", income: 89_100, expenses: 71_800 },
] as const;

const DEMO_SPEND_ROWS = [
  { key: "6100", label: "Rent & facilities", amount: 42_000, pct: 28 },
  { key: "6200", label: "Payroll & benefits", amount: 68_500, pct: 45 },
  { key: "6300", label: "Ingredients & COGS (expense)", amount: 22_400, pct: 15 },
  { key: "6400", label: "Marketing", amount: 8_200, pct: 5 },
  { key: "6500", label: "Utilities & telecom", amount: 4_800, pct: 3 },
  { key: "6600", label: "Professional fees", amount: 6_100, pct: 4 },
] as const;

const DEMO_MONTHLY_TABLE = [
  { month: "Nov", revenue: 96_400, netOperating: 14_200 },
  { month: "Dec", revenue: 118_200, netOperating: 19_400 },
  { month: "Jan", revenue: 104_800, netOperating: 15_100 },
  { month: "Feb", revenue: 111_300, netOperating: 17_800 },
  { month: "Mar", revenue: 109_600, netOperating: 16_050 },
  { month: "Apr", revenue: 124_900, netOperating: 21_200 },
] as const;

const DEMO_BILLS = [
  { id: "1", supplier: "Metro Produce Co.", ref: "VB-20418", due: new Date(Date.UTC(2026, 3, 22)), amount: 4280 },
  { id: "2", supplier: "Coastal Dairy", ref: "VB-20421", due: new Date(Date.UTC(2026, 3, 24)), amount: 2915.5 },
  { id: "3", supplier: "Summit Packaging", ref: "VB-20426", due: new Date(Date.UTC(2026, 3, 28)), amount: 1875 },
] as const;

const chartConfig = {
  income: { label: "Revenue", color: "hsl(var(--chart-1))" },
  expenses: { label: "Expenses", color: "hsl(var(--chart-2))" },
} as const satisfies ChartConfig;

const DEMO_SPEND_TOTAL = DEMO_SPEND_ROWS.reduce((s, r) => s + r.amount, 0);

export function FinanceDemoOverview(): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <p className="text-foreground/90">
          <span className="font-semibold">Sample data</span> — layout preview only. Figures are fictional and not from
          your ledger.
        </p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/dashboard/finance">View live data</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:gap-2 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-content-center rounded-sm bg-muted">
                  <WalletMinimal className="size-5" />
                </span>
                <span>Primary Account</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-0.5">
              <p className="font-medium text-xl tabular-nums">
                {formatCurrency(DEMO_PRIMARY_BALANCE, { noDecimals: false })}
              </p>
              <p className="text-muted-foreground text-xs">{DEMO_PRIMARY_LABEL}</p>
              <CardDescription className="pt-1 text-xs">
                Cash-mapped accounts (MTD) net change: {formatCurrency(6230, { noDecimals: false })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button className="flex-1" size="sm" variant="outline" asChild>
                <Link href="/dashboard/accounting/ledger">Ledger</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-content-center rounded-sm bg-muted">
                  <Banknote className="size-5" />
                </span>
                <span>Net Worth</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-0.5">
              <p className="font-medium text-xl tabular-nums">
                {formatCurrency(DEMO_NET_EQUITY, { noDecimals: false })}
              </p>
              <p className="text-muted-foreground text-xs">Total equity (from balance sheet)</p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
              <div>
                Assets: <span className="font-medium text-foreground">{formatCurrency(DEMO_ASSETS)}</span>
              </div>
              <div className="text-right">
                Liab: <span className="font-medium text-foreground">{formatCurrency(DEMO_LIABILITIES)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-content-center rounded-sm bg-muted">
                  <Calendar className="size-5" />
                </span>
                <span>Net operating (P&amp;L)</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-medium text-xl text-emerald-600 tabular-nums">
              +{formatCurrency(DEMO_NET_OPERATING_MTD, { noDecimals: false })}
            </p>
            <p className="text-muted-foreground text-xs">MTD accrual netOperating (illustrative).</p>
            <Separator />
            <p className="flex items-center text-muted-foreground text-xs">Server-style field presentation</p>
          </CardContent>
        </Card>

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
            <CardDescription>YTD revenue and net operating (illustrative).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Revenue</span>
                <span className="font-medium text-lg tabular-nums">
                  {formatCurrency(DEMO_REVENUE_YTD, { noDecimals: false })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Net operating</span>
                <span className="font-medium text-lg tabular-nums">
                  {formatCurrency(DEMO_NET_OPERATING_YTD, { noDecimals: false })}
                </span>
              </div>
            </div>
            <Separator />
            <p className="text-muted-foreground text-xs">Year-to-date figures (sample).</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>P&amp;L overview</CardTitle>
              <CardDescription>
                Sample monthly revenue vs expense.{" "}
                <Link
                  href="/dashboard/accounting/cash-flow"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Cash flow
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Separator />
              <div className="flex items-start justify-between gap-2 py-5 md:items-stretch md:gap-0">
                <div className="flex flex-1 items-center justify-center gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <ArrowDownLeft className="size-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-tight">Revenue</p>
                    <p className="font-semibold text-lg tabular-nums">
                      {formatCurrency(430_500, { noDecimals: true })}
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
                      {formatCurrency(359_260, { noDecimals: true })}
                    </p>
                  </div>
                </div>
              </div>
              <Separator />
              <ChartContainer className="mt-4 max-h-72 w-full" config={chartConfig}>
                <BarChart
                  stackOffset="sign"
                  margin={{ left: -25, right: 0, top: 25, bottom: 0 }}
                  accessibilityLayer
                  data={[...DEMO_PL_BY_MONTH]}
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
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spending Breakdown</CardTitle>
                <CardDescription>Sample YTD expense mix (top categories).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="font-medium text-2xl">{formatCurrency(DEMO_SPEND_TOTAL, { noDecimals: true })}</div>
                  <div className="flex h-6 w-full overflow-hidden rounded-md">
                    {DEMO_SPEND_ROWS.map((item, index) => {
                      const width = (item.amount / DEMO_SPEND_TOTAL) * 100;
                      const alpha = Math.max(0.35, 1 - index * 0.08);
                      return (
                        <div
                          key={item.key}
                          className="h-full shrink-0 border-background border-l first:border-l-0"
                          style={{
                            width: `${width}%`,
                            background: `color-mix(in oklch, var(--primary) ${alpha * 100}%, transparent)`,
                          }}
                          title={`${item.label}: ${formatCurrency(item.amount)}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  {DEMO_SPEND_ROWS.map((item, index) => {
                    const alpha = Math.max(0.35, 1 - index * 0.08);
                    return (
                      <div key={item.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-3 rounded-sm"
                            style={{
                              background: `color-mix(in oklch, var(--primary) ${alpha * 100}%, transparent)`,
                            }}
                          />
                          <span className="truncate text-muted-foreground text-sm">{item.label}</span>
                        </div>
                        <span className="font-medium text-sm tabular-nums">{item.pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly P&amp;L</CardTitle>
                <CardDescription>Sample revenue and net operating by month.</CardDescription>
              </CardHeader>
              <CardContent>
                <Separator className="mb-4" />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Net operating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_MONTHLY_TABLE.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.revenue, { noDecimals: true })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.netOperating, { noDecimals: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="shadow-xs">
          <CardHeader className="items-center">
            <CardTitle>Upcoming bills</CardTitle>
            <CardDescription>Sample vendor bills due soon.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="space-y-3">
              {DEMO_BILLS.map((bill) => {
                const daysLeft = Math.ceil((bill.due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const isSoon = daysLeft <= 7;
                return (
                  <div key={bill.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 shrink-0 place-content-center rounded-md bg-muted">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium text-sm">{bill.supplier}</p>
                        <p className="truncate text-muted-foreground text-xs">
                          {bill.ref} · Due {format(bill.due, "MMM d")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSoon ? <Badge variant="secondary">{daysLeft}d</Badge> : null}
                      <span className="font-medium text-sm tabular-nums">{formatCurrency(bill.amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Separator />
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/dashboard/accounting/vendor-bills">View all vendor bills</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
