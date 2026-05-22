"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  posDownloadSupplierStatementPdf,
  posFetchSupplierStatement,
  triggerBrowserDownload,
} from "@/lib/pos-accounting-api";
import { posFetchSuppliers } from "@/lib/pos-procurement-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function SupplierStatementPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canApRead = posCan(permissions, "backoffice.accounting.ap.read");
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState(() => format(new Date(Date.now() - 90 * 86400000), "yyyy-MM-dd"));
  const [end, setEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data: suppliersResult } = useQuery({
    queryKey: ["suppliers", "list-for-statement"],
    queryFn: posFetchSuppliers,
    enabled: canApRead,
  });
  const suppliers = suppliersResult?.data ?? [];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["accounting", "supplier-statement", supplierId, start, end],
    queryFn: () =>
      posFetchSupplierStatement({
        supplierId,
        start: start.trim() || undefined,
        end: end.trim() || undefined,
      }),
    enabled: canApRead && Boolean(supplierId),
  });

  const sortedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)),
    [suppliers],
  );

  async function onDownloadPdf() {
    if (!supplierId) return;
    setPdfBusy(true);
    try {
      const { blob, filename } = await posDownloadSupplierStatementPdf({
        supplierId,
        start: start.trim() || undefined,
        end: end.trim() || undefined,
      });
      triggerBrowserDownload(blob, filename);
      toast.success("Download started.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF download failed.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!canApRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          You need <span className="font-mono">backoffice.accounting.ap.read</span> for supplier statements.
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
            <Link href="/dashboard/accounting/vendor-bills">
              <ArrowLeft className="mr-2 size-4" />
              Vendor bills
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Supplier statement</h1>
          <p className="text-muted-foreground text-sm">Open vendor bills for one supplier.</p>
        </div>
        <Button type="button" variant="outline" disabled={!supplierId || pdfBusy} onClick={onDownloadPdf}>
          {pdfBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
          PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Optional bill-date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Supplier</Label>
            <Select value={supplierId || "__none__"} onValueChange={(v) => setSupplierId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-10 w-full min-w-0">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Select —</SelectItem>
                {sortedSuppliers.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Bill from</Label>
            <DatePicker value={start} onValueChange={setStart} className="h-10 w-full" />
          </div>
          <div className="grid gap-2">
            <Label>Bill through</Label>
            <DatePicker value={end} onValueChange={setEnd} className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>

      {!supplierId ? (
        <p className="text-muted-foreground text-sm">Select a supplier to load the statement.</p>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
      ) : data ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total open AP (selected bills)</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatCurrency(data.totalOpenAmount)}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open vendor bills</CardTitle>
              <CardDescription>{data.openBills.length} line(s).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Due amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.openBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground text-sm">
                        No open bills in range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.openBills.map((row) => (
                      <TableRow key={String(row.vendorBillId)}>
                        <TableCell className="font-mono text-xs">{row.vendorBillNumber}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.dueDate ? format(new Date(row.dueDate), "yyyy-MM-dd") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.amountDue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bill history</CardTitle>
              <CardDescription>All non-void bills in the bill-date range.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bill date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">
                        No bills in range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.bills.map((row) => (
                      <TableRow key={String(row.vendorBillId)}>
                        <TableCell className="font-mono text-xs">{row.vendorBillNumber}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.billDate ? format(new Date(row.billDate), "yyyy-MM-dd") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.amountPaid)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.amountDue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
        </>
      ) : null}
    </div>
  );
}
