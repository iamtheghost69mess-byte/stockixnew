"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileUp, Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type BankCsvImportResult,
  type BankStatementLineDoc,
  posFetchBankStatements,
  posImportBankStatementsCsv,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function formatAmount(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function renderStatementBody(isLoading: boolean, lines: BankStatementLineDoc[]) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (lines.length === 0) {
    return <p className="text-muted-foreground text-sm">No bank statement lines for this tenant yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Posted</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>External ID</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((row: BankStatementLineDoc) => (
          <TableRow key={row._id}>
            <TableCell className="font-mono text-xs">
              {row.postedAt ? new Date(row.postedAt).toISOString().slice(0, 10) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono">{formatAmount(row.amount)}</TableCell>
            <TableCell>{row.description || row.memo || "—"}</TableCell>
            <TableCell className="font-mono text-xs">{row.externalId || "—"}</TableCell>
            <TableCell>
              <Badge variant={row.status === "matched" ? "default" : "secondary"}>{row.status || "unmatched"}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ImportSummary({ result }: Readonly<{ result: BankCsvImportResult }>) {
  const errors = result.errors || [];
  const duplicates = result.duplicates || [];
  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardHeader>
        <CardTitle className="text-base">Last import</CardTitle>
        <CardDescription>
          {result.imported} inserted · {duplicates.length} duplicate
          {duplicates.length === 1 ? "" : "s"} · {errors.length} error{errors.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      {errors.length > 0 || duplicates.length > 0 ? (
        <CardContent className="space-y-3 text-sm">
          {duplicates.length > 0 ? (
            <div>
              <p className="font-medium">Duplicates skipped</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {duplicates.slice(0, 10).map((d) => (
                  <li key={`${d.row}-${d.externalId || d.reason}`}>
                    Row {d.row}: {d.reason}
                    {d.externalId ? ` (${d.externalId})` : ""}
                  </li>
                ))}
                {duplicates.length > 10 ? <li>…and {duplicates.length - 10} more.</li> : null}
              </ul>
            </div>
          ) : null}
          {errors.length > 0 ? (
            <div>
              <p className="font-medium text-destructive">Row errors</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {errors.slice(0, 10).map((e) => (
                  <li key={`${e.row}-${e.reason}`}>
                    Row {e.row}: {e.reason}
                  </li>
                ))}
                {errors.length > 10 ? <li>…and {errors.length - 10} more.</li> : null}
              </ul>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function AccountingBankPage() {
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.bank.read");
  const canWrite = posCan(permissions, "backoffice.accounting.write");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lastResult, setLastResult] = useState<BankCsvImportResult | null>(null);

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["accounting", "bank-statements"],
    queryFn: posFetchBankStatements,
    enabled: canRead,
  });

  const importMut = useMutation({
    mutationFn: (file: File) => posImportBankStatementsCsv(file),
    onSuccess: (r) => {
      setLastResult(r);
      toast.success(`Imported ${r.imported} row${r.imported === 1 ? "" : "s"}.`);
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bank-statements"] });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed."),
  });

  function handleFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    importMut.mutate(file);
  }

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Bank statements require `backoffice.accounting.bank.read`.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/accounts">
            <ArrowLeft className="mr-2 size-4" />
            Chart of accounts
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
          <PiggyBank className="size-8" />
          Bank reconciliation
        </h1>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Import CSV v1 statements (columns <code className="text-xs">postedAt</code>,{" "}
          <code className="text-xs">amount</code>, <code className="text-xs">description</code>,{" "}
          <code className="text-xs">externalId</code>), then match lines via{" "}
          <code className="text-xs">POST /bank/match</code>. Spec lives in{" "}
          <code className="text-xs">acc&amp;invetmissing/ACCOUNTING.md §9</code>.
        </p>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            variant="default"
            disabled={importMut.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {importMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 size-4" />
            )}
            Upload CSV statement
          </Button>
          <p className="text-muted-foreground text-xs">
            Max 2 MB · 5 000 rows · UTF-8 · headers: <code>postedAt, amount, description, externalId</code>
          </p>
        </div>
      ) : null}

      {lastResult ? <ImportSummary result={lastResult} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Statement lines</CardTitle>
          <CardDescription>Latest rows for this tenant (server returns up to 200, newest first).</CardDescription>
        </CardHeader>
        <CardContent>{renderStatementBody(isLoading, lines)}</CardContent>
      </Card>
    </div>
  );
}
