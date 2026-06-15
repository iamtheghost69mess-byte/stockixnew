"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posFetchArAging } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function ArAgingPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");
  const [asOf, setAsOf] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "ar-aging", asOf],
    queryFn: () => posFetchArAging({ asOf }),
    enabled: canArRead,
  });

  if (!canArRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          You need <span className="font-mono">backoffice.accounting.ar.read</span> for AR aging.
        </p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  const b = data?.buckets;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/invoices">
            <ArrowLeft className="mr-2 size-4" />
            Invoices
          </Link>
        </Button>
        <h1 className="font-bold text-3xl tracking-tight">AR aging</h1>
        <p className="text-muted-foreground text-sm">
          Open balances by days past due (posted / open / partial invoices).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>As of</CardTitle>
          <CardDescription>Compare due dates to this date for bucket assignment.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xs">
          <Label htmlFor="aging-asof">Date</Label>
          <DatePicker id="aging-asof" value={asOf} onValueChange={setAsOf} className="mt-2 w-full" />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
      ) : data && b ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(
              [
                ["Current", b.current],
                ["1–30", b.days1to30],
                ["31–60", b.days31to60],
                ["61–90", b.days61to90],
                ["90+", b.over90],
              ] as const
            ).map(([label, val]) => (
              <Card key={label}>
                <CardHeader className="pb-2">
                  <CardDescription className="font-bold text-xs uppercase">{label}</CardDescription>
                  <CardTitle className="text-lg tabular-nums">{formatCurrency(val)}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detail</CardTitle>
              <CardDescription>{data.invoices.length} open invoice line(s).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Days late</TableHead>
                    <TableHead className="text-right">Amount due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-16 text-center text-muted-foreground text-sm">
                        No outstanding AR for this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.invoices.map((row) => (
                      <TableRow key={String(row.invoiceId)}>
                        <TableCell className="font-mono text-sm">{row.invoiceNumber}</TableCell>
                        <TableCell className="text-sm">{row.customerName ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {row.dueDate ? format(new Date(row.dueDate), "yyyy-MM-dd") : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.daysPastDue}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(row.amountDue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">No aging data.</p>
      )}
    </div>
  );
}
