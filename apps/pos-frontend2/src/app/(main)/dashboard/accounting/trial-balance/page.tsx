"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation, useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { ArrowLeft, CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posDownloadAccountingExport, posFetchTrialBalance, triggerBrowserDownload } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function TrialBalancePage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const today = new Date();
  const [start, setStart] = useState(format(subMonths(today, 1), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(today, "yyyy-MM-dd"));
  const [costCenter, setCostCenter] = useState("");

  const q = { start, end, costCenter: costCenter.trim() || undefined };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["accounting", "trial-balance", q],
    queryFn: () => posFetchTrialBalance(q),
    enabled: canGlRead,
  });

  const downloadMut = useMutation({
    mutationFn: async (kind: "xlsx" | "pdf") => {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (costCenter.trim()) params.set("costCenter", costCenter.trim());
      const qs = params.toString();
      const suffix = qs.length > 0 ? `?${qs}` : "";
      const base =
        kind === "pdf" ? "/api/accounting/export/trial-balance.pdf" : "/api/accounting/export/trial-balance.xlsx";
      const path = `${base}${suffix}`;
      return posDownloadAccountingExport(path);
    },
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      toast.success("Download started.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed."),
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view the trial balance.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const balanced = data?.balanced ?? true;
  const totalDebit = data?.totalDebit ?? 0;
  const totalCredit = data?.totalCredit ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting/ledger">
              <ArrowLeft className="mr-2 size-4" />
              Entries
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Trial balance</h1>
          <p className="text-muted-foreground text-sm">Aggregated debits and credits by GL account for the period.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/accounting/pnl">P&amp;L</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/accounting/balance-sheet">Balance sheet</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadMut.isPending}
            onClick={() => downloadMut.mutate("xlsx")}
          >
            <Download className="mr-2 size-4" />
            XLSX
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadMut.isPending}
            onClick={() => downloadMut.mutate("pdf")}
          >
            <Download className="mr-2 size-4" />
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Period</CardTitle>
          <CardDescription>Matches filters on journal entry dates and optional line analytics.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid w-full min-w-[10rem] max-w-[12rem] gap-2">
            <Label htmlFor="tb-start">Start</Label>
            <DatePicker id="tb-start" value={start} onValueChange={setStart} />
          </div>
          <div className="grid w-full min-w-[10rem] max-w-[12rem] gap-2">
            <Label htmlFor="tb-end">End</Label>
            <DatePicker id="tb-end" value={end} onValueChange={setEnd} />
          </div>
          <div className="grid w-full min-w-[10rem] max-w-[14rem] gap-2">
            <Label htmlFor="tb-cc">Cost center</Label>
            <Input
              id="tb-cc"
              placeholder="e.g. HQ"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className="h-10"
            />
          </div>
          <Button type="button" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Balances</CardTitle>
            <CardDescription className="text-pretty">
              Review debits, credits, and net balance by account. Totals appear at the bottom of the table.
            </CardDescription>
          </div>
          {isLoading ? null : balanced ? (
            <div className="flex items-center gap-1.5 text-green-600 text-sm">
              <CheckCircle2 className="size-4 shrink-0" /> Balanced
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-600 text-sm">
              <XCircle className="size-4 shrink-0" /> Rounding or out of balance — verify postings
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[6.5rem] pl-4 font-semibold">Code</TableHead>
                    <TableHead className="min-w-[10rem] font-semibold">Account</TableHead>
                    <TableHead className="w-[6rem] font-semibold">Type</TableHead>
                    <TableHead className="w-[8.5rem] text-right font-semibold">Debit</TableHead>
                    <TableHead className="w-[8.5rem] text-right font-semibold">Credit</TableHead>
                    <TableHead className="w-[8.5rem] pr-4 text-right font-semibold">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No activity in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={String(r.accountId ?? r.code ?? r.name)}>
                        <TableCell className="pl-4 font-mono text-xs tabular-nums">{r.code ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs capitalize">{r.type ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums tracking-tight">
                          {formatCurrency(r.debit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums tracking-tight">
                          {formatCurrency(r.credit)}
                        </TableCell>
                        <TableCell className="pr-4 text-right font-mono text-sm tabular-nums tracking-tight">
                          {formatCurrency(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {rows.length > 0 ? (
                  <TableFooter>
                    <TableRow className="border-border border-t-2 bg-muted/60 font-semibold hover:bg-muted/60">
                      <TableCell colSpan={3} className="pl-4 text-foreground">
                        Totals
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums tracking-tight">
                        {formatCurrency(totalDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums tracking-tight">
                        {formatCurrency(totalCredit)}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-muted-foreground text-xs">—</TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
