"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountingPeriodDoc } from "@/lib/pos-accounting-api";
import {
  posCloseAccountingPeriod,
  posFetchAccountingPeriods,
  posPostRetainedEarningsClosing,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function AccountingPeriodsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const canPeriodsWrite = posCan(permissions, "backoffice.accounting.periods.write");

  const qc = useQueryClient();
  const {
    data: periods = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "periods"],
    queryFn: posFetchAccountingPeriods,
    enabled: canRead,
  });

  const [closeDialog, setCloseDialog] = useState(false);
  const [closeYear, setCloseYear] = useState(String(new Date().getUTCFullYear()));
  const [closeMonth, setCloseMonth] = useState(String(new Date().getUTCMonth() + 1));

  const [reCloseOpen, setReCloseOpen] = useState(false);
  const [reEndDate, setReEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const closeMut = useMutation({
    mutationFn: () =>
      posCloseAccountingPeriod({
        year: Number(closeYear),
        month: Number(closeMonth),
      }),
    onSuccess: () => {
      toast.success("Period marked closed.");
      void qc.invalidateQueries({ queryKey: ["accounting", "periods"] });
      setCloseDialog(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Close period failed."),
  });

  const reMut = useMutation({
    mutationFn: () =>
      posPostRetainedEarningsClosing({
        endDate: reEndDate.trim() || undefined,
        idempotencyKey: `re-close-${reEndDate}-${Date.now()}`,
      }),
    onSuccess: (res) => {
      if (res.entry) {
        toast.success("Retained earnings closing entry posted.");
        void qc.invalidateQueries({ queryKey: ["accounting", "journals"] });
      } else {
        toast.message(res.message || "Nothing to close (no P&L balances).");
      }
      setReCloseOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Closing failed."),
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need accounting read permission to view fiscal periods.</p>
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
              Accounts
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
            <CalendarDays className="size-7" />
            Fiscal periods
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Close accounting periods to block posting into closed months. Retained earnings closing rolls P&amp;L into
            retained earnings.
          </p>
        </div>
        {canPeriodsWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCloseDialog(true)}>
              Close period
            </Button>
            <Button onClick={() => setReCloseOpen(true)}>Post retained earnings closing</Button>
          </div>
        ) : (
          <p className="max-w-sm text-muted-foreground text-sm">
            <code className="text-xs">backoffice.accounting.periods.write</code> required to close periods or post
            closing entries.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Period status</CardTitle>
          <CardDescription>Periods appear after they are first closed (server upsert). Up to 120 rows.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : periods.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No period rows yet. Use &quot;Close period&quot; to record a closed month.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p: AccountingPeriodDoc) => (
                  <TableRow key={p._id}>
                    <TableCell>{p.year}</TableCell>
                    <TableCell>{MONTHS.find((m) => m.value === p.month)?.label ?? p.month}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "closed" ? "secondary" : "default"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>{p.closedAt ? format(new Date(p.closedAt), "yyyy-MM-dd HH:mm") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close fiscal period</DialogTitle>
            <DialogDescription>
              Marks the calendar month closed. Manual journals in that month should be rejected by the server when the
              period is closed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="yr">Year</Label>
              <Input id="yr" value={closeYear} onChange={(e) => setCloseYear(e.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mo">Month (1–12)</Label>
              <Input
                id="mo"
                value={closeMonth}
                onChange={(e) => setCloseMonth(e.target.value)}
                type="number"
                min={1}
                max={12}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => closeMut.mutate()}
              disabled={closeMut.isPending || !closeYear || !closeMonth}
            >
              {closeMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Confirm close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reCloseOpen} onOpenChange={setReCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retained earnings closing</DialogTitle>
            <DialogDescription>
              Posts a closing journal for revenue and expense balances through the end date. Requires configured
              retained earnings account in GL settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="endDate">End date</Label>
            <DatePicker id="endDate" value={reEndDate} onValueChange={setReEndDate} className="w-full" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReCloseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => reMut.mutate()} disabled={reMut.isPending}>
              {reMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Post closing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
