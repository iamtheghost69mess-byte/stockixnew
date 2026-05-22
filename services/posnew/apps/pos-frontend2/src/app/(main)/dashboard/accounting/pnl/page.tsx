"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Download,
  FileSpreadsheet,
  Loader2,
  PieChart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { ReportCompareControls } from "@/components/reports/report-compare-controls";
import { ReportCompareTable } from "@/components/reports/report-compare-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProfitLossReport } from "@/lib/pos-accounting-api";
import { posFetchPnL } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function downloadPnLCsv(pnl: ProfitLossReport, start: string, end: string) {
  const rows = pnl.trialBalance?.rows ?? [];
  const lines: string[][] = [
    ["Report", "Profit and Loss"],
    ["Start", start],
    ["End", end],
    ["Revenue", String(pnl.revenue)],
    ["COGS", String(pnl.cogs)],
    ["Expenses", String(pnl.expense)],
    ["Net operating", String(pnl.netOperating)],
    [],
    ["Code", "Name", "Type", "Debit", "Credit", "Balance"],
    ...rows.map((r) => [
      r.code ?? "",
      (r.name ?? "").replaceAll('"', '""'),
      r.type ?? "",
      String(r.debit ?? 0),
      String(r.credit ?? 0),
      String(r.balance ?? 0),
    ]),
  ];
  const csv = lines.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c}"` : c)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pnl-${start}-to-${end}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("CSV downloaded.");
}

export default function ProfitAndLossPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const [rangeMode, setRangeMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState("current_month");
  const today = new Date();
  const [customStart, setCustomStart] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [costCenter, setCostCenter] = useState("");

  const dates = useMemo(() => {
    if (rangeMode === "custom") {
      return { start: customStart, end: customEnd };
    }
    switch (preset) {
      case "current_month":
        return { start: format(startOfMonth(today), "yyyy-MM-dd"), end: format(endOfMonth(today), "yyyy-MM-dd") };
      case "last_month": {
        const last = subMonths(today, 1);
        return { start: format(startOfMonth(last), "yyyy-MM-dd"), end: format(endOfMonth(last), "yyyy-MM-dd") };
      }
      case "last_3_months":
        return {
          start: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
          end: format(endOfMonth(today), "yyyy-MM-dd"),
        };
      default:
        return {};
    }
  }, [rangeMode, preset, customStart, customEnd, today]);

  const pnlParams = useMemo(
    () => ({
      ...dates,
      costCenter: costCenter.trim() || undefined,
    }),
    [dates, costCenter],
  );

  const { data: pnl, isLoading } = useQuery({
    queryKey: ["accounting", "pnl-report", pnlParams],
    queryFn: () => posFetchPnL(pnlParams),
    enabled: canGlRead && Boolean(dates.start && dates.end),
  });

  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareFrom, setCompareFrom] = useState(() => {
    const last = subMonths(new Date(), 1);
    return format(startOfMonth(last), "yyyy-MM-dd");
  });
  const [compareTo, setCompareTo] = useState(() => {
    const last = subMonths(new Date(), 1);
    return format(endOfMonth(last), "yyyy-MM-dd");
  });

  const compareParams = useMemo(
    () => ({
      start: compareFrom,
      end: compareTo,
      costCenter: costCenter.trim() || undefined,
    }),
    [compareFrom, compareTo, costCenter],
  );

  const { data: pnlCompare, isFetching: pnlCompareFetching } = useQuery({
    queryKey: ["accounting", "pnl-report", "compare", compareParams],
    queryFn: () => posFetchPnL(compareParams),
    enabled: canGlRead && compareEnabled && Boolean(compareFrom && compareTo),
  });

  const pnlCompareRows = useMemo(() => {
    if (!pnl || !pnlCompare) return [];
    const grossCur = pnl.revenue - pnl.cogs;
    const grossCmp = pnlCompare.revenue - pnlCompare.cogs;
    return [
      { label: "Revenue", current: pnl.revenue, compare: pnlCompare.revenue },
      { label: "COGS", current: pnl.cogs, compare: pnlCompare.cogs },
      { label: "Gross profit", current: grossCur, compare: grossCmp },
      { label: "Expenses", current: pnl.expense, compare: pnlCompare.expense },
      { label: "Net operating", current: pnl.netOperating, compare: pnlCompare.netOperating },
    ];
  }, [pnl, pnlCompare]);

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view the P&amp;L report.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!pnl) {
    return <div className="p-12 text-center">Failed to load report.</div>;
  }

  const tbRows = pnl.trialBalance?.rows ?? [];
  const grossProfit = pnl.grossProfit ?? pnl.revenue - pnl.cogs;
  const grossMargin =
    pnl.grossMarginPercent != null && pnl.grossMarginPercent !== undefined
      ? pnl.grossMarginPercent
      : pnl.revenue > 0
        ? (grossProfit / pnl.revenue) * 100
        : 0;
  const netMargin =
    pnl.netMarginPercent != null && pnl.netMarginPercent !== undefined
      ? pnl.netMarginPercent
      : pnl.revenue > 0
        ? (pnl.netOperating / pnl.revenue) * 100
        : 0;
  const pnlDateRange =
    dates.start && dates.end ? `${dates.start} → ${dates.end}` : (pnl.period.start && pnl.period.end ? `${pnl.period.start} → ${pnl.period.end}` : "");
  const branchLabel =
    pnl.locationId != null && String(pnl.locationId).length > 0 ? `Branch ${String(pnl.locationId).slice(-8)}` : "All branches";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Finances: Profit &amp; Loss</h1>
          <p className="text-muted-foreground">
            Accrual-style rollup for {dates.start} to {dates.end} (same basis as trial balance for the range).
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid gap-2">
            <Label className="text-xs">Range</Label>
            <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as "preset" | "custom")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preset">Presets</SelectItem>
                <SelectItem value="custom">Custom dates</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {rangeMode === "preset" ? (
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-52">
                <CalendarIcon className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Current month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="last_3_months">Last 3 months</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="pnl-cs" className="text-xs">
                  Start
                </Label>
                <DatePicker id="pnl-cs" value={customStart} onValueChange={setCustomStart} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pnl-ce" className="text-xs">
                  End
                </Label>
                <DatePicker id="pnl-ce" value={customEnd} onValueChange={setCustomEnd} />
              </div>
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor="pnl-cc" className="text-xs">
              Cost center
            </Label>
            <Input
              id="pnl-cc"
              className="h-9 w-36"
              placeholder="Optional"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (dates.start && dates.end) downloadPnLCsv(pnl, dates.start, dates.end);
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!pnlDateRange) return;
              exportReportPdf({
                fileName: `pnl-${dates.start}-to-${dates.end}.pdf`,
                title: "Profit and Loss",
                branchName: branchLabel,
                dateRange: pnlDateRange,
                columns: [
                  { key: "metric", label: "Metric" },
                  { key: "value", label: "Amount" },
                ],
                rows: [
                  { metric: "Revenue", value: pnl.revenue },
                  { metric: "COGS", value: pnl.cogs },
                  { metric: "Gross profit", value: grossProfit },
                  { metric: "Expenses", value: pnl.expense },
                  { metric: "Net operating", value: pnl.netOperating },
                  { metric: "Gross margin %", value: grossMargin.toFixed(2) },
                  { metric: "Net margin %", value: netMargin.toFixed(2) },
                ],
              });
            }}
          >
            Export PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!pnlDateRange) return;
              exportReportExcel({
                fileName: `pnl-${dates.start}-to-${dates.end}.xlsx`,
                branchName: branchLabel,
                dateRange: pnlDateRange,
                columns: [
                  { key: "code", label: "Code" },
                  { key: "name", label: "Account" },
                  { key: "type", label: "Type" },
                  { key: "balance", label: "Balance" },
                ],
                rows: tbRows.map((r) => ({
                  code: r.code ?? "",
                  name: r.name ?? "",
                  type: r.type ?? "",
                  balance: r.balance ?? 0,
                })),
                totals: ["Net operating", pnl.netOperating],
              });
            }}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-xs uppercase">Total Revenue</CardDescription>
            <CardTitle className="text-2xl">${pnl.revenue.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-green-600 text-xs">
              <TrendingUp className="h-3 w-3" /> Sales performance
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-xs uppercase">COGS</CardDescription>
            <CardTitle className="text-2xl text-amber-600">${pnl.cogs.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground text-xs">{grossMargin.toFixed(1)}% Gross Margin</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-xs uppercase">Expenses</CardDescription>
            <CardTitle className="text-2xl text-destructive">${pnl.expense.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground text-xs">Operating overhead</div>
          </CardContent>
        </Card>
        <Card
          className={
            pnl.netOperating >= 0 ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5"
          }
        >
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-xs uppercase">Net Income</CardDescription>
            <CardTitle className={`text-2xl ${pnl.netOperating >= 0 ? "text-green-600" : "text-destructive"}`}>
              ${pnl.netOperating.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs">
              {pnl.netOperating >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              {netMargin.toFixed(1)}% Net Margin
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compare periods</CardTitle>
          <CardDescription>Enable a second date range to compare headline P&amp;L metrics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReportCompareControls
            enabled={compareEnabled}
            onEnabledChange={setCompareEnabled}
            currentFrom={dates.start ?? ""}
            currentTo={dates.end ?? ""}
            compareFrom={compareFrom}
            compareTo={compareTo}
            onCurrentFromChange={(v) => {
              setRangeMode("custom");
              setCustomStart(v);
            }}
            onCurrentToChange={(v) => {
              setRangeMode("custom");
              setCustomEnd(v);
            }}
            onCompareFromChange={setCompareFrom}
            onCompareToChange={setCompareTo}
          />
          {compareEnabled && pnlCompareFetching ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading comparison…
            </div>
          ) : null}
          {compareEnabled && pnlCompare && pnlCompareRows.length > 0 ? <ReportCompareTable rows={pnlCompareRows} /> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>GL trial-balance lines in the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tbRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No financial activity recorded for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  tbRows.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-muted-foreground text-xs">{row.code}</div>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{row.type}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Gross Profit</span>
                <span className="font-medium">${grossProfit.toLocaleString()}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, grossMargin))}%` }} />
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h4 className="font-bold text-muted-foreground text-xs uppercase">Quick insights</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded bg-amber-500/10 p-1">
                    <PieChart className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">COGS efficiency</p>
                    <p className="text-muted-foreground text-xs">
                      Your cost of goods is {((pnl.cogs / pnl.revenue) * 100 || 0).toFixed(1)}% of total revenue.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded bg-blue-500/10 p-1">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Profitability</p>
                    <p className="text-muted-foreground text-xs">
                      {pnl.netOperating > 0
                        ? "You are operating at a profit for this period."
                        : "Operating at a deficit for this period."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button className="w-full" variant="secondary" asChild>
                <Link href="/dashboard/accounting/balance-sheet">
                  Balance sheet
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link href="/dashboard/accounting/cash-flow">Cash flow (ledger)</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link href="/dashboard/accounting/budget-vs-actual">Budget vs actual</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link href="/dashboard/accounting/ledger">
                  Entries
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link href="/dashboard/accounting/trial-balance">Trial balance</Link>
              </Button>
              <Button className="w-full" variant="ghost" asChild>
                <Link href="/dashboard/accounting/accounts">Chart of accounts</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
