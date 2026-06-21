"use client";

import { useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorBillDoc, VendorBillLineDoc } from "@/lib/pos-accounting-api";
import {
  posGetVendorBill,
  posPostVendorBill,
  posRecordVendorBillPayment,
  posVoidVendorBill,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { vendorBillPaymentFormSchema } from "@/lib/schemas/accounting/vendor-bill-payment";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function supplierLabel(b: VendorBillDoc): string {
  const s = b.supplier;
  if (s && typeof s === "object" && "name" in s) return s.name ?? "—";
  return "—";
}

function lineIngredient(line: VendorBillLineDoc): string {
  const ing = line.ingredient;
  if (ing && typeof ing === "object" && "name" in ing) return ing.name ?? line.itemDescription;
  return line.itemDescription;
}

export default function VendorBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canApRead = posCan(permissions, "backoffice.accounting.ap.read");
  const canApWrite = posCan(permissions, "backoffice.accounting.ap.write");

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("transfer");
  const [voidOpen, setVoidOpen] = useState(false);
  const [payFieldErrors, setPayFieldErrors] = useState<Record<string, string>>({});

  const {
    data: bill,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "vendor-bill", id],
    queryFn: () => posGetVendorBill(id),
    enabled: canApRead && Boolean(id),
  });

  const postMut = useMutation({
    mutationFn: () => posPostVendorBill(id),
    onSuccess: () => {
      toast.success("Vendor bill posted.");
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bill", id] });
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bills"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Post failed."),
  });

  const payMut = useMutation({
    mutationFn: () => {
      const amount = Number.parseFloat(payAmount);
      return posRecordVendorBillPayment(id, {
        amount,
        method: payMethod || undefined,
        date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded.");
      setPayFieldErrors({});
      setPayOpen(false);
      setPayAmount("");
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bill", id] });
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bills"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Payment failed."),
  });

  function submitVendorBillPayment() {
    const parsed = vendorBillPaymentFormSchema.safeParse({ payAmount });
    if (!parsed.success) {
      setPayFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setPayFieldErrors({});
    payMut.mutate();
  }

  const voidMut = useMutation({
    mutationFn: () => posVoidVendorBill(id),
    onSuccess: () => {
      toast.success("Vendor bill voided.");
      setVoidOpen(false);
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bill", id] });
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bills"] });
      router.push("/dashboard/accounting/vendor-bills");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Void failed."),
  });

  if (!canApRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need AP read permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  const lines = bill?.lines ?? [];
  const balance = bill ? bill.total - (bill.amountPaid ?? 0) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href="/dashboard/accounting/vendor-bills">
          <ArrowLeft className="mr-2 size-4" />
          Vendor bills
        </Link>
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
      ) : bill ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-bold font-mono text-3xl tracking-tight">{bill.vendorBillNumber}</h1>
              <p className="text-muted-foreground text-sm">{supplierLabel(bill)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className="capitalize">{bill.status}</Badge>
                {bill.currency ? <span className="text-muted-foreground text-xs">{bill.currency}</span> : null}
              </div>
            </div>
            {canApWrite ? (
              <div className="flex flex-wrap gap-2">
                {bill.status === "draft" ? (
                  <Button type="button" disabled={postMut.isPending} onClick={() => postMut.mutate()}>
                    {postMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Post bill
                  </Button>
                ) : null}
                {bill.status === "posted" || bill.status === "partial" ? (
                  <Button type="button" variant="secondary" onClick={() => setPayOpen(true)}>
                    Record payment
                  </Button>
                ) : null}
                {bill.status !== "void" && bill.status !== "paid" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setVoidOpen(true)}
                  >
                    Void
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatCurrency(bill.total)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Paid</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatCurrency(bill.amountPaid ?? 0)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Balance</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatCurrency(balance)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dates</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {bill.billDate ? <p>Bill date: {format(new Date(bill.billDate), "yyyy-MM-dd")}</p> : null}
              {bill.dueDate ? <p>Due: {format(new Date(bill.dueDate), "yyyy-MM-dd")}</p> : null}
            </CardContent>
          </Card>

          {bill.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{bill.notes}</CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
              <CardDescription>{lines.length} line(s)</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs uppercase">
                    <th className="pr-4 pb-2">Item</th>
                    <th className="pr-4 pb-2 text-right">Qty</th>
                    <th className="pr-4 pb-2 text-right">Unit</th>
                    <th className="pb-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr
                      key={line._id ?? `${line.itemDescription}-${line.lineTotal}`}
                      className="border-border/60 border-b"
                    >
                      <td className="py-2 pr-4">{lineIngredient(line)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{line.quantity}</td>
                      <td className="py-2 pr-4 text-right font-mono">{formatCurrency(line.unitPrice)}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Not found.</p>
      )}

      <Dialog
        open={payOpen}
        onOpenChange={(o) => {
          setPayOpen(o);
          if (!o) setPayFieldErrors({});
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Reduces AP for this bill. Remaining balance: {formatCurrency(balance)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="vb-pay-amt">Amount</Label>
              <Input
                id="vb-pay-amt"
                type="number"
                step="0.01"
                min={0}
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  setPayFieldErrors((p) => ({ ...p, payAmount: "" }));
                }}
              />
              {payFieldErrors.payAmount ? <p className="text-destructive text-sm">{payFieldErrors.payAmount}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vb-pay-m">Method</Label>
              <Input
                id="vb-pay-m"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="transfer, check, …"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={payMut.isPending} onClick={submitVendorBillPayment}>
              {payMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void vendor bill?</DialogTitle>
            <DialogDescription>
              This marks the bill void. Confirm with your accountant if journals were posted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={voidMut.isPending} onClick={() => voidMut.mutate()}>
              {voidMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Void bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
