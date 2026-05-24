"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posFetchAccountLedger, posFetchAccounts } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function AccountLedgerPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const defaultEnd = format(new Date(), "yyyy-MM-dd");
  const defaultStart = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts"],
    queryFn: () => posFetchAccounts(),
  });

  const account = useMemo(() => accounts.find((a) => a._id === id), [accounts, id]);

  const { data: ledger, isLoading } = useQuery({
    queryKey: ["accounting", "ledger", id, start, end],
    queryFn: () => posFetchAccountLedger(id, { start, end }),
    enabled: Boolean(id) && canGlRead,
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view account activity.</p>
        <Button variant="link" asChild className="mt-2 px-0">
          <Link href="/dashboard/accounting/accounts">Back to chart of accounts</Link>
        </Button>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-destructive">Invalid account.</p>
      </div>
    );
  }

  const lines = ledger?.lines ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/accounts">
            <ArrowLeft className="mr-2 size-4" />
            Chart of accounts
          </Link>
        </Button>
        <h1 className="font-bold text-3xl tracking-tight">
          {account ? (
            <>
              <span className="font-mono text-lg text-muted-foreground">{account.code}</span> {account.name}
            </>
          ) : (
            "Account register"
          )}
        </h1>
        <p className="text-muted-foreground text-sm">Journal lines that hit this account (running balance).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
          <CardDescription>Filter register lines by posting date.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="start">Start</Label>
            <DatePicker id="start" value={start} onValueChange={setStart} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end">End</Label>
            <DatePicker id="end" value={end} onValueChange={setEnd} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              {lines.length} line{lines.length === 1 ? "" : "s"}
              {ledger != null ? ` · Ending balance ${formatCurrency(ledger.finalBalance)}` : null}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>JE #</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No lines in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((row) => (
                    <TableRow key={`${row.entryId}-${row.entryDate}-${row.balance}`}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.entryDate ? format(new Date(row.entryDate), "yyyy-MM-dd") : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.entryNumber ?? "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm">{row.memo ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.debit ? formatCurrency(row.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.credit ? formatCurrency(row.credit) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
