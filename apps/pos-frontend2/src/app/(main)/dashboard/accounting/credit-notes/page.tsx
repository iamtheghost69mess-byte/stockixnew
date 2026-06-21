"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import { IssueCreditNoteDialog } from "@/app/(main)/dashboard/accounting/_components/issue-credit-note-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreditNoteDoc } from "@/lib/pos-accounting-api";
import { posFetchCreditNotes } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function cnCustomer(cn: CreditNoteDoc): string {
  const c = cn.customer;
  if (c && typeof c === "object" && "name" in c) return c.name ?? "—";
  return "—";
}

function cnInvoiceLabel(cn: CreditNoteDoc): string {
  const inv = cn.invoice;
  if (inv && typeof inv === "object" && "invoiceNumber" in inv) return inv.invoiceNumber ?? "—";
  return "—";
}

export default function CreditNotesPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");
  const canArWrite = posCan(permissions, "backoffice.accounting.ar.write");
  const [issueOpen, setIssueOpen] = useState(false);

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "credit-notes"],
    queryFn: () => posFetchCreditNotes(),
    enabled: canArRead,
  });

  if (!canArRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          You need <span className="font-mono">backoffice.accounting.ar.read</span> to view credit notes.
        </p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting/invoices">
              <ArrowLeft className="mr-2 size-4" />
              Invoices
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Credit notes</h1>
          <p className="text-muted-foreground text-sm">
            Adjustments tied to invoices; posts reversing journal entries.
          </p>
        </div>
        {canArWrite ? (
          <Button type="button" onClick={() => setIssueOpen(true)}>
            <Plus className="mr-2 size-4" />
            Issue credit note
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credit note</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                      No credit notes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((cn) => (
                    <TableRow key={cn._id}>
                      <TableCell className="font-mono text-sm">{cn.creditNoteNumber}</TableCell>
                      <TableCell className="text-sm">{cnCustomer(cn)}</TableCell>
                      <TableCell className="font-mono text-sm">{cnInvoiceLabel(cn)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(cn.total)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{cn.reason ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="link" className="h-auto p-0" asChild>
                          <Link href={`/dashboard/accounting/credit-notes/${cn._id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <IssueCreditNoteDialog open={issueOpen} onOpenChange={setIssueOpen} />
    </div>
  );
}
