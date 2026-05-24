"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { INGREDIENTS_QUERY_KEY, invalidateInventoryHubQueries } from "@/lib/inventory-api";
import {
  GOODS_RECEIPT_NOTES_QUERY_KEY,
  type PosGoodsReceiptNote,
  type PosGrnLine,
  type PosGrnLineQcStatus,
  posConfirmGoodsReceiptNote,
  posFetchGoodsReceiptNote,
  posTransitionGoodsReceiptNoteQc,
  posUpdateGoodsReceiptNote,
} from "@/lib/pos-grn-api";
import { formatCurrency } from "@/lib/utils";

function grnStatusClass(status: PosGoodsReceiptNote["status"]) {
  switch (status) {
    case "confirmed":
      return "bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400";
    case "cancelled":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "qc_pending":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "qc_failed":
      return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";
    default:
      return "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300";
  }
}

function qcStatusClass(status?: PosGrnLineQcStatus) {
  switch (status) {
    case "passed":
      return "bg-green-500/10 text-green-600 border-green-500/20";
    case "failed":
      return "bg-rose-500/10 text-rose-600 border-rose-500/20";
    default:
      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
  }
}

function ingredientLabel(line: PosGrnLine) {
  const ing = line.ingredient;
  if (typeof ing === "object" && ing) {
    const u = ing.unit ? ` (${ing.unit})` : "";
    return `${ing.name || "Ingredient"}${u}`;
  }
  return "Ingredient";
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromDateInputValue(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  return new Date(`${t}T12:00:00.000Z`).toISOString();
}

type LineDraft = {
  _id: string;
  receivedQty: string;
  rejectedQty: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  productionDate: string;
  supplierBatchRef: string;
  rejectionReason: string;
  qcStatus: PosGrnLineQcStatus;
};

function linesToDraft(lines: PosGrnLine[]): LineDraft[] {
  return lines.map((l) => ({
    _id: String(l._id),
    receivedQty: String(l.receivedQty ?? 0),
    rejectedQty: String(l.rejectedQty ?? 0),
    unitCost: String(l.unitCost ?? 0),
    lotNumber: l.lotNumber ?? "",
    expiryDate: toDateInputValue(l.expiryDate ?? undefined),
    productionDate: toDateInputValue(l.productionDate ?? undefined),
    supplierBatchRef: l.supplierBatchRef ?? "",
    rejectionReason: l.rejectionReason ?? "",
    qcStatus: l.qcStatus ?? "pending",
  }));
}

export function GoodsReceiptNoteDetailClient({ grnId }: { grnId: string }) {
  const id = grnId;
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [supplierDeliveryNoteRef, setSupplierDeliveryNoteRef] = useState("");
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const grnQuery = useQuery({
    queryKey: [...GOODS_RECEIPT_NOTES_QUERY_KEY, id],
    queryFn: () => posFetchGoodsReceiptNote(id),
    enabled: Boolean(id),
  });

  const grn = grnQuery.data;

  useEffect(() => {
    if (!grn) return;
    setNotes(grn.notes ?? "");
    setSupplierDeliveryNoteRef(grn.supplierDeliveryNoteRef ?? "");
    setLineDrafts(linesToDraft(grn.lines || []));
  }, [grn]);

  const isDraft = grn?.status === "draft";

  const poId =
    typeof grn?.purchaseOrder === "string"
      ? grn.purchaseOrder
      : grn?.purchaseOrder && typeof grn.purchaseOrder === "object"
        ? String(grn.purchaseOrder._id || "")
        : "";

  const updateMutation = useMutation({
    mutationFn: () => {
      const lines = lineDrafts.map((d) => ({
        _id: d._id,
        receivedQty: Number(d.receivedQty) || 0,
        rejectedQty: Number(d.rejectedQty) || 0,
        unitCost: Number(d.unitCost) || 0,
        lotNumber: d.lotNumber.trim() || "",
        expiryDate: fromDateInputValue(d.expiryDate),
        productionDate: fromDateInputValue(d.productionDate),
        supplierBatchRef: d.supplierBatchRef.trim() || "",
        rejectionReason: d.rejectionReason.trim() || "",
        qcStatus: d.qcStatus,
      }));
      return posUpdateGoodsReceiptNote(id, {
        notes: notes.trim(),
        supplierDeliveryNoteRef: supplierDeliveryNoteRef.trim(),
        lines,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GOODS_RECEIPT_NOTES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [...GOODS_RECEIPT_NOTES_QUERY_KEY, id] });
      toast.success("GRN saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save GRN."),
  });

  const qcMutation = useMutation({
    mutationFn: (args: { status: "qc_pending" | "qc_failed"; reason?: string }) =>
      posTransitionGoodsReceiptNoteQc(id, {
        status: args.status,
        reason: args.reason,
        lineStatuses: lineDrafts.map((d) => ({ lineId: d._id, qcStatus: d.qcStatus })),
      }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: GOODS_RECEIPT_NOTES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [...GOODS_RECEIPT_NOTES_QUERY_KEY, id] });
      toast.success(`GRN moved to ${vars.status.replace("_", " ")}.`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to transition GRN."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => posConfirmGoodsReceiptNote(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GOODS_RECEIPT_NOTES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [...GOODS_RECEIPT_NOTES_QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: ["procurement-pos"] });
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_QUERY_KEY });
      invalidateInventoryHubQueries(queryClient);
      toast.success("GRN confirmed — stock updated.");
      setConfirmOpen(false);
      void grnQuery.refetch();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to confirm GRN."),
  });

  const supplierName = useMemo(() => {
    if (!grn) return "—";
    return typeof grn.supplier === "object" && grn.supplier?.name ? grn.supplier.name : "—";
  }, [grn]);

  const locationName = useMemo(() => {
    if (!grn) return "—";
    return typeof grn.location === "object" && grn.location?.name ? grn.location.name : "—";
  }, [grn]);

  if (!id) {
    return <div className="p-6 text-muted-foreground text-sm">Invalid GRN id.</div>;
  }

  if (grnQuery.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (grnQuery.isError || !grn) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive text-sm">Could not load this goods receipt note.</p>
        <Button variant="outline" asChild>
          <Link href="/dashboard/goods-receipt-notes">Back to list</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-2" asChild>
            <Link href="/dashboard/goods-receipt-notes">
              <ArrowLeft className="h-4 w-4" />
              All GRNs
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono font-semibold text-2xl uppercase tracking-tight md:text-3xl">
              GRN-{grn._id.slice(-8)}
            </h1>
            <Badge variant="outline" className={grnStatusClass(grn.status)}>
              {grn.status}
            </Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {isDraft
              ? "Adjust received quantities, costs, and lot data, then confirm to post inventory."
              : "This receipt is finalized. Line values are read-only."}
          </p>
        </div>
        {isDraft || grn.status === "qc_pending" ? (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <Button variant="outline" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save draft
              </Button>
            ) : null}
            {grn.status !== "qc_failed" ? (
              <Button
                variant="outline"
                disabled={qcMutation.isPending}
                onClick={() => qcMutation.mutate({ status: "qc_pending" })}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Send to QC
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
              disabled={qcMutation.isPending}
              onClick={() => qcMutation.mutate({ status: "qc_failed", reason: "Operator flagged failure" })}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              Fail QC
            </Button>
            <Button onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirm receipt
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Shipment</CardTitle>
            <CardDescription>Supplier and location for this receipt.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Truck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-[10px] text-muted-foreground uppercase">Supplier</p>
                <p className="font-medium">{supplierName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-[10px] text-muted-foreground uppercase">Location</p>
                <p className="font-medium">{locationName}</p>
              </div>
            </div>
            {poId ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:col-span-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Purchase order</span>
                <Link
                  href="/dashboard/purchase-orders"
                  className="font-medium font-mono text-primary text-xs underline-offset-4 hover:underline"
                >
                  PO-{poId.slice(-6)}
                </Link>
                <Link
                  href={`/dashboard/goods-receipt-notes?purchaseOrderId=${encodeURIComponent(poId)}`}
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                >
                  Other GRNs for this PO
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Header</CardTitle>
            <CardDescription>Notes and supplier paperwork.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grn-supplier-dn">Supplier delivery note ref.</Label>
              <Input
                id="grn-supplier-dn"
                value={supplierDeliveryNoteRef}
                onChange={(e) => setSupplierDeliveryNoteRef(e.target.value)}
                disabled={!isDraft}
                placeholder="e.g. DN-10492"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-notes">Notes</Label>
              <Textarea
                id="grn-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isDraft}
                rows={4}
                placeholder="Optional notes for this receipt"
              />
            </div>
            {grn.createdAt ? (
              <p className="text-muted-foreground text-xs">Created {format(new Date(grn.createdAt), "PPpp")}</p>
            ) : null}
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs">
              <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
              {grn.journalEntry ? (
                <>
                  <Badge variant="outline" className="border-green-500/30 text-green-700 dark:text-green-400">
                    GL posted
                  </Badge>
                  <span className="text-muted-foreground">
                    {grn.postedAt ? format(new Date(grn.postedAt), "PPpp") : "—"}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Not posted to GL</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
          <CardDescription>Ordered vs received quantities. Confirm applies stock for accepted lines.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[min(560px,60vh)] md:h-[min(640px,65vh)]">
            <div className="min-w-[720px] space-y-0">
              {grn.lines?.map((line, idx) => {
                const draft = lineDrafts.find((d) => d._id === String(line._id));
                const d = draft ?? linesToDraft([line])[0];
                const ordered = Number(line.orderedQty) || 0;
                const unit = Number(d.unitCost) || 0;
                const lineTotal = (Number(d.receivedQty) || 0) * unit;
                return (
                  <div key={line._id}>
                    {idx > 0 ? <Separator /> : null}
                    <div className="grid gap-4 p-4 md:grid-cols-12 md:items-end">
                      <div className="md:col-span-4">
                        <p className="font-bold text-[10px] text-muted-foreground uppercase">Item</p>
                        <p className="font-medium">{ingredientLabel(line)}</p>
                        <p className="text-muted-foreground text-xs">Ordered: {ordered}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 md:col-span-8 lg:grid-cols-6">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Received</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={d.receivedQty}
                            disabled={!isDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineDrafts((prev) =>
                                prev.map((x) => (x._id === d._id ? { ...x, receivedQty: v } : x)),
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Rejected</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={d.rejectedQty}
                            disabled={!isDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineDrafts((prev) =>
                                prev.map((x) => (x._id === d._id ? { ...x, rejectedQty: v } : x)),
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Unit cost</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={d.unitCost}
                            disabled={!isDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineDrafts((prev) => prev.map((x) => (x._id === d._id ? { ...x, unitCost: v } : x)));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Lot</Label>
                          <Input
                            value={d.lotNumber}
                            disabled={!isDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineDrafts((prev) => prev.map((x) => (x._id === d._id ? { ...x, lotNumber: v } : x)));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Expiry</Label>
                          <DatePicker
                            value={d.expiryDate ?? ""}
                            onValueChange={(v) => {
                              setLineDrafts((prev) => prev.map((x) => (x._id === d._id ? { ...x, expiryDate: v } : x)));
                            }}
                            disabled={!isDraft}
                            placeholder="—"
                            className="h-9 w-full min-w-0 justify-start text-xs font-normal"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Line total</Label>
                          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
                            {formatCurrency(lineTotal)}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 md:col-span-12 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Production</Label>
                          <DatePicker
                            value={d.productionDate ?? ""}
                            onValueChange={(v) => {
                              setLineDrafts((prev) =>
                                prev.map((x) => (x._id === d._id ? { ...x, productionDate: v } : x)),
                              );
                            }}
                            disabled={!isDraft}
                            placeholder="—"
                            className="h-9 w-full min-w-0 justify-start text-xs font-normal"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Supplier batch</Label>
                          <Input
                            value={d.supplierBatchRef}
                            disabled={!isDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineDrafts((prev) =>
                                prev.map((x) => (x._id === d._id ? { ...x, supplierBatchRef: v } : x)),
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Rejection reason</Label>
                          <Input
                            value={d.rejectionReason}
                            disabled={!isDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineDrafts((prev) =>
                                prev.map((x) => (x._id === d._id ? { ...x, rejectionReason: v } : x)),
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">QC</Label>
                          <div className="flex items-center gap-2">
                            <Select
                              value={d.qcStatus}
                              disabled={grn.status === "cancelled" || grn.status === "confirmed"}
                              onValueChange={(v) => {
                                setLineDrafts((prev) =>
                                  prev.map((x) => (x._id === d._id ? { ...x, qcStatus: v as PosGrnLineQcStatus } : x)),
                                );
                              }}
                            >
                              <SelectTrigger className="h-9 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="passed">Passed</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                              </SelectContent>
                            </Select>
                            <Badge variant="outline" className={qcStatusClass(d.qcStatus)}>
                              {d.qcStatus}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm goods receipt?</DialogTitle>
            <DialogDescription>
              This will post stock for accepted quantities, update the purchase order, and cannot be undone from this
              screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
