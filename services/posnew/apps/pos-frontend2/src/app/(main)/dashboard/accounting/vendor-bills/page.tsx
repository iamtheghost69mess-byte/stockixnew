"use client";

import { Suspense, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import { VendorBillFromPoDialog } from "@/app/(main)/dashboard/accounting/_components/vendor-bill-from-po-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { VendorBillDoc } from "@/lib/pos-accounting-api";
import { posFetchVendorBills } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function supplierLabel(b: VendorBillDoc): string {
  const s = b.supplier;
  if (s && typeof s === "object" && "name" in s) return s.name ?? "—";
  return "—";
}

function poRef(b: VendorBillDoc): string {
  const po = b.purchaseOrder;
  if (po && typeof po === "object" && "reference" in po && po.reference) return String(po.reference);
  if (po && typeof po === "object" && "_id" in po && po._id) return `PO-${String(po._id).slice(-6)}`;
  if (typeof po === "string") return `PO-${po.slice(-6)}`;
  return "—";
}

function VendorBillsContent() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canApRead = posCan(permissions, "backoffice.accounting.ap.read");
  const canApWrite = posCan(permissions, "backoffice.accounting.ap.write");
  const searchParams = useSearchParams();
  const poFromUrl = searchParams.get("po")?.trim() || "";

  const [status, setStatus] = useState<string>("all");
  const [fromPoOpen, setFromPoOpen] = useState(false);
  const autoOpenedFromPo = useRef(false);

  useEffect(() => {
    if (poFromUrl && canApWrite && !autoOpenedFromPo.current) {
      autoOpenedFromPo.current = true;
      setFromPoOpen(true);
    }
    if (!poFromUrl) autoOpenedFromPo.current = false;
  }, [poFromUrl, canApWrite]);

  const {
    data: bills = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "vendor-bills", status],
    queryFn: () =>
      posFetchVendorBills({
        ...(status !== "all" ? { status } : {}),
      }),
    enabled: canApRead,
  });

  if (!canApRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          You need <span className="font-mono">backoffice.accounting.ap.read</span> to view vendor bills.
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
          <h1 className="font-bold text-3xl tracking-tight">Vendor bills (AP)</h1>
          <p className="text-muted-foreground text-sm">
            Draft bills from purchase orders, post to the GL, then record payments.{" "}
            <Link href="/dashboard/purchase-orders" className="text-primary underline-offset-4 hover:underline">
              Purchase orders
            </Link>
          </p>
        </div>
        {canApWrite ? (
          <Button type="button" onClick={() => setFromPoOpen(true)}>
            <Plus className="mr-2 size-4" />
            From purchase order
          </Button>
        ) : null}
      </div>

      {poFromUrl ? (
        <p className="text-muted-foreground text-sm">
          Opened <span className="font-mono">from-po</span> flow for PO{" "}
          <span className="font-mono">{poFromUrl.slice(-8)}</span>.{" "}
          <Link href="/dashboard/accounting/vendor-bills" className="text-primary underline-offset-4 hover:underline">
            Clear query
          </Link>
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Bills</CardTitle>
            <CardDescription>Accounts payable documents linked to suppliers.</CardDescription>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
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
                  <TableHead>Bill</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground text-sm">
                      No vendor bills for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  bills.map((b) => {
                    const bal = b.total - (b.amountPaid ?? 0);
                    return (
                      <TableRow key={b._id}>
                        <TableCell className="font-mono text-sm">{b.vendorBillNumber}</TableCell>
                        <TableCell className="text-sm">{supplierLabel(b)}</TableCell>
                        <TableCell className="font-mono text-xs">{poRef(b)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(b.total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(b.amountPaid ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(bal)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="link" className="h-auto p-0" asChild>
                            <Link href={`/dashboard/accounting/vendor-bills/${b._id}`}>Open</Link>
                          </Button>
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

      <VendorBillFromPoDialog
        open={fromPoOpen}
        onOpenChange={setFromPoOpen}
        initialPurchaseOrderId={poFromUrl || null}
      />
    </div>
  );
}

function VendorBillsFallback() {
  return (
    <div className="flex justify-center p-12">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function VendorBillsPage() {
  return (
    <Suspense fallback={<VendorBillsFallback />}>
      <VendorBillsContent />
    </Suspense>
  );
}
