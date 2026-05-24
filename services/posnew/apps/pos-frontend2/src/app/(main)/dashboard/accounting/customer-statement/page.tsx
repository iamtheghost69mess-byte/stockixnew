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
  posDownloadCustomerStatementPdf,
  posFetchCustomerStatement,
  triggerBrowserDownload,
} from "@/lib/pos-accounting-api";
import { posListCustomers } from "@/lib/pos-customer-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function CustomerStatementPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");
  const [customerId, setCustomerId] = useState("");
  const [start, setStart] = useState(() => format(new Date(Date.now() - 90 * 86400000), "yyyy-MM-dd"));
  const [end, setEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "list-for-statement"],
    queryFn: posListCustomers,
    enabled: canArRead,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["accounting", "customer-statement", customerId, start, end],
    queryFn: () =>
      posFetchCustomerStatement({
        customerId,
        start: start.trim() || undefined,
        end: end.trim() || undefined,
      }),
    enabled: canArRead && Boolean(customerId),
  });

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  async function onDownloadPdf() {
    if (!customerId) return;
    setPdfBusy(true);
    try {
      const { blob, filename } = await posDownloadCustomerStatementPdf({
        customerId,
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

  if (!canArRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          You need <span className="font-mono">backoffice.accounting.ar.read</span> for customer statements.
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
            <Link href="/dashboard/accounting/ar-aging">
              <ArrowLeft className="mr-2 size-4" />
              AR aging
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Customer statement</h1>
          <p className="text-muted-foreground text-sm">Open invoices and AR balances for one customer.</p>
        </div>
        <Button type="button" variant="outline" disabled={!customerId || pdfBusy} onClick={onDownloadPdf}>
          {pdfBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
          PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Optional issue-date range for invoice history.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Customer</Label>
            <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-10 w-full min-w-0">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Select —</SelectItem>
                {sortedCustomers.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Issue from</Label>
            <DatePicker value={start} onValueChange={setStart} className="h-10 w-full" />
          </div>
          <div className="grid gap-2">
            <Label>Issue through</Label>
            <DatePicker value={end} onValueChange={setEnd} className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>

      {!customerId ? (
        <p className="text-muted-foreground text-sm">Select a customer to load the statement.</p>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>AR balance</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatCurrency(data.customer.arBalance)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unapplied credit</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatCurrency(data.customer.unappliedCredit)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total open invoices</CardDescription>
                <CardTitle className="text-lg tabular-nums">{formatCurrency(data.totalOpenAmount)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Open invoices</CardTitle>
              <CardDescription>{data.openInvoices.length} line(s).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Due amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.openInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground text-sm">
                        No open invoices in range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.openInvoices.map((row) => (
                      <TableRow key={String(row.invoiceId)}>
                        <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
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
              <CardTitle>Invoice history</CardTitle>
              <CardDescription>All non-void invoices in the selected issue-date range.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">
                        No invoices in range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.invoices.map((row) => (
                      <TableRow key={String(row.invoiceId)}>
                        <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.issueDate ? format(new Date(row.issueDate), "yyyy-MM-dd") : "—"}</TableCell>
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
