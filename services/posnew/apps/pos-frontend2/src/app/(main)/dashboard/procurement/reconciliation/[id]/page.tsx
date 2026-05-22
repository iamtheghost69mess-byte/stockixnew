"use client";

import { useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { posCan } from "@/lib/pos-permissions";
import {
  fetchReconciliationMatch,
  overrideReconciliationMatch,
  RECONCILIATION_QUERY_KEY,
  type ReconciliationMatchRecord,
  resolveReconciliationMatch,
} from "@/lib/pos-reconciliation-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function ReconciliationDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.inventory.write");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");

  const { data: matchRes, isLoading } = useQuery({
    queryKey: [RECONCILIATION_QUERY_KEY, id],
    queryFn: () => fetchReconciliationMatch(id as string),
  });

  const match = matchRes?.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [RECONCILIATION_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [RECONCILIATION_QUERY_KEY, id] });
  };

  const overrideMutation = useMutation({
    mutationFn: () => overrideReconciliationMatch(id as string, overrideReason.trim()),
    onSuccess: () => {
      toast.success("Reconciliation manually overridden.");
      setOverrideOpen(false);
      setOverrideReason("");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to override reconciliation."),
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveReconciliationMatch(id as string, resolution.trim()),
    onSuccess: () => {
      toast.success("Reconciliation marked as resolved.");
      setResolveOpen(false);
      setResolution("");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to resolve reconciliation."),
  });

  const canActOnStatus = (m?: ReconciliationMatchRecord) => {
    if (!m) return false;
    return m.matchStatus === "pending" || m.matchStatus === "quantity_mismatch" || m.matchStatus === "price_mismatch";
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost">
          <Link href="/dashboard/procurement/reconciliation">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Reconciliation record not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Comparison Logic: Build a map of all ingredients across PO, GRN, and Bill
  const comparisonData = buildComparisonData(match);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" className="-ml-4 h-8 text-muted-foreground hover:text-foreground">
            <Link href="/dashboard/procurement/reconciliation">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to HUB
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Audit Session</h1>
            <MatchStatusBadge status={match.matchStatus} />
          </div>
          <p className="text-muted-foreground">
            PO Ref: {match.purchaseOrder.reference} | Bill: {match.vendorBill.vendorBillNumber}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/purchase-orders/${match.purchaseOrder._id}`}>View PO</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/dashboard/accounting/vendor-bills/${match.vendorBill._id}`}>View Bill</Link>
          </Button>
          {canWrite && canActOnStatus(match) ? (
            <>
              <Button
                variant="outline"
                className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                onClick={() => setOverrideOpen(true)}
                disabled={overrideMutation.isPending}
              >
                <ShieldCheck className="mr-2 h-4 w-4" /> Override
              </Button>
              <Button onClick={() => setResolveOpen(true)} disabled={resolveMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark resolved
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manually override reconciliation</DialogTitle>
            <DialogDescription>
              Accept this mismatch as-is. An audit entry will be written with your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recon-override-reason">Reason</Label>
            <Textarea
              id="recon-override-reason"
              rows={4}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Agreed credit note to be issued next cycle."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => overrideMutation.mutate()}
              disabled={overrideMutation.isPending || !overrideReason.trim()}
            >
              {overrideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark reconciliation resolved</DialogTitle>
            <DialogDescription>
              Use this when the underlying PO/GRN/Bill discrepancy has been corrected upstream.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recon-resolve-note">Resolution note (optional)</Label>
            <Textarea
              id="recon-resolve-note"
              rows={4}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="e.g. Bill reissued with correct quantities."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard
          icon={<FileText className="h-4 w-4 text-blue-500" />}
          title="Purchase Order"
          value={`$${match.purchaseOrder.total.toLocaleString()}`}
          label="Ordered Total"
          subLabel={match.purchaseOrder.status}
        />
        <StatCard
          icon={<Truck className="h-4 w-4 text-amber-500" />}
          title="Physical Receipts"
          value={match.associatedGrns?.length || 0}
          label="Confirmed GRNs"
          subLabel="Warehouse Verified"
        />
        <StatCard
          icon={<Banknote className="h-4 w-4 text-emerald-500" />}
          title="Vendor Bill"
          value={`$${match.vendorBill.total.toLocaleString()}`}
          label="Invoiced Total"
          subLabel={match.vendorBill.status}
        />
      </div>

      {match.matchStatus !== "matched" && (
        <Alert className="bg-amber-50 border-amber-200 text-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold">Discrepancy Detected</AlertTitle>
          <AlertDescription className="text-amber-700">
            {match.discrepancyNotes ||
              "Multiple mismatches found in line-item auditing. Manual review required before final payment."}
          </AlertDescription>
        </Alert>
      )}

      <Card className="border shadow-md">
        <CardHeader className="bg-muted/30 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reconciliation Audit Matrix</CardTitle>
              <CardDescription>
                Side-by-side audit of Ordered (PO), Received (GRN), and Billed (Invoice) data points.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px] border-r">Item Description</TableHead>
                <TableHead className="text-center font-bold text-blue-600 bg-blue-50/30 border-r">
                  Ordered (PO)
                </TableHead>
                <TableHead className="text-center font-bold text-amber-600 bg-amber-50/30 border-r">
                  Received (GRN)
                </TableHead>
                <TableHead colSpan={2} className="text-center font-bold text-emerald-600 bg-emerald-50/30">
                  Billed (Invoice)
                </TableHead>
              </TableRow>
              <TableRow className="bg-muted/10 h-10 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-transparent">
                <TableHead className="border-r">Ingredient Name / SKU</TableHead>
                <TableHead className="text-center border-r">Qty (PO)</TableHead>
                <TableHead className="text-center border-r">Qty (GRN)</TableHead>
                <TableHead className="text-center">Qty (Bill)</TableHead>
                <TableHead className="text-center">Price (Bill)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonData.map((row: any) => (
                <TableRow key={row.ingredientId} className="group transition-colors h-16">
                  <TableCell className="border-r align-middle py-0">
                    <div className="flex flex-col justify-center h-full">
                      <span className="font-semibold text-sm">{row.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{row.sku}</span>
                    </div>
                  </TableCell>

                  {/* PO Column */}
                  <TableCell className="text-center border-r bg-blue-50/5 align-middle font-medium tabular-nums text-sm">
                    {row.orderedQty} {row.unit}
                    <div className="text-[10px] text-muted-foreground font-normal">${row.orderedPrice} / unit</div>
                  </TableCell>

                  {/* GRN Column */}
                  <TableCell
                    className={`text-center border-r align-middle tabular-nums text-sm ${
                      row.receivedQty !== row.orderedQty
                        ? "bg-amber-50 text-amber-700 font-bold"
                        : "bg-amber-50/5 text-muted-foreground"
                    }`}
                  >
                    {row.receivedQty} {row.unit}
                    {row.receivedQty !== row.orderedQty && (
                      <div className="text-[9px] flex items-center justify-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {row.receivedQty > row.orderedQty ? "Over-receipt" : "Short-receipt"}
                      </div>
                    )}
                  </TableCell>

                  {/* Bill Qty Column */}
                  <TableCell
                    className={`text-center align-middle tabular-nums text-sm ${
                      row.billedQty !== row.receivedQty
                        ? "bg-red-50 text-destructive font-bold"
                        : "bg-emerald-50/5 text-muted-foreground"
                    }`}
                  >
                    {row.billedQty} {row.unit}
                    {row.billedQty !== row.receivedQty && (
                      <div className="text-[9px] flex items-center justify-center gap-1">
                        <AlertCircle className="h-2.5 w-2.5" /> Mismatch
                      </div>
                    )}
                  </TableCell>

                  {/* Bill Price Column */}
                  <TableCell
                    className={`text-center align-middle tabular-nums text-sm border-l ${
                      row.billedPrice !== row.orderedPrice
                        ? "bg-emerald-100/50 text-emerald-900 font-bold"
                        : "bg-emerald-50/5 text-muted-foreground"
                    }`}
                  >
                    ${row.billedPrice}
                    {row.billedPrice !== row.orderedPrice && (
                      <div className="text-[9px] font-normal flex items-center justify-center gap-1 opacity-80 uppercase tracking-tighter">
                        vs ${row.orderedPrice} PO
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              Warehouse Receipt History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {match.associatedGrns?.map((grn: any) => (
                <div key={grn._id} className="flex items-center justify-between p-3 rounded-md border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <PackageCheck className="h-4 w-4 text-green-500" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">Receipt #{grn._id.slice(-6).toUpperCase()}</span>
                      <span className="text-xs text-muted-foreground">
                        Finalized on {new Date(grn.receivedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/goods-receipt-notes/${grn._id}`}>View Details</Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="w-full lg:w-[400px]">
          <CardHeader>
            <CardTitle className="text-lg">Audit Narrative</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-4 text-sm bg-muted/10 leading-relaxed text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2 -mt-1" />
              This automated audit compares the finalized states of the Procurement Chain. Gaps between **Received** and
              **Billed** quantities usually indicate billing errors for unreceived stock. Gaps between **PO Unit Price**
              and **Bill Unit Price** indicate vendor price spikes not reflected in the agreement.
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Reconciliation Status</span>
              <span>{match.matchStatus.replace("_", " ").toUpperCase()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, label, subLabel }: any) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Badge variant="outline" className="text-[10px] font-normal px-2 bg-muted/50">
            {subLabel}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "matched":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Strictly Matched</Badge>;
    case "quantity_mismatch":
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Qty Discrepancy</Badge>;
    case "price_mismatch":
      return <Badge className="bg-destructive/5 text-destructive border-destructive/20">Price Audit Required</Badge>;
    case "overridden":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Overridden</Badge>;
    case "resolved":
      return <Badge className="bg-sky-50 text-sky-700 border-sky-200">Resolved</Badge>;
    default:
      return <Badge variant="secondary">In Review</Badge>;
  }
}

/**
 * Normalizes PO, GRN, and Bill lines into a single row map for side-by-side comparison.
 */
function buildComparisonData(match: any) {
  const map = new Map();

  // 1. Base from PO
  match.purchaseOrder.lines.forEach((line: any) => {
    const id = (line.ingredient as any)?._id || String(line.ingredient);
    map.set(id, {
      ingredientId: id,
      name: (line.ingredient as any)?.name || "Unknown Item",
      sku: (line.ingredient as any)?.sku || "N/A",
      unit: (line.ingredient as any)?.unit || "unit",
      orderedQty: line.quantityOrdered,
      orderedPrice: line.unitCost,
      receivedQty: 0,
      billedQty: 0,
      billedPrice: 0,
    });
  });

  // 2. Add GRN Receipts
  match.associatedGrns?.forEach((grn: any) => {
    grn.lines.forEach((line: any) => {
      const id = (line.ingredient as any)?._id || String(line.ingredient);
      const row = map.get(id);
      if (row) {
        row.receivedQty += line.quantityReceived;
      }
    });
  });

  // 3. Add Bill data
  match.vendorBill.lines.forEach((line: any) => {
    const id = (line.ingredient as any)?._id || String(line.ingredient);
    const row = map.get(id);
    if (row) {
      row.billedQty += line.quantity;
      row.billedPrice = line.unitPrice; // Assume last price matches bill line
    }
  });

  return Array.from(map.values());
}
