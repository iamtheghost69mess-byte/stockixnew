"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, FilePlus2, Loader2, Stamp } from "lucide-react";
import { toast } from "sonner";

import { ArPaymentDialog } from "@/app/(main)/dashboard/accounting/_components/ar-payment-dialog";
import { InvoiceFromOrderDialog } from "@/app/(main)/dashboard/accounting/_components/invoice-from-order-dialog";
import { IssueCreditNoteDialog } from "@/app/(main)/dashboard/accounting/_components/issue-credit-note-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountingInvoiceDoc } from "@/lib/pos-accounting-api";
import { posFetchInvoices, posVoidInvoice } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function customerName(inv: AccountingInvoiceDoc): string {
  const c = inv.customer;
  if (c && typeof c === "object" && "name" in c) return c.name ?? "—";
  return "—";
}

function customerId(inv: AccountingInvoiceDoc): string | null {
  const c = inv.customer;
  if (c && typeof c === "object" && "_id" in c && c._id) return String(c._id);
  if (typeof c === "string") return c;
  return null;
}

export default function InvoicesPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");
  const canArWrite = posCan(permissions, "backoffice.accounting.ar.write");
  const canListOrders = posCan(permissions, "pos.order.read");

  const [status, setStatus] = useState<string>("all");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cnOpen, setCnOpen] = useState(false);
  const [payCustomerId, setPayCustomerId] = useState<string | null>(null);
  const [cnInvoiceId, setCnInvoiceId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<AccountingInvoiceDoc | null>(null);

  const qc = useQueryClient();
  const {
    data: invoices = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "invoices", status],
    queryFn: () =>
      posFetchInvoices({
        limit: 200,
        ...(status !== "all" ? { status } : {}),
      }),
    enabled: canArRead,
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => posVoidInvoice(id),
    onSuccess: () => {
      toast.success("Invoice voided.");
      void qc.invalidateQueries({ queryKey: ["accounting", "invoices"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "ar-aging"] });
      setVoidTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Void failed."),
  });

  if (!canArRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          You need <span className="font-mono">backoffice.accounting.ar.read</span> to view invoices.
        </p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting/accounts">
              <ArrowLeft className="mr-2 size-4" />
              Chart of accounts
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Invoices (AR)</h1>
          <p className="text-muted-foreground text-sm">Sales invoices issued from orders and payment status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canArWrite ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceOpen(true)}>
                <FilePlus2 className="mr-2 size-4" />
                From order
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPayCustomerId(null);
                  setPayOpen(true);
                }}
              >
                <CreditCard className="mr-2 size-4" />
                Record payment
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCnInvoiceId(null);
                  setCnOpen(true);
                }}
              >
                <Stamp className="mr-2 size-4" />
                Credit note
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>All invoices</CardTitle>
            <CardDescription>Filter by accounting status.</CardDescription>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
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
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground text-sm">
                      No invoices for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => {
                    const bal = inv.total - (inv.amountPaid ?? 0);
                    const cid = customerId(inv);
                    return (
                      <TableRow key={inv._id}>
                        <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-sm">{customerName(inv)}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "void" ? "secondary" : "default"} className="capitalize">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(inv.total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(inv.amountPaid ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(bal)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canArWrite && inv.status !== "void" ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8"
                                  disabled={!cid}
                                  onClick={() => {
                                    if (cid) {
                                      setPayCustomerId(cid);
                                      setPayOpen(true);
                                    }
                                  }}
                                >
                                  Pay
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => {
                                    setCnInvoiceId(inv._id);
                                    setCnOpen(true);
                                  }}
                                >
                                  Credit
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-destructive"
                                  onClick={() => setVoidTarget(inv)}
                                >
                                  Void
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard/accounting/ar-aging" className="text-primary underline-offset-4 hover:underline">
          AR aging report
        </Link>
        <Link href="/dashboard/accounting/credit-notes" className="text-primary underline-offset-4 hover:underline">
          Credit notes
        </Link>
      </div>

      <InvoiceFromOrderDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} canListOrders={canListOrders} />
      <ArPaymentDialog
        open={payOpen}
        onOpenChange={(o) => {
          setPayOpen(o);
          if (!o) setPayCustomerId(null);
        }}
        initialCustomerId={payCustomerId}
      />
      <IssueCreditNoteDialog
        open={cnOpen}
        onOpenChange={(o) => {
          setCnOpen(o);
          if (!o) setCnInvoiceId(null);
        }}
        initialInvoiceId={cnInvoiceId}
      />

      <Dialog open={voidTarget != null} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void invoice?</DialogTitle>
            <DialogDescription>
              This sets status to void for {voidTarget?.invoiceNumber}. Reversal journals are not created by this action
              — confirm with your accountant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={voidMut.isPending}
              onClick={() => voidTarget && voidMut.mutate(voidTarget._id)}
            >
              {voidMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Void invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
