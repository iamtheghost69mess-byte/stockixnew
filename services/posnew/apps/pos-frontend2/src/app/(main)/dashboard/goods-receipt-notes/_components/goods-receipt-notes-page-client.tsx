"use client";

import { Suspense, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardList, Info, Loader2, MapPin, Plus, ShoppingCart, Truck } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INGREDIENTS_QUERY_KEY, invalidateInventoryHubQueries } from "@/lib/inventory-api";
import {
  GOODS_RECEIPT_NOTES_QUERY_KEY,
  type PosGoodsReceiptNote,
  type PosGrnStatus,
  posCreateGoodsReceiptNote,
  posFetchGoodsReceiptNotes,
} from "@/lib/pos-grn-api";
import { posCan } from "@/lib/pos-permissions";
import { posFetchPurchaseOrders, posPurchaseOrderRowsFromListQuery } from "@/lib/pos-procurement-api";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function grnStatusClass(status: PosGrnStatus) {
  switch (status) {
    case "confirmed":
      return "bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400";
    case "cancelled":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
  }
}

function GoodsReceiptNotesContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canApRead = posCan(permissions, "backoffice.accounting.ap.read");
  const poFromUrl = searchParams.get("purchaseOrderId")?.trim() || "";
  const statusParam = searchParams.get("status")?.trim() as PosGrnStatus | "" | undefined;
  const statusFilter: PosGrnStatus | "all" =
    statusParam === "draft" || statusParam === "confirmed" || statusParam === "cancelled" ? statusParam : "all";

  const [newGrnOpen, setNewGrnOpen] = useState(false);
  const [selectPoId, setSelectPoId] = useState<string>("__none__");
  const [manualPoId, setManualPoId] = useState("");

  const listQuery = useQuery({
    queryKey: [...GOODS_RECEIPT_NOTES_QUERY_KEY, { status: statusFilter, purchaseOrderId: poFromUrl || null }] as const,
    queryFn: () =>
      posFetchGoodsReceiptNotes({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(poFromUrl ? { purchaseOrderId: poFromUrl } : {}),
      }),
  });

  const posQuery = useQuery({
    queryKey: ["procurement-pos"],
    queryFn: posFetchPurchaseOrders,
    enabled: newGrnOpen,
  });

  const eligiblePurchaseOrders = useMemo(() => {
    const rows = posPurchaseOrderRowsFromListQuery(posQuery.data);
    return rows
      .filter((p) => p.status === "confirmed" || p.status === "partial")
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posQuery.data]);

  const createGrnMutation = useMutation({
    mutationFn: (purchaseOrderId: string) => posCreateGoodsReceiptNote(purchaseOrderId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: GOODS_RECEIPT_NOTES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["procurement-pos"] });
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_QUERY_KEY });
      invalidateInventoryHubQueries(queryClient);
      const grnId = res.data?._id;
      setNewGrnOpen(false);
      setSelectPoId("__none__");
      setManualPoId("");
      toast.success("Draft GRN created.");
      if (grnId) router.push(`/dashboard/goods-receipt-notes/${grnId}`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not create GRN."),
  });

  const rows = listQuery.data ?? [];

  const statusSelectValue = statusFilter;

  function pushListQuery(next: { status?: PosGrnStatus | "all"; purchaseOrderId?: string | null }) {
    const sp = new URLSearchParams();
    const po = next.purchaseOrderId !== undefined ? next.purchaseOrderId : poFromUrl;
    const st = next.status !== undefined ? next.status : statusFilter;
    if (po) sp.set("purchaseOrderId", po);
    if (st !== "all") sp.set("status", st);
    const q = sp.toString();
    router.push(q ? `/dashboard/goods-receipt-notes?${q}` : "/dashboard/goods-receipt-notes");
  }

  function submitNewGrn() {
    const pasted = manualPoId.trim();
    let purchaseOrderId = "";
    if (OBJECT_ID_RE.test(pasted)) purchaseOrderId = pasted;
    else if (selectPoId !== "__none__" && OBJECT_ID_RE.test(selectPoId)) purchaseOrderId = selectPoId;
    if (!purchaseOrderId) {
      toast.error(
        "Choose an eligible purchase order from the list, or paste a valid internal PO ID from the purchase order screen.",
      );
      return;
    }
    createGrnMutation.mutate(purchaseOrderId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Goods receipt notes</h1>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Draft receipts from purchase orders, adjust quantities and lots, then confirm to post stock. Create a draft
            from{" "}
            <Link
              href="/dashboard/purchase-orders"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Purchase orders
            </Link>{" "}
            (receive), or use <span className="font-medium text-foreground">New from PO</span> below.
            {canApRead ? (
              <>
                {" "}
                After receipt, create{" "}
                <Link
                  href="/dashboard/accounting/vendor-bills"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  vendor bills (AP)
                </Link>{" "}
                from the same purchase order.
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="default"
            className="shrink-0"
            onClick={() => {
              setSelectPoId("__none__");
              setManualPoId("");
              setNewGrnOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New from PO
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Status</span>
            <Select
              value={statusSelectValue}
              onValueChange={(v) => {
                const st = v as PosGrnStatus | "all";
                pushListQuery({ status: st });
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {poFromUrl ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm">
          Filtered by purchase order <span className="font-mono text-xs">{poFromUrl.slice(-8)}</span>.{" "}
          <Link href="/dashboard/goods-receipt-notes" className="font-medium underline-offset-4 hover:underline">
            Clear filter
          </Link>
        </div>
      ) : null}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GRN</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <ClipboardList className="h-8 w-8 opacity-40" />
                    <span>No goods receipt notes match this filter.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => <GrnTableRow key={row._id} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={newGrnOpen} onOpenChange={setNewGrnOpen}>
        <DialogContent className="max-w-lg gap-0 p-0 sm:max-w-lg">
          <div className="space-y-1 border-b bg-muted/40 px-6 py-5">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-lg">Start a draft goods receipt</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
                Create a draft GRN linked to a purchase order. You can record quantities, lots, and delivery details
                before confirming stock.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 px-6 py-5">
            <Alert className="border-border/80 bg-muted/25">
              <Info className="text-muted-foreground" aria-hidden />
              <AlertTitle className="text-foreground">Eligible purchase orders</AlertTitle>
              <AlertDescription className="mt-1.5 space-y-2 leading-relaxed">
                <p>
                  Only orders in <span className="font-medium text-foreground">Confirmed</span> or{" "}
                  <span className="font-medium text-foreground">Partially received</span> status can start a receipt.
                  Draft or cancelled orders are hidden here.
                </p>
                <p>
                  Need to confirm an order first?{" "}
                  <Link
                    href="/dashboard/purchase-orders"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Open purchase orders
                  </Link>
                  .
                </p>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="grn-po-select" className="text-foreground">
                Purchase order
              </Label>
              <Select
                value={selectPoId}
                onValueChange={setSelectPoId}
                disabled={posQuery.isLoading || createGrnMutation.isPending}
              >
                <SelectTrigger id="grn-po-select" className="h-11">
                  <SelectValue placeholder={posQuery.isLoading ? "Loading orders…" : "Choose a purchase order"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose from the list…</SelectItem>
                  {eligiblePurchaseOrders.length === 0 && !posQuery.isLoading ? (
                    <SelectItem value="__empty__" disabled>
                      No eligible orders (confirm a PO first)
                    </SelectItem>
                  ) : (
                    eligiblePurchaseOrders.map((po) => (
                      <SelectItem key={po._id} value={po._id}>
                        PO-{po._id.slice(-6)} · {po.supplierName || "Supplier"} · {formatCurrency(po.totalAmount || 0)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Showing supplier and order total for quick identification.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="grn-manual-po-id" className="text-foreground">
                  Internal PO ID <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Use this when you have the full internal reference (for example from a colleague, an export, or your
                  purchase order detail screen)—not only the short PO label like PO-12AB3C. The value is 24 letters and
                  numbers. When a valid ID is pasted here, it takes priority over the list above.
                </p>
              </div>
              <Input
                id="grn-manual-po-id"
                className="h-10 font-mono text-sm tracking-tight"
                placeholder="e.g. 507f1f77bcf86cd799439011"
                value={manualPoId}
                onChange={(e) => setManualPoId(e.target.value)}
                disabled={createGrnMutation.isPending}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 border-t bg-muted/20 px-6 py-4 sm:justify-end">
            <Button variant="outline" onClick={() => setNewGrnOpen(false)} disabled={createGrnMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitNewGrn} disabled={createGrnMutation.isPending} className="min-w-[160px]">
              {createGrnMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create draft GRN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GrnTableRow({ row }: { row: PosGoodsReceiptNote }) {
  const supplierName = typeof row.supplier === "object" && row.supplier ? row.supplier.name : "—";
  const locationName = typeof row.location === "object" && row.location ? row.location.name : "—";
  const poRef =
    typeof row.purchaseOrder === "object" && row.purchaseOrder?.reference
      ? row.purchaseOrder.reference
      : typeof row.purchaseOrder === "object" && row.purchaseOrder?._id
        ? `PO-${String(row.purchaseOrder._id).slice(-6)}`
        : typeof row.purchaseOrder === "string"
          ? `PO-${row.purchaseOrder.slice(-6)}`
          : "—";

  return (
    <TableRow>
      <TableCell className="font-mono text-xs uppercase">GRN-{row._id.slice(-6)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-sm">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{poRef}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-sm">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          {supplierName}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          {locationName}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {row.createdAt ? format(new Date(row.createdAt), "MMM d, yyyy") : "—"}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={grnStatusClass(row.status)}>
          {row.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Link
          href={`/dashboard/goods-receipt-notes/${row._id}`}
          className="font-medium text-primary text-sm underline-offset-4 hover:underline"
        >
          View
        </Link>
      </TableCell>
    </TableRow>
  );
}

function GoodsReceiptNotesFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

export function GoodsReceiptNotesPageClient() {
  return (
    <Suspense fallback={<GoodsReceiptNotesFallback />}>
      <GoodsReceiptNotesContent />
    </Suspense>
  );
}
