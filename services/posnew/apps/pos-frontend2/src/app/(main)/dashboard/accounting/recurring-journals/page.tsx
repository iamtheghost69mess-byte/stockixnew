"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Pencil, Play, Plus, Repeat2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RecurringJournalFrequency, RecurringJournalTemplateDoc } from "@/lib/pos-accounting-api";
import {
  posCreateRecurringJournalTemplate,
  posDeleteRecurringJournalTemplate,
  posFetchAccounts,
  posFetchRecurringJournalTemplates,
  posRunRecurringJournalTemplate,
  posUpdateRecurringJournalTemplate,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import {
  buildRecurringJournalTemplateLines,
  recurringJournalSaveFormSchema,
} from "@/lib/schemas/accounting/recurring-journal";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const FREQUENCIES: { value: RecurringJournalFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function lineKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ln-${Date.now()}-${Math.random()}`;
}

type LineDraft = { key: string; accountId: string; debit: string; credit: string; memo: string };

function emptyLine(): LineDraft {
  return { key: lineKey(), accountId: "", debit: "", credit: "", memo: "" };
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultNextRun(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(d);
}

export default function RecurringJournalsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");
  const canGlWrite = posCan(permissions, "backoffice.accounting.gl.write");

  const qc = useQueryClient();
  const {
    data: templates = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "recurring-journal-templates"],
    queryFn: posFetchRecurringJournalTemplates,
    enabled: canGlRead,
  });

  const sorted = useMemo(() => {
    return [...templates].sort((a, b) => (a.memo || "").localeCompare(b.memo || ""));
  }, [templates]);

  const activeCount = useMemo(() => sorted.filter((t) => t.isActive).length, [sorted]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringJournalTemplateDoc | null>(null);
  const [memo, setMemo] = useState("");
  const [frequency, setFrequency] = useState<RecurringJournalFrequency>("monthly");
  const [nextRunLocal, setNextRunLocal] = useState(defaultNextRun);
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [journalFormErrors, setJournalFormErrors] = useState<Record<string, string>>({});

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts", "recurring-je-form"],
    queryFn: () => posFetchAccounts({ active: "true" }),
    enabled: canGlRead && formOpen,
  });
  const accountOptions = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts]);

  function openCreate() {
    setEditing(null);
    setMemo("");
    setFrequency("monthly");
    setNextRunLocal(defaultNextRun());
    setIsActive(true);
    setLines([emptyLine(), emptyLine()]);
    setFormOpen(true);
  }

  function openEdit(t: RecurringJournalTemplateDoc) {
    setEditing(t);
    setMemo(t.memo);
    setFrequency(t.frequency);
    const d = t.nextRunAt ? new Date(t.nextRunAt) : new Date();
    setNextRunLocal(toDatetimeLocalValue(d));
    setIsActive(t.isActive);
    setLines(
      (t.templateLines?.length ? t.templateLines : []).map((ln) => {
        const id =
          typeof ln.account === "object" && ln.account && "_id" in ln.account ? ln.account._id : String(ln.account);
        return {
          key: lineKey(),
          accountId: id,
          debit: ln.debit && ln.debit > 0 ? String(ln.debit) : "",
          credit: ln.credit && ln.credit > 0 ? String(ln.credit) : "",
          memo: ln.memo ?? "",
        };
      }),
    );
    if (!t.templateLines?.length) setLines([emptyLine(), emptyLine()]);
    setFormOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const templateLines = buildRecurringJournalTemplateLines(lines);
      const nextRunAt = new Date(nextRunLocal).toISOString();
      if (editing) {
        const updated = await posUpdateRecurringJournalTemplate(editing._id, {
          memo: memo.trim(),
          frequency,
          nextRunAt,
          isActive,
          templateLines,
        });
        if (!updated) throw new Error("Update failed.");
        return updated;
      }
      return posCreateRecurringJournalTemplate({
        memo: memo.trim(),
        frequency,
        nextRunAt,
        isActive,
        templateLines,
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Template updated." : "Template created.");
      void qc.invalidateQueries({ queryKey: ["accounting", "recurring-journal-templates"] });
      setJournalFormErrors({});
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  function submitRecurringJournalSave() {
    const parsed = recurringJournalSaveFormSchema.safeParse({
      memo,
      nextRunLocal,
      frequency,
      isActive,
      lines,
    });
    if (!parsed.success) {
      setJournalFormErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setJournalFormErrors({});
    saveMut.mutate();
  }

  const [deleteTarget, setDeleteTarget] = useState<RecurringJournalTemplateDoc | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => posDeleteRecurringJournalTemplate(id),
    onSuccess: () => {
      toast.success("Template deleted.");
      void qc.invalidateQueries({ queryKey: ["accounting", "recurring-journal-templates"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed."),
  });

  const [runTarget, setRunTarget] = useState<RecurringJournalTemplateDoc | null>(null);
  const runMut = useMutation({
    mutationFn: (id: string) => posRunRecurringJournalTemplate(id),
    onSuccess: (data) => {
      if (data.reused) {
        toast.info("Journal already posted for this run.");
      } else {
        toast.success(`Journal posted: ${data.entry?.entryNumber ?? data.entry?._id}`);
      }
      void qc.invalidateQueries({ queryKey: ["accounting", "recurring-journal-templates"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
      setRunTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed."),
  });

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Recurring journal templates require{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">backoffice.accounting.gl.read</code>.
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
                <Repeat2 className="size-6" />
              </span>
              Recurring journal templates
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
              Scheduled, balanced journal patterns (daily / weekly / monthly). Posting is performed by the backend
              worker queue when <code className="rounded bg-muted px-1 text-xs">nextRunAt</code> is due—not from this
              screen.
            </p>
          </div>
          {canGlWrite ? (
            <Button size="lg" className="shrink-0" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New template
            </Button>
          ) : null}
        </div>
        {canGlRead && !canGlWrite ? (
          <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
            <span className="font-medium text-foreground">View only.</span> Editing requires{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">backoffice.accounting.gl.write</code>.
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Templates</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{sorted.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Total configured for this organization.</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{activeCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Eligible for the recurring journal worker.</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>API</CardDescription>
            <CardTitle className="font-medium text-base leading-snug">/recurring-templates</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">GL read to list; GL write to create, update, or delete.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Memo, cadence, schedule, and line count. Edit to adjust lines or pause a template.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Loading templates…</p>
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 py-16 text-center">
              <p className="font-medium text-foreground">No recurring journal templates yet</p>
              <p className="max-w-md text-muted-foreground text-sm">
                Create a balanced template to automate rent, depreciation, or other repeating entries.
              </p>
              {canGlWrite ? (
                <Button onClick={openCreate}>
                  <Plus className="mr-2 size-4" />
                  Create template
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Memo</TableHead>
                    <TableHead className="font-semibold">Frequency</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Next run</TableHead>
                    <TableHead className="font-semibold">Last run</TableHead>
                    <TableHead className="text-right font-semibold">Lines</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((t) => (
                    <TableRow key={t._id}>
                      <TableCell className="max-w-[200px]">
                        <span className="font-medium">{t.memo}</span>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{t.frequency}</TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? "default" : "secondary"}>{t.isActive ? "Active" : "Paused"}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm tabular-nums">
                        {t.nextRunAt ? format(new Date(t.nextRunAt), "yyyy-MM-dd HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm tabular-nums">
                        {t.lastRunAt ? format(new Date(t.lastRunAt), "yyyy-MM-dd HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.templateLines?.length ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canGlWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Run now"
                                title="Run now"
                                disabled={!t.isActive || (t.templateLines?.length ?? 0) < 2}
                                onClick={() => setRunTarget(t)}
                              >
                                <Play className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit template"
                                onClick={() => openEdit(t)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="Delete template"
                                onClick={() => setDeleteTarget(t)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) {
            setJournalFormErrors({});
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New recurring journal template"}</DialogTitle>
            <DialogDescription>
              Lines must balance (total debits = credits). The server may adjust <strong>next run</strong> if it is in
              the past.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="rj-memo">Memo</Label>
              <Input
                id="rj-memo"
                value={memo}
                onChange={(e) => {
                  setMemo(e.target.value);
                  setJournalFormErrors((p) => ({ ...p, memo: "" }));
                }}
                disabled={saveMut.isPending}
              />
              {journalFormErrors.memo ? <p className="text-destructive text-sm">{journalFormErrors.memo}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as RecurringJournalFrequency)}
                disabled={saveMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rj-next">Next run (local)</Label>
              <Input
                id="rj-next"
                type="datetime-local"
                value={nextRunLocal}
                onChange={(e) => {
                  setNextRunLocal(e.target.value);
                  setJournalFormErrors((p) => ({ ...p, nextRunLocal: "" }));
                }}
                disabled={saveMut.isPending}
              />
              {journalFormErrors.nextRunLocal ? (
                <p className="text-destructive text-sm">{journalFormErrors.nextRunLocal}</p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Status</Label>
              <Select
                value={isActive ? "active" : "paused"}
                onValueChange={(v) => setIsActive(v === "active")}
                disabled={saveMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="grid gap-1">
                <Label>Template lines</Label>
                {journalFormErrors.lines ? <p className="text-destructive text-sm">{journalFormErrors.lines}</p> : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => {
                  setLines((rows) => [...rows, emptyLine()]);
                  setJournalFormErrors((p) => ({ ...p, lines: "" }));
                }}
              >
                <Plus className="mr-1 size-4" /> Add line
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              {lines.map((row, i) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2 border-b pb-2 last:border-0">
                  <div className="grid min-w-[200px] flex-[2] gap-1">
                    <span className="text-muted-foreground text-xs">Account</span>
                    <Select
                      value={row.accountId || "__none__"}
                      onValueChange={(v) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, accountId: v === "__none__" ? "" : v } : x)))
                      }
                      disabled={saveMut.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
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
                  </div>
                  <div className="grid w-28 gap-1">
                    <span className="text-muted-foreground text-xs">Debit</span>
                    <Input
                      inputMode="decimal"
                      value={row.debit}
                      onChange={(e) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, debit: e.target.value } : x)))
                      }
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <div className="grid w-28 gap-1">
                    <span className="text-muted-foreground text-xs">Credit</span>
                    <Input
                      inputMode="decimal"
                      value={row.credit}
                      onChange={(e) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)))
                      }
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <div className="grid min-w-[120px] flex-1 gap-1">
                    <span className="text-muted-foreground text-xs">Line memo</span>
                    <Input
                      value={row.memo}
                      onChange={(e) => setLines((r) => r.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))}
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Remove line"
                    disabled={saveMut.isPending || lines.length <= 2}
                    onClick={() => setLines((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitRecurringJournalSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : editing ? "Save changes" : "Create"}
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
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              Removes this schedule only; existing posted journals are unchanged.
              {deleteTarget ? (
                <span className="mt-2 block font-medium text-foreground">{deleteTarget.memo}</span>
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

      <Dialog
        open={Boolean(runTarget)}
        onOpenChange={(o) => {
          if (!o) setRunTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run template now?</DialogTitle>
            <DialogDescription>
              Posts the balanced template lines as a new journal entry dated today, then bumps{" "}
              <code className="rounded bg-muted px-1 text-xs">nextRunAt</code> by one period.
              {runTarget ? (
                <span className="mt-2 block space-y-1">
                  <span className="block font-medium text-foreground">{runTarget.memo}</span>
                  <span className="block text-muted-foreground text-xs">
                    {runTarget.templateLines?.length ?? 0} lines · {runTarget.frequency}
                  </span>
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunTarget(null)} disabled={runMut.isPending}>
              Cancel
            </Button>
            <Button onClick={() => runTarget && runMut.mutate(runTarget._id)} disabled={runMut.isPending || !runTarget}>
              {runMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
              Post now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
