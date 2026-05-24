"use client";

import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { posCreateVendorBillFromPO } from "@/lib/pos-accounting-api";
import { posFetchPurchaseOrders, posPurchaseOrderRowsFromListQuery } from "@/lib/pos-procurement-api";
import { vendorBillFromPoFormSchema } from "@/lib/schemas/accounting/vendor-bill-from-po";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";

export function VendorBillFromPoDialog({
  open,
  onOpenChange,
  initialPurchaseOrderId,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPurchaseOrderId?: string | null;
}>) {
  const qc = useQueryClient();
  const [poId, setPoId] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [currency, setCurrency] = useState("USD");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: poListResult, isLoading: posLoading } = useQuery({
    queryKey: ["procurement-pos"],
    queryFn: posFetchPurchaseOrders,
    enabled: open,
  });
  const pos = posPurchaseOrderRowsFromListQuery(poListResult);

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      return;
    }
    setFieldErrors({});
    setPoId(initialPurchaseOrderId?.trim() ?? "");
  }, [open, initialPurchaseOrderId]);

  const mut = useMutation({
    mutationFn: async () => {
      const id = poId.trim();
      return posCreateVendorBillFromPO({
        purchaseOrderId: id,
        billDate: `${billDate}T12:00:00.000Z`,
        dueDate: `${dueDate}T12:00:00.000Z`,
        currency: currency.trim() || "USD",
      });
    },
    onSuccess: (bill) => {
      toast.success(`Vendor bill ${bill.vendorBillNumber} created (draft).`);
      void qc.invalidateQueries({ queryKey: ["accounting", "vendor-bills"] });
      void qc.invalidateQueries({ queryKey: ["procurement-pos"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create bill."),
  });

  function submitBill() {
    const parsed = vendorBillFromPoFormSchema.safeParse({
      purchaseOrderId: poId.trim(),
      billDate,
      dueDate,
      currency,
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
          <DialogTitle>Vendor bill from purchase order</DialogTitle>
          <DialogDescription>
            Creates a <strong>draft</strong> vendor bill from PO lines (received or ordered quantities × unit cost).
            Post it from the bill detail to hit AP / GRNI per your GL configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Purchase order</Label>
            {posLoading ? (
              <p className="text-muted-foreground text-sm">Loading purchase orders…</p>
            ) : (
              <Select
                value={poId || "__manual__"}
                onValueChange={(v) => {
                  setPoId(v === "__manual__" ? "" : v);
                  setFieldErrors((p) => ({ ...p, purchaseOrderId: "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose PO" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">Enter PO id manually…</SelectItem>
                  {pos.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      PO-{p._id.slice(-6)} · {p.supplierName ?? "Supplier"} · {p.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vb-po-id">PO ID (MongoDB)</Label>
            <Input
              id="vb-po-id"
              className="font-mono text-sm"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
              placeholder="507f1f77bcf86cd799439011"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="vb-bill">Bill date</Label>
              <DatePicker id="vb-bill" value={billDate} onValueChange={setBillDate} className="w-full" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vb-due">Due date</Label>
              <DatePicker id="vb-due" value={dueDate} onValueChange={setDueDate} className="w-full" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vb-ccy">Currency</Label>
            <Input
              id="vb-ccy"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value.toUpperCase());
                setFieldErrors((p) => ({ ...p, currency: "" }));
              }}
              maxLength={8}
            />
            {fieldErrors.currency ? <p className="text-destructive text-sm">{fieldErrors.currency}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={mut.isPending} onClick={submitBill}>
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
