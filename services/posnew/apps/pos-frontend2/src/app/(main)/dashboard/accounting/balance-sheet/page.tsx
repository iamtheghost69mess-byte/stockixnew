"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BalanceSheetLine } from "@/lib/pos-accounting-api";
import { posFetchBalanceSheet } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function lineAmount(r: BalanceSheetLine): number {
  if (r.netBalance != null) return r.netBalance;
  if (r.balance != null) return r.balance;
  return 0;
}

function SectionTable({
  title,
  rows,
}: Readonly<{
  title: string;
  rows: BalanceSheetLine[];
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-16 text-center text-muted-foreground text-sm">
                  No accounts in this section.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={`${r.code}-${r.name}`}>
                  <TableCell className="font-mono text-xs">{r.code ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(lineAmount(r))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function BalanceSheetPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");
  const [asOf, setAsOf] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [costCenter, setCostCenter] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "balance-sheet", asOf, costCenter],
    queryFn: () =>
      posFetchBalanceSheet({ asOf, costCenter: costCenter.trim() || undefined }),
    enabled: canGlRead,
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view the balance sheet.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  const equationOk = data != null && Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 0.05;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting/accounts">
              <ArrowLeft className="mr-2 size-4" />
              Chart of accounts
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Balance sheet</h1>
          <p className="text-muted-foreground text-sm">Point-in-time assets, liabilities, and equity from the GL.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>As of</CardTitle>
          <CardDescription>Uses journal activity through this date (inclusive).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bs-asof">Date</Label>
            <DatePicker id="bs-asof" value={asOf} onValueChange={setAsOf} />
          </div>
          <div className="grid min-w-[10rem] gap-2">
            <Label htmlFor="bs-cc">Cost center</Label>
            <Input
              id="bs-cc"
              className="h-10"
              placeholder="Optional"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
      ) : data == null ? (
        <p className="text-muted-foreground text-sm">No balance sheet data returned for this date.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="font-bold text-xs uppercase">Total assets</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(data.totalAssets)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="font-bold text-xs uppercase">Total liabilities</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(data.totalLiabilities)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="font-bold text-xs uppercase">Total equity</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(data.totalEquity)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <p className="text-muted-foreground text-sm">
            Accounting equation (assets = liabilities + equity):{" "}
            {equationOk ? (
              <span className="text-green-600">OK</span>
            ) : (
              <span className="text-amber-600">Review rounding or incomplete equity accounts</span>
            )}
          </p>

          <div className="grid gap-6 lg:grid-cols-1">
            <SectionTable title="Assets" rows={data.assets} />
            <SectionTable title="Liabilities" rows={data.liabilities} />
            <SectionTable title="Equity" rows={data.equity} />
          </div>
        </>
      )}
    </div>
  );
}
