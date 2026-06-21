"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JournalLineDoc } from "@/lib/pos-accounting-api";
import { formatJournalEntryReference, posGetJournalEntry } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function accountCell(line: JournalLineDoc): { code: string; name: string } {
  const a = line.account;
  if (a && typeof a === "object" && "_id" in a) {
    return { code: String(a.code ?? ""), name: String(a.name ?? "") };
  }
  return { code: "—", name: String(a) };
}

export default function JournalEntryDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const {
    data: entry,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "journal", id],
    queryFn: () => posGetJournalEntry(id),
    enabled: Boolean(id) && canGlRead,
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view this entry.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting/ledger">Back to entries</Link>
        </Button>
      </div>
    );
  }

  if (!id) {
    return <div className="p-6 text-destructive">Invalid journal id.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !entry) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error instanceof Error ? error.message : "Journal not found."}</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting/ledger">Back to entries</Link>
        </Button>
      </div>
    );
  }

  let sumDr = 0;
  let sumCr = 0;
  for (const l of entry.lines || []) {
    sumDr += l.debit || 0;
    sumCr += l.credit || 0;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/ledger">
            <ArrowLeft className="mr-2 size-4" />
            Entries
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-bold text-3xl tracking-tight">{formatJournalEntryReference(entry.entryNumber)}</h1>
          <Badge variant="secondary">{entry.sourceType}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {entry.entryDate ? format(new Date(entry.entryDate), "yyyy-MM-dd HH:mm") : "—"} · {entry.memo || "No memo"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>
            Totals: debits {formatCurrency(sumDr)} · credits {formatCurrency(sumCr)}
            {Math.abs(sumDr - sumCr) > 0.005 ? (
              <span className="text-destructive"> · Unbalanced (check data)</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Memo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entry.lines || []).map((line) => {
                const { code, name } = accountCell(line);
                return (
                  <TableRow key={line._id ?? `${code}-${line.debit}-${line.credit}`}>
                    <TableCell>
                      <span className="font-mono text-xs">{code}</span>
                      {name ? <div className="text-sm">{name}</div> : null}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {line.debit ? formatCurrency(line.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {line.credit ? formatCurrency(line.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{line.memo || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
