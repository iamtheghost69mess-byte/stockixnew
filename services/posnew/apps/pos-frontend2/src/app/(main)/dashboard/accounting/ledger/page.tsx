"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { ArrowLeft, BookMarked, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";

import { ManualJournalDialog } from "@/app/(main)/dashboard/accounting/_components/manual-journal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { JournalEntryDoc, JournalLineDoc } from "@/lib/pos-accounting-api";
import { formatJournalEntryReference, posListJournalEntries } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const SOURCE_FILTER = [
  { value: "all", label: "All sources" },
  { value: "manual", label: "Manual" },
  { value: "order_sale", label: "Order sale" },
  { value: "order_cogs", label: "COGS" },
  { value: "order_reversal", label: "Reversal" },
  { value: "order_refund", label: "Refund" },
  { value: "ar_payment", label: "AR payment" },
  { value: "session_close", label: "Session close" },
  { value: "vendor_bill", label: "Vendor bill" },
  { value: "credit_note", label: "Credit note" },
] as const;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function lineTotals(lines: JournalLineDoc[] | undefined) {
  let debit = 0;
  let credit = 0;
  for (const l of lines || []) {
    debit += l.debit || 0;
    credit += l.credit || 0;
  }
  return { debit, credit };
}

export default function JournalLedgerPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");
  const canGlWrite = posCan(permissions, "backoffice.accounting.gl.write");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(25);
  const defaultEnd = format(new Date(), "yyyy-MM-dd");
  const defaultStart = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [sourceType, setSourceType] = useState<string>("all");
  const [memoSearch, setMemoSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const query = useMemo(
    () => ({
      page,
      limit,
      start,
      end,
      sourceType: sourceType === "all" ? undefined : sourceType,
      memo: memoSearch.trim() || undefined,
    }),
    [page, limit, start, end, sourceType, memoSearch],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "journals", query],
    queryFn: () => posListJournalEntries(query),
    enabled: canGlRead,
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need GL read permission to view entries.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting/accounts">Back to chart of accounts</Link>
        </Button>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const effectiveLimit = data?.limit ?? limit;
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
  const rangeStart = total === 0 ? 0 : (page - 1) * effectiveLimit + 1;
  const rangeEnd = Math.min(page * effectiveLimit, total);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting/accounts">
              <ArrowLeft className="mr-2 size-4" />
              Chart of accounts
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Entries</h1>
          <p className="text-muted-foreground text-sm">General ledger journal activity for your organization.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/accounting/trial-balance">
              <BookMarked className="mr-2 size-4" />
              Trial balance
            </Link>
          </Button>
          {canGlWrite ? (
            <Button type="button" onClick={() => setManualOpen(true)}>
              <Plus className="mr-2 size-4" />
              Manual journal
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" disabled>
                    <Plus className="mr-2 size-4" />
                    Manual journal
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Requires <span className="font-mono">backoffice.accounting.gl.write</span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Date range applies to entry date. Use memo search to narrow by description text.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div className="grid w-full min-w-0 gap-2">
            <Label htmlFor="jf-start">Start</Label>
            <DatePicker
              id="jf-start"
              value={start}
              onValueChange={(v) => {
                setStart(v);
                setPage(1);
              }}
            />
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label htmlFor="jf-end">End</Label>
            <DatePicker
              id="jf-end"
              value={end}
              onValueChange={(v) => {
                setEnd(v);
                setPage(1);
              }}
            />
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label>Source</Label>
            <Select
              value={sourceType}
              onValueChange={(v) => {
                setSourceType(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="jf-source" className="h-10 w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_FILTER.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <Label htmlFor="jf-memo">Memo contains</Label>
            <Input
              id="jf-memo"
              placeholder="Search description / memo…"
              value={memoSearch}
              onChange={(e) => {
                setMemoSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Entry register</CardTitle>
            <CardDescription>
              {total === 0
                ? "No rows in this result set."
                : `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString()}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="jf-page-size" className="whitespace-nowrap text-muted-foreground text-sm">
                Rows per page
              </Label>
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger id="jf-page-size" className="h-9 w-[4.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[5.5rem] text-center text-muted-foreground text-sm tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[7.5rem] pl-4">Date</TableHead>
                    <TableHead className="w-[8.5rem]">Reference</TableHead>
                    <TableHead className="w-[9rem]">Source</TableHead>
                    <TableHead className="min-w-[12rem]">Memo</TableHead>
                    <TableHead className="w-[7rem] text-right">Debits</TableHead>
                    <TableHead className="w-[7rem] text-right">Credits</TableHead>
                    <TableHead className="w-[5rem] pr-4 text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No entries match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((row: JournalEntryDoc) => {
                      const { debit, credit } = lineTotals(row.lines);
                      return (
                        <TableRow key={row._id}>
                          <TableCell className="whitespace-nowrap pl-4 text-sm tabular-nums">
                            {row.entryDate ? format(new Date(row.entryDate), "yyyy-MM-dd") : "—"}
                          </TableCell>
                          <TableCell className="font-medium font-mono text-xs tracking-tight">
                            {formatJournalEntryReference(row.entryNumber)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {row.sourceType}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[min(28rem,45vw)] truncate text-foreground/90 text-sm">
                            {row.memo || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatCurrency(debit)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatCurrency(credit)}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
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

      <ManualJournalDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}
