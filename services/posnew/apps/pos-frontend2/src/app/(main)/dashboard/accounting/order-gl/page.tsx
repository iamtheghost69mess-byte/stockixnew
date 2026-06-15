"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  posAccountingPostOrder,
  posAccountingPostOrderRefund,
  posAccountingReverseOrder,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { orderGlPostSchema, orderGlRefundSchema } from "@/lib/schemas/accounting/order-gl";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function oid(raw: string): string | null {
  const v = raw.trim();
  if (!v || !/^[a-f\d]{24}$/i.test(v)) return null;
  return v;
}

export default function AccountingOrderGlPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.accounting.write");

  const [orderId, setOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundAccount, setRefundAccount] = useState("");
  const [dialog, setDialog] = useState<"post" | "reverse" | "refund" | null>(null);
  const [glFieldErrors, setGlFieldErrors] = useState<Record<string, string>>({});

  const id = oid(orderId);

  const postMut = useMutation({
    mutationFn: () => {
      const order = oid(orderId);
      if (!order) throw new Error("Invalid order id.");
      return posAccountingPostOrder(order);
    },
    onSuccess: () => toast.success("Post-order GL ran."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Request failed."),
  });

  const reverseMut = useMutation({
    mutationFn: () => {
      const order = oid(orderId);
      if (!order) throw new Error("Invalid order id.");
      return posAccountingReverseOrder(order);
    },
    onSuccess: () => toast.success("Order GL reversal posted."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Request failed."),
  });

  const refundMut = useMutation({
    mutationFn: () => {
      const order = oid(orderId);
      if (!order) throw new Error("Invalid order id.");
      const amount = Number.parseFloat(refundAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Refund amount must be positive.");
      return posAccountingPostOrderRefund(order, {
        amount,
        refundToAccountId: refundAccount.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Refund GL posted.");
      setRefundAmount("");
      setRefundAccount("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Request failed."),
  });

  function confirmPostGl() {
    const parsed = orderGlPostSchema.safeParse({ orderId: orderId.trim() });
    if (!parsed.success) {
      setGlFieldErrors(fieldErrorsFromZodError(parsed.error));
      setDialog(null);
      return;
    }
    setGlFieldErrors({});
    postMut.mutate();
    setDialog(null);
  }

  function confirmReverseGl() {
    const parsed = orderGlPostSchema.safeParse({ orderId: orderId.trim() });
    if (!parsed.success) {
      setGlFieldErrors(fieldErrorsFromZodError(parsed.error));
      setDialog(null);
      return;
    }
    setGlFieldErrors({});
    reverseMut.mutate();
    setDialog(null);
  }

  function confirmRefundGl() {
    const parsed = orderGlRefundSchema.safeParse({
      orderId: orderId.trim(),
      refundAmount,
      refundAccount,
    });
    if (!parsed.success) {
      setGlFieldErrors(fieldErrorsFromZodError(parsed.error));
      setDialog(null);
      return;
    }
    setGlFieldErrors({});
    refundMut.mutate();
    setDialog(null);
  }

  if (!canWrite) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Order GL tools require accounting write access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/accounts">
            <ArrowLeft className="mr-2 size-4" />
            Chart of accounts
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
          <RotateCcw className="size-8" />
          Order GL tools
        </h1>
        <p className="text-muted-foreground text-sm">
          Calls <code className="text-xs">post-order</code>, <code className="text-xs">reverse-order</code>, and{" "}
          <code className="text-xs">refunds</code>. Intended for finance support — can duplicate or reverse posted
          journals.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
          <CardDescription>Paste a MongoDB order id (24 hex chars).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="oid">Order id</Label>
            <Input
              id="oid"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setGlFieldErrors((p) => ({ ...p, orderId: "" }));
              }}
              placeholder="Order _id"
            />
            {glFieldErrors.orderId ? <p className="text-destructive text-sm">{glFieldErrors.orderId}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!id || postMut.isPending}
              onClick={() => setDialog("post")}
            >
              {postMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Post sale (if missing)
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!id || reverseMut.isPending}
              onClick={() => setDialog("reverse")}
            >
              {reverseMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Reverse sale / COGS
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refund journal</CardTitle>
          <CardDescription>
            Maps to <code className="text-xs">POST /api/accounting/refunds/:orderId</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ramt">Amount</Label>
              <Input
                id="ramt"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => {
                  setRefundAmount(e.target.value);
                  setGlFieldErrors((p) => ({ ...p, refundAmount: "" }));
                }}
              />
              {glFieldErrors.refundAmount ? (
                <p className="text-destructive text-sm">{glFieldErrors.refundAmount}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="racc">Refund-to account id (optional)</Label>
              <Input id="racc" value={refundAccount} onChange={(e) => setRefundAccount(e.target.value)} />
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={!id || refundMut.isPending}
            onClick={() => setDialog("refund")}
          >
            {refundMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Post refund GL
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={dialog === "post"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post order GL?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates sale ledger lines if none exist. Safe if server returns “already posted”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPostGl}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "reverse"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse order GL?</AlertDialogTitle>
            <AlertDialogDescription>
              This posts reversal journals. Only continue if finance approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReverseGl}>Confirm reverse</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "refund"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post refund GL?</AlertDialogTitle>
            <AlertDialogDescription>Creates a refund journal for the amount entered.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRefundGl}>Confirm refund</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
