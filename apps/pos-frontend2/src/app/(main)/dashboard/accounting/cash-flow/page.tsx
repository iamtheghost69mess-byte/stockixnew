"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { posFetchCashFlow } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function CashFlowStatementPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const today = new Date();
  const [start, setStart] = useState(format(subMonths(today, 1), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(today, "yyyy-MM-dd"));
  const [costCenter, setCostCenter] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "cash-flow-report", start, end, costCenter],
    queryFn: () =>
      posFetchCashFlow({ start, end, costCenter: costCenter.trim() || undefined }),
    enabled: canGlRead,
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view the cash flow report.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  const c = data?.categories;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/pnl">
            <ArrowLeft className="mr-2 size-4" />
            Profit &amp; Loss
          </Link>
        </Button>
        <h1 className="font-bold text-3xl tracking-tight">Cash flow (ledger)</h1>
        <p className="text-muted-foreground text-sm">
          Net change on <strong>mapped cash and clearing accounts</strong>, grouped by each journal entry&apos;s{" "}
          <span className="font-mono">cashFlowCategory</span> (operating / investing / financing). This is{" "}
          <strong>not</strong> the same as P&amp;L net income.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
          <CardDescription>
            Filters journal lines that hit configured cash, card clearing, and tender accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cf-start">Start</Label>
            <DatePicker id="cf-start" value={start} onValueChange={setStart} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-end">End</Label>
            <DatePicker id="cf-end" value={end} onValueChange={setEnd} />
          </div>
          <div className="grid min-w-[10rem] gap-2">
            <Label htmlFor="cf-cc">Cost center</Label>
            <Input
              id="cf-cc"
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Period {data?.period?.start ?? "—"} → {data?.period?.end ?? "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between border-b py-2 text-sm">
              <span>Operating</span>
              <span className="font-mono">{formatCurrency(c?.operating ?? 0)}</span>
            </div>
            <div className="flex justify-between border-b py-2 text-sm">
              <span>Investing</span>
              <span className="font-mono">{formatCurrency(c?.investing ?? 0)}</span>
            </div>
            <div className="flex justify-between border-b py-2 text-sm">
              <span>Financing</span>
              <span className="font-mono">{formatCurrency(c?.financing ?? 0)}</span>
            </div>
            <div className="flex justify-between border-b py-2 text-sm">
              <span>Unclassified</span>
              <span className="font-mono text-muted-foreground">{formatCurrency(c?.none ?? 0)}</span>
            </div>
            <div className="flex justify-between pt-2 font-medium">
              <span>Net change (cash ledger)</span>
              <span className="font-mono">{formatCurrency(c?.netChange ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
