"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posFetchBudgetVsActual } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function BudgetVsActualPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const now = new Date();
  const [fiscalYear, setFiscalYear] = useState(String(now.getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));

  const yearNum = Number.parseInt(fiscalYear, 10);
  const monthNum = Number.parseInt(periodMonth, 10);
  const paramsValid = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100 && monthNum >= 1 && monthNum <= 12;

  const query = useMemo(() => ({ fiscalYear: yearNum, periodMonth: monthNum }), [yearNum, monthNum]);

  const {
    data = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "budget-vs-actual", query],
    queryFn: () => posFetchBudgetVsActual(query),
    enabled: canGlRead && paramsValid,
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view budget vs actual.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/pnl">
            <ArrowLeft className="mr-2 size-4" />
            Profit &amp; Loss
          </Link>
        </Button>
        <h1 className="font-bold text-3xl tracking-tight">Budget vs actual</h1>
        <p className="text-muted-foreground text-sm">
          Compares posted journals to budget lines for the selected fiscal month. Maintain budgets in Studio:{" "}
          <Link href="/dashboard/accounting/budgets" className="text-primary underline-offset-4 hover:underline">
            Budgets
          </Link>{" "}
          
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
          <CardDescription>Fiscal year and calendar month (1–12).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bva-year">Fiscal year</Label>
            <Input
              id="bva-year"
              type="number"
              className="w-32"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              min={2000}
              max={2100}
            />
          </div>
          <div className="grid min-w-[160px] gap-2">
            <Label>Month</Label>
            <Select value={periodMonth} onValueChange={setPeriodMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = i + 1;
                  return (
                    <SelectItem key={m} value={String(m)}>
                      {m}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Empty when no budget rows exist for this org and month.</CardDescription>
        </CardHeader>
        <CardContent>
          {!paramsValid ? (
            <p className="text-muted-foreground text-sm">Enter a valid year and month.</p>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No budget vs actual rows for this period.{" "}
              <Link href="/dashboard/accounting/budgets" className="text-primary underline-offset-4 hover:underline">
                Add budget lines
              </Link>{" "}
              for this fiscal year and month, then refresh.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Budgeted</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">% of budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.account._id}>
                    <TableCell>
                      <span className="font-mono text-xs">{row.account.code}</span>
                      <div className="text-sm">{row.account.name}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(row.budgeted)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(row.actual)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(row.variance)}</TableCell>
                    <TableCell className="text-right text-sm">{row.performance.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
