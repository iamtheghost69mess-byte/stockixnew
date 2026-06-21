"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountingBudgetDoc } from "@/lib/pos-accounting-api";
import {
  posCreateAccountingBudget,
  posDeleteAccountingBudget,
  posFetchAccountingBudgets,
  posFetchAccounts,
  posUpdateAccountingBudget,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { accountingBudgetFormSchema } from "@/lib/schemas/accounting/budget";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { formatCurrency } from "@/lib/utils";
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

function accountLabel(b: AccountingBudgetDoc): { code: string; name: string } {
  const a = b.accountId;
  if (a && typeof a === "object" && "_id" in a) {
    return { code: a.code ?? "—", name: a.name ?? "—" };
  }
  return { code: "—", name: "—" };
}

export default function AccountingBudgetsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");
  const canGlWrite = posCan(permissions, "backoffice.accounting.gl.write");

  const qc = useQueryClient();
  const now = new Date();
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));

  const yearNum = Number.parseInt(filterYear, 10);
  const yearValid = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100;

  const {
    data: budgets = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "budgets", yearNum],
    queryFn: () => posFetchAccountingBudgets({ year: yearNum }),
    enabled: canGlRead && yearValid,
  });

  const sortedBudgets = useMemo(() => {
    return [...budgets].sort((a, b) => {
      if (b.fiscalYear !== a.fiscalYear) return b.fiscalYear - a.fiscalYear;
      if (b.periodMonth !== a.periodMonth) return b.periodMonth - a.periodMonth;
      const ac = accountLabel(a);
      const bc = accountLabel(b);
      return ac.code.localeCompare(bc.code);
    });
  }, [budgets]);

  const totalBudgeted = useMemo(
    () => sortedBudgets.reduce((s, b) => s + Number(b.budgetedAmount ?? 0), 0),
    [sortedBudgets],
  );

  function stepFilterYear(delta: number) {
    const y = yearNum + delta;
    if (Number.isFinite(y) && y >= 2000 && y <= 2100) setFilterYear(String(y));
  }

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountingBudgetDoc | null>(null);
  const [accountId, setAccountId] = useState("");
  const [fiscalYear, setFiscalYear] = useState(String(now.getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [budgetFieldErrors, setBudgetFieldErrors] = useState<Record<string, string>>({});

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts", "budget-form"],
    queryFn: () => posFetchAccounts({ active: "true" }),
    enabled: canGlRead && (addOpen || editTarget != null),
  });
  const accountOptions = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts]);

  const createMut = useMutation({
    mutationFn: () => {
      const y = Number.parseInt(fiscalYear, 10);
      const m = Number.parseInt(periodMonth, 10);
      const amt = Number.parseFloat(amountStr);
      return posCreateAccountingBudget({
        accountId,
        fiscalYear: y,
        periodMonth: m,
        budgetedAmount: amt,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Budget saved.");
      void qc.invalidateQueries({ queryKey: ["accounting", "budgets"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "budget-vs-actual"] });
      setAddOpen(false);
      setAccountId("");
      setFiscalYear(String(now.getFullYear()));
      setPeriodMonth(String(now.getMonth() + 1));
      setAmountStr("");
      setNotes("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save budget."),
  });

  const [deleteTarget, setDeleteTarget] = useState<AccountingBudgetDoc | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => posDeleteAccountingBudget(id),
    onSuccess: () => {
      toast.success("Budget removed.");
      void qc.invalidateQueries({ queryKey: ["accounting", "budgets"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "budget-vs-actual"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed."),
  });

  function openEdit(b: AccountingBudgetDoc) {
    setEditTarget(b);
    const accId = typeof b.accountId === "object" && "_id" in b.accountId ? b.accountId._id : String(b.accountId);
    setAccountId(accId);
    setFiscalYear(String(b.fiscalYear));
    setPeriodMonth(String(b.periodMonth));
    setAmountStr(String(b.budgetedAmount ?? 0));
    setNotes(b.notes ?? "");
  }

  function closeEdit() {
    setEditTarget(null);
    setBudgetFieldErrors({});
    setAccountId("");
    setFiscalYear(String(now.getFullYear()));
    setPeriodMonth(String(now.getMonth() + 1));
    setAmountStr("");
    setNotes("");
  }

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("No budget selected.");
      const y = Number.parseInt(fiscalYear, 10);
      const m = Number.parseInt(periodMonth, 10);
      const amt = Number.parseFloat(amountStr);
      return posUpdateAccountingBudget(editTarget._id, {
        accountId,
        fiscalYear: y,
        periodMonth: m,
        budgetedAmount: amt,
        notes: notes.trim() || "",
      });
    },
    onSuccess: () => {
      toast.success("Budget updated.");
      void qc.invalidateQueries({ queryKey: ["accounting", "budgets"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "budget-vs-actual"] });
      closeEdit();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update budget."),
  });

  function submitBudgetCreate() {
    const parsed = accountingBudgetFormSchema.safeParse({ accountId, fiscalYear, periodMonth, amountStr });
    if (!parsed.success) {
      setBudgetFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setBudgetFieldErrors({});
    createMut.mutate();
  }

  function submitBudgetEdit() {
    const parsed = accountingBudgetFormSchema.safeParse({ accountId, fiscalYear, periodMonth, amountStr });
    if (!parsed.success) {
      setBudgetFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setBudgetFieldErrors({});
    editMut.mutate();
  }

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Budgets require <span className="font-mono text-xs">backoffice.accounting.gl.read</span>.
        </p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="space-y-4 border-b pb-8">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/dashboard/accounting/accounts">
            <ArrowLeft className="mr-2 size-4" />
            Accounts
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 font-semibold text-3xl tracking-tight">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="size-6" />
              </span>
              Budgets
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
              Plan monthly amounts by GL account and fiscal year. The server enforces one budget per account per month.
              Variances appear on{" "}
              <Link
                href="/dashboard/accounting/budget-vs-actual"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Budget vs actual
              </Link>
              .
            </p>
          </div>
          {canGlWrite ? (
            <Button size="lg" className="shrink-0" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              New budget line
            </Button>
          ) : null}
        </div>
        {canGlRead && !canGlWrite ? (
          <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
            <span className="font-medium text-foreground">View only.</span> Creating or removing budgets requires{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">backoffice.accounting.gl.write</code>.
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Fiscal year</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{yearValid ? filterYear : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous year"
              disabled={!yearValid || yearNum <= 2000}
              onClick={() => stepFilterYear(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              id="filter-year"
              type="number"
              className="h-9 w-24 text-center tabular-nums"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              min={2000}
              max={2100}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next year"
              disabled={!yearValid || yearNum >= 2100}
              onClick={() => stepFilterYear(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Budget lines</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{yearValid ? sortedBudgets.length : "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Rows loaded for the selected year.</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Total budgeted ({yearValid ? filterYear : "—"})</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {yearValid && !isLoading ? formatCurrency(totalBudgeted) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Sum of all lines for this year (across months).</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Lines</CardTitle>
            <CardDescription>
              Account, period, amount, and optional notes. API:{" "}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!yearValid ? (
            <p className="text-muted-foreground text-sm">Enter a valid fiscal year between 2000 and 2100.</p>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Loading budgets…</p>
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : sortedBudgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 py-16 text-center">
              <div className="space-y-1">
                <p className="font-medium text-foreground">No budgets for {filterYear}</p>
                <p className="max-w-md text-muted-foreground text-sm">
                  Add your first line to drive the budget vs actual report, or switch year with the controls above.
                </p>
              </div>
              {canGlWrite ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 size-4" />
                  Add budget line
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Account</TableHead>
                    <TableHead className="font-semibold">Month</TableHead>
                    <TableHead className="text-right font-semibold">Budgeted</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBudgets.map((b) => {
                    const { code, name } = accountLabel(b);
                    return (
                      <TableRow key={b._id}>
                        <TableCell>
                          <span className="font-mono text-muted-foreground text-xs">{code}</span>
                          <div className="font-medium">{name}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {MONTHS.find((m) => m.value === b.periodMonth)?.label ?? b.periodMonth}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatCurrency(Number(b.budgetedAmount))}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-muted-foreground text-sm">
                          {b.notes || "—"}
                        </TableCell>
                        <TableCell>
                          {canGlWrite ? (
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" aria-label="Edit budget" onClick={() => openEdit(b)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="Delete budget"
                                onClick={() => setDeleteTarget(b)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setBudgetFieldErrors({});
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add budget line</DialogTitle>
            <DialogDescription>
              One budget per account per fiscal month. Saving duplicates returns an error from the API.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Account</Label>
              <Select
                value={accountId || "__none__"}
                onValueChange={(v) => {
                  setAccountId(v === "__none__" ? "" : v);
                  setBudgetFieldErrors((p) => ({ ...p, accountId: "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select —</SelectItem>
                  {accountOptions.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {budgetFieldErrors.accountId ? (
                <p className="text-destructive text-sm">{budgetFieldErrors.accountId}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fy">Fiscal year</Label>
                <Input
                  id="fy"
                  type="number"
                  min={2000}
                  max={2100}
                  value={fiscalYear}
                  onChange={(e) => {
                    setFiscalYear(e.target.value);
                    setBudgetFieldErrors((p) => ({ ...p, fiscalYear: "" }));
                  }}
                />
                {budgetFieldErrors.fiscalYear ? (
                  <p className="text-destructive text-sm">{budgetFieldErrors.fiscalYear}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label>Month</Label>
                <Select
                  value={periodMonth}
                  onValueChange={(v) => {
                    setPeriodMonth(v);
                    setBudgetFieldErrors((p) => ({ ...p, periodMonth: "" }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {budgetFieldErrors.periodMonth ? (
                  <p className="text-destructive text-sm">{budgetFieldErrors.periodMonth}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amt">Budgeted amount</Label>
              <Input
                id="amt"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="tabular-nums"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setBudgetFieldErrors((p) => ({ ...p, amountStr: "" }));
                }}
                placeholder="0.00"
              />
              {budgetFieldErrors.amountStr ? (
                <p className="text-destructive text-sm">{budgetFieldErrors.amountStr}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={createMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitBudgetCreate} disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setBudgetFieldErrors({});
            closeEdit();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit budget line</DialogTitle>
            <DialogDescription>
              Updates this single row. The server returns <code className="text-xs">409</code> if the fiscal month is
              closed, or if another budget already uses the same account and fiscal month.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Account</Label>
              <Select
                value={accountId || "__none__"}
                onValueChange={(v) => {
                  setAccountId(v === "__none__" ? "" : v);
                  setBudgetFieldErrors((p) => ({ ...p, accountId: "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select —</SelectItem>
                  {accountOptions.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {budgetFieldErrors.accountId ? (
                <p className="text-destructive text-sm">{budgetFieldErrors.accountId}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-fy">Fiscal year</Label>
                <Input
                  id="edit-fy"
                  type="number"
                  min={2000}
                  max={2100}
                  value={fiscalYear}
                  onChange={(e) => {
                    setFiscalYear(e.target.value);
                    setBudgetFieldErrors((p) => ({ ...p, fiscalYear: "" }));
                  }}
                />
                {budgetFieldErrors.fiscalYear ? (
                  <p className="text-destructive text-sm">{budgetFieldErrors.fiscalYear}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label>Month</Label>
                <Select
                  value={periodMonth}
                  onValueChange={(v) => {
                    setPeriodMonth(v);
                    setBudgetFieldErrors((p) => ({ ...p, periodMonth: "" }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {budgetFieldErrors.periodMonth ? (
                  <p className="text-destructive text-sm">{budgetFieldErrors.periodMonth}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-amt">Budgeted amount</Label>
              <Input
                id="edit-amt"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="tabular-nums"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setBudgetFieldErrors((p) => ({ ...p, amountStr: "" }));
                }}
                placeholder="0.00"
              />
              {budgetFieldErrors.amountStr ? (
                <p className="text-destructive text-sm">{budgetFieldErrors.amountStr}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes (optional)</Label>
              <Input id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={editMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitBudgetEdit} disabled={editMut.isPending}>
              {editMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove budget?</DialogTitle>
            <DialogDescription>
              This deletes the budget line only (not journal history).{" "}
              {deleteTarget ? (
                <>
                  {accountLabel(deleteTarget).code} ·{" "}
                  {MONTHS.find((m) => m.value === deleteTarget.periodMonth)?.label ?? deleteTarget.periodMonth}{" "}
                  {deleteTarget.fiscalYear}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget._id)}
              disabled={deleteMut.isPending || !deleteTarget}
            >
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
