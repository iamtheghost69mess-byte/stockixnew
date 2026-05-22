"use client";

import { useMemo } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { BookMarked, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JournalEntryDoc, JournalLineDoc } from "@/lib/pos-accounting-api";
import { formatJournalEntryReference, posListJournalEntries } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function lineTotals(lines: JournalLineDoc[] | undefined): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const l of lines || []) {
    debit += l.debit || 0;
    credit += l.credit || 0;
  }
  return { debit, credit };
}

export function FinanceActivityTab() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const end = format(new Date(), "yyyy-MM-dd");
  const start = format(subDays(new Date(), 90), "yyyy-MM-dd");

  const query = useMemo(
    () => ({
      page: 1,
      limit: 40,
      start,
      end,
    }),
    [start, end],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["finance", "activity", "journals", query] as const,
    queryFn: () => posListJournalEntries(query),
    enabled: canGlRead,
    staleTime: 60_000,
  });

  const entries = data?.entries ?? [];

  if (!canGlRead) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Journal entries from the general ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">You need GL read permission to view entries.</p>
          <Button variant="link" asChild className="mt-2 h-auto px-0">
            <Link href="/dashboard/accounting/ledger">Open ledger</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Recent journals</CardTitle>
            <CardDescription>Last 90 days · newest activity first (up to 40 rows).</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/accounting/ledger">
              <BookMarked className="mr-2 size-4" />
              Full ledger
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[7.5rem]">Date</TableHead>
                    <TableHead className="w-[8.5rem]">Reference</TableHead>
                    <TableHead className="w-[9rem]">Source</TableHead>
                    <TableHead>Memo</TableHead>
                    <TableHead className="w-[6rem] text-right">Debits</TableHead>
                    <TableHead className="w-[6rem] text-right">Credits</TableHead>
                    <TableHead className="w-[4rem] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground text-sm">
                        No journal entries in this window.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((row: JournalEntryDoc) => {
                      const { debit, credit } = lineTotals(row.lines);
                      return (
                        <TableRow key={row._id}>
                          <TableCell className="whitespace-nowrap text-sm tabular-nums">
                            {row.entryDate ? format(new Date(row.entryDate), "yyyy-MM-dd") : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-medium">
                            {formatJournalEntryReference(row.entryNumber)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {row.sourceType}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[min(20rem,50vw)] truncate text-sm">{row.memo || "—"}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatCurrency(debit)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatCurrency(credit)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/dashboard/accounting/journal/${row._id}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger drilldown</CardTitle>
          <CardDescription>Browse accounts and per-account activity in accounting.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/dashboard/accounting/accounts">Chart of accounts</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/accounting/trial-balance">Trial balance</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
