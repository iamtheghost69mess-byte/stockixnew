"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  posFetchConsolidatedTrialBalance,
  posListConsolidationChildOrganizations,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function ConsolidatedReportsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.consolidated.read");

  const today = new Date();
  const [start, setStart] = useState(format(subMonths(today, 1), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(today, "yyyy-MM-dd"));
  const [costCenter, setCostCenter] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const { data: children = [] } = useQuery({
    queryKey: ["accounting", "consolidation-children"],
    queryFn: posListConsolidationChildOrganizations,
    enabled: canRead,
  });

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["accounting", "consolidated-tb", start, end, costCenter, selectedIds.join(",")],
    queryFn: () =>
      posFetchConsolidatedTrialBalance({
        start,
        end,
        costCenter: costCenter.trim() || undefined,
        childOrganizationIds: selectedIds,
      }),
    enabled: canRead && selectedIds.length > 0,
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need consolidated reporting permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const balanced = data?.balanced ?? true;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/trial-balance">
            <ArrowLeft className="mr-2 size-4" />
            Single-entity trial balance
          </Link>
        </Button>
        <h1 className="font-bold text-3xl tracking-tight">Consolidated trial balance</h1>
        <p className="max-w-3xl text-pretty text-muted-foreground text-sm">
          V1 sums each child organization&apos;s trial balance and merges rows by account code. Child tenants must
          have <span className="font-mono">parentOrganization</span> pointing at this Studio org. Intercompany
          eliminations are not applied.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Child organizations</CardTitle>
          <CardDescription>Select one or more direct children to include.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {children.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No child organizations found. Set <code className="font-mono text-xs">parentOrganization</code> on
              other org documents to this tenant&apos;s id.
            </p>
          ) : (
            <ul className="space-y-2">
              {children.map((c) => (
                <li key={c._id} className="flex items-center gap-3">
                  <input
                    id={`org-${c._id}`}
                    type="checkbox"
                    className="size-4 rounded border border-input"
                    checked={!!selected[c._id]}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [c._id]: e.target.checked }))
                    }
                  />
                  <label htmlFor={`org-${c._id}`} className="text-sm">
                    {c.name || c.slug || c._id}
                    {c.slug ? (
                      <span className="ml-2 font-mono text-muted-foreground text-xs">({c.slug})</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Period</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="c-start">Start</Label>
            <DatePicker id="c-start" value={start} onValueChange={setStart} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-end">End</Label>
            <DatePicker id="c-end" value={end} onValueChange={setEnd} />
          </div>
          <div className="grid min-w-[10rem] gap-2">
            <Label htmlFor="c-cc">Cost center</Label>
            <Input
              id="c-cc"
              className="h-10"
              placeholder="Optional"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" disabled={isFetching || selectedIds.length === 0} onClick={() => void refetch()}>
            Run
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Merged balances</CardTitle>
            <CardDescription>By account code across selected children.</CardDescription>
          </div>
          {!isLoading && selectedIds.length > 0 ? (
            balanced ? (
              <div className="flex items-center gap-1.5 text-green-600 text-sm">
                <CheckCircle2 className="size-4 shrink-0" /> Balanced
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 text-sm">
                <XCircle className="size-4 shrink-0" /> Check rounding / COA alignment
              </div>
            )
          ) : null}
        </CardHeader>
        <CardContent className="pt-6">
          {selectedIds.length === 0 ? (
            <p className="text-muted-foreground text-sm">Select at least one child organization.</p>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed."}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No GL activity in range for selected orgs.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={String(r.code ?? r.accountId)}>
                        <TableCell className="font-mono text-xs">{r.code ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.name ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(r.debit)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(r.credit)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(r.balance)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {rows.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Totals</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(data?.totalDebit ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(data?.totalCredit ?? 0)}
                      </TableCell>
                      <TableCell />
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
