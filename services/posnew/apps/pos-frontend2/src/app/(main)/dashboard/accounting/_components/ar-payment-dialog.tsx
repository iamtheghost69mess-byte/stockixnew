"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { posFetchInvoices, posPostArPayment } from "@/lib/pos-accounting-api";
import { posListCustomers } from "@/lib/pos-customer-api";
import { arPaymentFormSchema } from "@/lib/schemas/accounting/ar-payment";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { formatCurrency } from "@/lib/utils";

export function ArPaymentDialog({
  open,
  onOpenChange,
  initialCustomerId,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCustomerId?: string | null;
}>) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [useExplicitAlloc, setUseExplicitAlloc] = useState(false);
  const [allocInvoiceId, setAllocInvoiceId] = useState("");
  const [allocAmountStr, setAllocAmountStr] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: posListCustomers,
    enabled: open,
  });

  const { data: openInvoices = [] } = useQuery({
    queryKey: ["accounting", "invoices", "open-for-customer", customerId],
    queryFn: () => posFetchInvoices({ customerId: customerId.trim(), limit: 100 }),
    enabled: open && Boolean(customerId.trim()),
  });

  const payable = useMemo(
    () => openInvoices.filter((inv) => inv.status !== "void" && inv.status !== "paid"),
    [openInvoices],
  );

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      return;
    }
    setFieldErrors({});
    setCustomerId(initialCustomerId ?? "");
  }, [open, initialCustomerId]);

  const mut = useMutation({
    mutationFn: async () => {
      const amount = Number.parseFloat(amountStr);
      let allocations: Array<{ invoiceId: string; amount: number }> | undefined;
      if (useExplicitAlloc && allocInvoiceId && allocAmountStr.trim()) {
        const a = Number.parseFloat(allocAmountStr);
        allocations = [{ invoiceId: allocInvoiceId, amount: a }];
      }
      return posPostArPayment({
        customerId: customerId.trim(),
        amount,
        allocations,
      });
    },
    onSuccess: (entry) => {
      toast.success(
        <span>
          Payment posted (journal #{entry.entryNumber}).{" "}
          <Link href={`/dashboard/accounting/journal/${entry._id}`} className="underline">
            View entry
          </Link>
        </span>,
      );
      void qc.invalidateQueries({ queryKey: ["accounting", "invoices"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "ar-aging"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "journals"] });
      onOpenChange(false);
      setAmountStr("");
      setAllocInvoiceId("");
      setAllocAmountStr("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Payment failed."),
  });

  function submitPayment() {
    const parsed = arPaymentFormSchema.safeParse({
      customerId,
      amountStr,
      useExplicitAlloc,
      allocInvoiceId,
      allocAmountStr,
    });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setFieldErrors({});
    mut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record AR payment</DialogTitle>
          <DialogDescription>
            Posts cash debit and AR credit. Excess over open invoices can route to customer deposit when configured in
            GL settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Customer</Label>
            <Select
              value={customerId.trim() ? customerId : "__none__"}
              onValueChange={(v) => {
                setCustomerId(v === "__none__" ? "" : v);
                setFieldErrors((p) => ({ ...p, customerId: "" }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.customerId ? <p className="text-destructive text-sm">{fieldErrors.customerId}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ar-amt">Amount received</Label>
            <Input
              id="ar-amt"
              type="number"
              min={0}
              step="0.01"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setFieldErrors((p) => ({ ...p, amountStr: "" }));
              }}
            />
            {fieldErrors.amountStr ? <p className="text-destructive text-sm">{fieldErrors.amountStr}</p> : null}
          </div>
          {payable.length > 0 ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">Open invoices</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {payable.map((inv) => {
                  const due = inv.total - (inv.amountPaid ?? 0);
                  return (
                    <li key={inv._id} className="flex justify-between gap-2 font-mono text-xs">
                      <span>{inv.invoiceNumber}</span>
                      <span>{formatCurrency(due)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              id="ar-explicit"
              type="checkbox"
              checked={useExplicitAlloc}
              onChange={(e) => setUseExplicitAlloc(e.target.checked)}
              className="size-4 rounded border"
            />
            <Label htmlFor="ar-explicit" className="font-normal">
              Specify one invoice allocation (otherwise backend applies to oldest open first)
            </Label>
          </div>
          {useExplicitAlloc ? (
            <div className="grid gap-2">
              <Label>Invoice</Label>
              <Select
                value={allocInvoiceId || "__pick__"}
                onValueChange={(v) => setAllocInvoiceId(v === "__pick__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Invoice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__">—</SelectItem>
                  {payable.map((inv) => (
                    <SelectItem key={inv._id} value={inv._id}>
                      {inv.invoiceNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="ar-alloc-amt">Apply to invoice</Label>
              <Input
                id="ar-alloc-amt"
                type="number"
                step="0.01"
                value={allocAmountStr}
                onChange={(e) => {
                  setAllocAmountStr(e.target.value);
                  setFieldErrors((p) => ({ ...p, allocAmountStr: "" }));
                }}
              />
              {fieldErrors.allocAmountStr ? (
                <p className="text-destructive text-sm">{fieldErrors.allocAmountStr}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={mut.isPending} onClick={submitPayment}>
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Post payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
