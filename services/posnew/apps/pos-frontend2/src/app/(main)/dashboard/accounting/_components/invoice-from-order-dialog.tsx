"use client";

import { useEffect, useState } from "react";

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
import { posCreateInvoiceFromOrder } from "@/lib/pos-accounting-api";
import { type PosOrderListItem, posListOrdersPage } from "@/lib/pos-order-api";
import { invoiceFromOrderFormSchema } from "@/lib/schemas/accounting/invoice-from-order";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";

function formatOrderReference(order: PosOrderListItem): string {
  if (typeof order.orderNumber === "number" && Number.isFinite(order.orderNumber)) {
    return `#${String(Math.max(0, Math.floor(order.orderNumber))).padStart(6, "0")}`;
  }
  return `#${order._id.slice(-8)}`;
}

export function InvoiceFromOrderDialog({
  open,
  onOpenChange,
  canListOrders,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canListOrders: boolean;
}>) {
  const qc = useQueryClient();
  const [orderIdManual, setOrderIdManual] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [manualMode, setManualMode] = useState(false);
  const [dueDays, setDueDays] = useState("30");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      setSelectedOrderId("");
      setOrderIdManual("");
      setManualMode(false);
      return;
    }
    setFieldErrors({});
  }, [open]);

  const { data: ordersPage, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", "recent-for-invoice", 1],
    queryFn: () => posListOrdersPage({ page: 1, limit: 30 }),
    enabled: open && canListOrders,
  });

  const orders = ordersPage?.orders ?? [];

  const mut = useMutation({
    mutationFn: async () => {
      const oid = manualMode ? orderIdManual.trim() : selectedOrderId.trim() || orderIdManual.trim();
      const d = Number.parseInt(dueDays, 10);
      return posCreateInvoiceFromOrder(oid, { dueDays: Number.isFinite(d) ? d : 30 });
    },
    onSuccess: () => {
      toast.success("Invoice created from order.");
      void qc.invalidateQueries({ queryKey: ["accounting", "invoices"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "ar-aging"] });
      onOpenChange(false);
      setOrderIdManual("");
      setSelectedOrderId("");
      setManualMode(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create invoice."),
  });

  function submitInvoice() {
    const parsed = invoiceFromOrderFormSchema.safeParse({
      selectedOrderId,
      orderIdManual,
      dueDays,
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
          <DialogTitle>Invoice from order</DialogTitle>
          <DialogDescription>
            Creates an accounting invoice from a POS order with a linked customer. Order totals come from
            <span className="font-mono"> bills</span> on the order.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {canListOrders ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Label>{manualMode ? "Manual entry mode" : "Recent order"}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setManualMode((prev) => !prev);
                    setFieldErrors((p) => ({ ...p, orderIdManual: "" }));
                  }}
                >
                  {manualMode ? "Use recent list" : "Enter ID manually"}
                </Button>
              </div>
              {!manualMode ? (
                <div className="grid gap-2">
                  {ordersLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="size-4 animate-spin" /> Loading orders…
                    </div>
                  ) : orders.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No recent orders found. Switch to manual mode and paste an order ID.
                    </p>
                  ) : (
                    <Select
                      value={selectedOrderId}
                      onValueChange={(v) => {
                        setSelectedOrderId(v);
                        setOrderIdManual("");
                        setFieldErrors((p) => ({ ...p, orderIdManual: "" }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an order to invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {orders.map((o: PosOrderListItem) => (
                          <SelectItem key={o._id} value={o._id}>
                            Order {formatOrderReference(o)} · {o.orderStatus ?? "unknown"} ·{" "}
                            {o.bills?.totalWithTax != null ? `$${Number(o.bills.totalWithTax).toFixed(2)}` : "No total"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              Grant <span className="font-mono">pos.order.read</span> to pick from recent orders; otherwise paste the
              MongoDB order <span className="font-mono">_id</span>.
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="inv-order-id">Order ID {manualMode ? "" : "(optional fallback)"}</Label>
            <Input
              id="inv-order-id"
              placeholder="507f1f77bcf86cd799439011"
              value={orderIdManual}
              onChange={(e) => {
                setOrderIdManual(e.target.value);
                setFieldErrors((p) => ({ ...p, orderIdManual: "" }));
              }}
              disabled={Boolean(canListOrders && !manualMode && selectedOrderId)}
              className="font-mono text-sm"
            />
            {fieldErrors.orderIdManual ? <p className="text-destructive text-sm">{fieldErrors.orderIdManual}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inv-due">Due days</Label>
            <Input
              id="inv-due"
              type="number"
              min={1}
              max={365}
              value={dueDays}
              onChange={(e) => {
                setDueDays(e.target.value);
                setFieldErrors((p) => ({ ...p, dueDays: "" }));
              }}
            />
            {fieldErrors.dueDays ? <p className="text-destructive text-sm">{fieldErrors.dueDays}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={mut.isPending} onClick={submitInvoice}>
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
