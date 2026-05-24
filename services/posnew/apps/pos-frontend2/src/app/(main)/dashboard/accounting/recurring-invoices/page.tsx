"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Pencil, Play, Plus, Receipt, Trash2 } from "lucide-react";
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
import type { RecurringInvoiceFrequency, RecurringInvoiceTemplateDoc } from "@/lib/pos-accounting-api";
import {
  posCreateRecurringInvoiceTemplate,
  posDeleteRecurringInvoiceTemplate,
  posFetchRecurringInvoiceTemplates,
  posPreviewRecurringInvoiceTemplate,
  posRunRecurringInvoiceTemplate,
  posUpdateRecurringInvoiceTemplate,
} from "@/lib/pos-accounting-api";
import { posListCustomers } from "@/lib/pos-customer-api";
import { posCan } from "@/lib/pos-permissions";
import {
  buildRecurringInvoiceTemplateLines,
  recurringInvoiceSaveFormSchema,
} from "@/lib/schemas/accounting/recurring-invoice";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const FREQUENCIES: { value: RecurringInvoiceFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const TIMEZONE_OPTIONS = ["UTC", "Asia/Beirut", "Europe/London", "America/New_York", "Asia/Dubai"] as const;

function lineKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ln-${Date.now()}-${Math.random()}`;
}

type LineDraft = { key: string; description: string; quantity: string; unitPrice: string; taxCode: string };

function emptyLine(): LineDraft {
  return { key: lineKey(), description: "", quantity: "1", unitPrice: "", taxCode: "" };
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultNextIssue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(d);
}

function customerLabel(c: RecurringInvoiceTemplateDoc["customer"]): string {
  if (c && typeof c === "object" && "name" in c && c.name) return c.name;
  return "—";
}

function customerIdFromTemplate(t: RecurringInvoiceTemplateDoc): string {
  const c = t.customer;
  if (c && typeof c === "object" && "_id" in c && c._id) return String(c._id);
  return String(c ?? "");
}

function templateSubtotal(t: RecurringInvoiceTemplateDoc): number {
  const lines = t.templateLines ?? [];
  return lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
}

function isBillableCustomer(customer: { email?: string; vatNumber?: string; isBillingCustomer?: boolean } | null | undefined): boolean {
  if (!customer) return false;
  const hasBillingIdentity = Boolean(customer.email?.trim() || customer.vatNumber?.trim());
  const billableFlagOk = customer.isBillingCustomer !== false;
  return hasBillingIdentity && billableFlagOk;
}

function formatIssueWindow(template: RecurringInvoiceTemplateDoc): string {
  const start = template.startAt ? format(new Date(template.startAt), "yyyy-MM-dd") : "immediate";
  const end = template.endAt ? format(new Date(template.endAt), "yyyy-MM-dd") : "no end";
  return `${start} -> ${end}`;
}

function computeNextIssuePreview(template: {
  frequency: RecurringInvoiceFrequency;
  nextIssueAt: string;
  endAt?: string | null;
}): string[] {
  const first = new Date(template.nextIssueAt);
  if (Number.isNaN(first.getTime())) return [];
  const values: string[] = [];
  let cursor = first;
  for (let i = 0; i < 3; i += 1) {
    if (template.endAt && cursor > new Date(template.endAt)) break;
    values.push(format(cursor, "yyyy-MM-dd HH:mm"));
    const next = new Date(cursor);
    if (template.frequency === "daily") next.setDate(next.getDate() + 1);
    else if (template.frequency === "weekly") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    cursor = next;
  }
  return values;
}

function parseLines(lines: LineDraft[]) {
  const parsed = lines
    .map((l) => ({
      description: l.description.trim(),
      quantity: Number.parseFloat(l.quantity),
      unitPrice: Number.parseFloat(l.unitPrice),
      taxCode: l.taxCode.trim() || undefined,
    }))
    .filter((l) => l.description);

  if (parsed.length === 0) throw new Error("Add at least one line with a description.");
  for (const l of parsed) {
    if (!Number.isFinite(l.quantity) || l.quantity < 0) throw new Error("Each line needs a valid quantity (≥ 0).");
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) throw new Error("Each line needs a valid unit price (≥ 0).");
  }
  return parsed.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    taxCode: l.taxCode ?? null,
  }));
}

export default function RecurringInvoicesPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");
  const canArWrite = posCan(permissions, "backoffice.accounting.ar.write");

  const qc = useQueryClient();
  const {
    data: templates = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "recurring-invoice-templates"],
    queryFn: posFetchRecurringInvoiceTemplates,
    enabled: canArRead,
  });

  const sorted = useMemo(
    () => [...templates].sort((a, b) => customerLabel(a.customer).localeCompare(customerLabel(b.customer))),
    [templates],
  );
  const [logTemplateId, setLogTemplateId] = useState("");
  const activeCount = useMemo(() => sorted.filter((t) => t.isActive).length, [sorted]);
  const selectedLogTemplate = useMemo(
    () => sorted.find((template) => template._id === logTemplateId) ?? sorted[0] ?? null,
    [logTemplateId, sorted],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoiceTemplateDoc | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [frequency, setFrequency] = useState<RecurringInvoiceFrequency>("monthly");
  const [startIssueLocal, setStartIssueLocal] = useState("");
  const [nextIssueLocal, setNextIssueLocal] = useState(defaultNextIssue);
  const [endIssueLocal, setEndIssueLocal] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [dueDays, setDueDays] = useState("14");
  const [isActive, setIsActive] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [invoiceFormErrors, setInvoiceFormErrors] = useState<Record<string, string>>({});

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "recurring-inv-form"],
    queryFn: posListCustomers,
    enabled: canArRead && formOpen,
  });
  const customerOptions = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const billableCustomerOptions = useMemo(
    () => customerOptions.filter((customer) => isBillableCustomer(customer)),
    [customerOptions],
  );

  function openCreate() {
    setEditing(null);
    setCustomerId("");
    setFrequency("monthly");
    setStartIssueLocal("");
    setNextIssueLocal(defaultNextIssue());
    setEndIssueLocal("");
    setTimezone("UTC");
    setDueDays("14");
    setIsActive(true);
    setCurrency("USD");
    setNotes("");
    setLines([emptyLine()]);
    setFormOpen(true);
  }

  function openEdit(t: RecurringInvoiceTemplateDoc) {
    setEditing(t);
    setCustomerId(customerIdFromTemplate(t));
    setFrequency(t.frequency);
    setStartIssueLocal(t.startAt ? toDatetimeLocalValue(new Date(t.startAt)) : "");
    setNextIssueLocal(t.nextIssueAt ? toDatetimeLocalValue(new Date(t.nextIssueAt)) : defaultNextIssue());
    setEndIssueLocal(t.endAt ? toDatetimeLocalValue(new Date(t.endAt)) : "");
    setTimezone((t.timezone ?? "UTC").trim() || "UTC");
    setDueDays(String(t.dueDays ?? 14));
    setIsActive(t.isActive);
    setCurrency((t.currency ?? "USD").toUpperCase());
    setNotes(t.notes ?? "");
    const tls = t.templateLines?.length ? t.templateLines : [];
    setLines(
      tls.map((ln) => ({
        key: lineKey(),
        description: ln.description ?? "",
        quantity: String(ln.quantity ?? 1),
        unitPrice: ln.unitPrice != null ? String(ln.unitPrice) : "",
        taxCode: ln.taxCode ? String(ln.taxCode) : "",
      })),
    );
    if (tls.length === 0) setLines([emptyLine()]);
    setFormOpen(true);
  }

  const previewSubtotal = useMemo(() => {
    try {
      const p = parseLines(lines);
      return p.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    } catch {
      return null;
    }
  }, [lines]);
  const nextRunPreviewLocal = useMemo(() => {
    const nextIssueDate = new Date(nextIssueLocal);
    if (Number.isNaN(nextIssueDate.getTime())) return [];
    const endIssueDate = endIssueLocal ? new Date(endIssueLocal) : null;
    return computeNextIssuePreview({
      frequency,
      nextIssueAt: nextIssueDate.toISOString(),
      endAt: endIssueDate && !Number.isNaN(endIssueDate.getTime()) ? endIssueDate.toISOString() : null,
    });
  }, [endIssueLocal, frequency, nextIssueLocal]);
  const previewTemplateLines = useMemo(() => {
    try {
      return buildRecurringInvoiceTemplateLines(lines);
    } catch {
      return [];
    }
  }, [lines]);
  const previewRequestReady = useMemo(() => {
    if (!formOpen || !customerId) return false;
    const issueDate = new Date(nextIssueLocal);
    if (Number.isNaN(issueDate.getTime())) return false;
    const parsedDueDays = Number.parseInt(dueDays, 10);
    if (!Number.isFinite(parsedDueDays) || parsedDueDays < 1 || parsedDueDays > 365) return false;
    return previewTemplateLines.length > 0;
  }, [customerId, dueDays, formOpen, nextIssueLocal, previewTemplateLines.length]);
  const previewQuery = useQuery({
    queryKey: [
      "accounting",
      "recurring-invoice-preview",
      customerId,
      frequency,
      startIssueLocal,
      endIssueLocal,
      nextIssueLocal,
      dueDays,
      timezone,
      currency,
      previewTemplateLines,
    ],
    enabled: previewRequestReady,
    queryFn: () =>
      posPreviewRecurringInvoiceTemplate({
        customer: customerId,
        frequency,
        startAt: startIssueLocal ? new Date(startIssueLocal).toISOString() : null,
        endAt: endIssueLocal ? new Date(endIssueLocal).toISOString() : null,
        nextIssueAt: new Date(nextIssueLocal).toISOString(),
        dueDays: Number.parseInt(dueDays, 10),
        timezone: timezone.trim() || "UTC",
        currency: currency.trim().toUpperCase() || "USD",
        templateLines: previewTemplateLines,
        count: 3,
      }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const templateLines = buildRecurringInvoiceTemplateLines(lines);
      const nextIssueAt = new Date(nextIssueLocal).toISOString();
      const startAt = startIssueLocal ? new Date(startIssueLocal).toISOString() : null;
      const endAt = endIssueLocal ? new Date(endIssueLocal).toISOString() : null;
      const dueDaysValue = Number.parseInt(dueDays, 10);
      const cur = currency.trim().toUpperCase() || "USD";
      const timezoneValue = timezone.trim() || "UTC";
      const notesPayload = notes.trim() || undefined;
      if (editing) {
        return posUpdateRecurringInvoiceTemplate(editing._id, {
          customer: customerId,
          frequency,
          startAt,
          endAt,
          nextIssueAt,
          isActive,
          status: isActive ? "active" : "paused",
          timezone: timezoneValue,
          dueDays: dueDaysValue,
          currency: cur,
          templateLines,
          notes: notesPayload,
        });
      }
      return posCreateRecurringInvoiceTemplate({
        customer: customerId,
        frequency,
        startAt,
        endAt,
        nextIssueAt,
        isActive,
        status: isActive ? "active" : "paused",
        timezone: timezoneValue,
        dueDays: dueDaysValue,
        currency: cur,
        templateLines,
        notes: notesPayload,
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Template updated." : "Template created.");
      void qc.invalidateQueries({ queryKey: ["accounting", "recurring-invoice-templates"] });
      setInvoiceFormErrors({});
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  function submitRecurringInvoiceSave() {
    const parsed = recurringInvoiceSaveFormSchema.safeParse({
      customerId,
      startIssueLocal,
      endIssueLocal,
      nextIssueLocal,
      timezone,
      dueDays,
      currency,
      notes,
      frequency,
      isActive,
      lines,
    });
    if (!parsed.success) {
      setInvoiceFormErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setInvoiceFormErrors({});
    saveMut.mutate();
  }

  const [deleteTarget, setDeleteTarget] = useState<RecurringInvoiceTemplateDoc | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => posDeleteRecurringInvoiceTemplate(id),
    onSuccess: () => {
      toast.success("Template removed.");
      void qc.invalidateQueries({ queryKey: ["accounting", "recurring-invoice-templates"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed."),
  });

  const [runTarget, setRunTarget] = useState<RecurringInvoiceTemplateDoc | null>(null);
  const runMut = useMutation({
    mutationFn: (id: string) => posRunRecurringInvoiceTemplate(id),
    onSuccess: (data) => {
      toast.success(`Invoice issued: ${data.invoice?.invoiceNumber ?? data.invoice?._id}`);
      void qc.invalidateQueries({ queryKey: ["accounting", "recurring-invoice-templates"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "invoices"] });
      setRunTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed."),
  });

  if (!canArRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Recurring invoice templates require{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">backoffice.accounting.ar.read</code>.
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
          <Link href="/dashboard/accounting/invoices">
            <ArrowLeft className="mr-2 size-4" />
            Invoices
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 font-semibold text-3xl tracking-tight">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Receipt className="size-6" />
              </span>
              Recurring billing templates
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
              Create contract-style schedules for billable customers. Each run creates a posted AR invoice using your
              template lines and advances <code className="rounded bg-muted px-1 text-xs">nextIssueAt</code>.
            </p>
          </div>
          {canArWrite ? (
            <Button size="lg" className="shrink-0" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New template
            </Button>
          ) : null}
        </div>
        {canArRead && !canArWrite ? (
          <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
            <span className="font-medium text-foreground">View only.</span> Creating, editing, or deleting requires{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">backoffice.accounting.ar.write</code>.
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
            <p className="text-muted-foreground text-sm">Recurring AR schedules for this organization.</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{activeCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Eligible for the recurring invoice worker.</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>API</CardDescription>
            <CardTitle className="font-medium text-base leading-snug">/recurring-invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              AR read to list; AR write to create, update (PATCH), or delete.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-muted/20 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">How to use this page</CardTitle>
          <CardDescription>
            Choose a billing customer (has email or VAT), set schedule window and timezone, then define template lines.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>Use this for subscriptions, retainers, maintenance contracts, or school monthly fees.</p>
          <p>It is not for one-off POS receipts; those stay in normal POS sales flow.</p>
          <p>Run logs below show worker/manual executions with success or failure reasons.</p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Customer, cadence, next issue, and template subtotal (when line detail is present).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Loading…</p>
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 py-16 text-center">
              <p className="font-medium text-foreground">No recurring invoice templates</p>
              <p className="max-w-md text-muted-foreground text-sm">
                Create a template for subscriptions or retainers. Lines define description, quantity, and unit price for
                each generated invoice.
              </p>
              {canArWrite ? (
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
                    <TableHead className="font-semibold">Billing customer</TableHead>
                    <TableHead className="font-semibold">Frequency</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Next issue</TableHead>
                    <TableHead className="font-semibold">Window</TableHead>
                    <TableHead className="font-semibold">Currency</TableHead>
                    <TableHead className="text-right font-semibold">Template subtotal</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((t) => (
                    <TableRow key={t._id}>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <div>{customerLabel(t.customer)}</div>
                          {t.customer && typeof t.customer === "object" ? (
                            <div className="text-muted-foreground text-xs">
                              {isBillableCustomer(t.customer) ? "Billing profile ready" : "Not billable (flag/email/VAT)"}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{t.frequency}</TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? "default" : "secondary"}>
                          {t.status ?? (t.isActive ? "active" : "paused")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm tabular-nums">
                        {t.nextIssueAt ? format(new Date(t.nextIssueAt), "yyyy-MM-dd HH:mm") : "—"}
                        <span className="ml-1 text-[11px] uppercase">{t.timezone ?? "UTC"}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                        {formatIssueWindow(t)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{t.currency ?? "USD"}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatCurrency(templateSubtotal(t))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canArWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Run now"
                                title="Run now"
                                disabled={!t.isActive || (t.templateLines?.length ?? t.templateLinesCount ?? 0) < 1}
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

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Run log</CardTitle>
          <CardDescription>Execution history for worker/manual runs per template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sorted.length > 0 ? (
            <div className="grid max-w-sm gap-2">
              <Label>Template</Label>
              <Select
                value={selectedLogTemplate?._id ?? "__none__"}
                onValueChange={(value) => setLogTemplateId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Auto (first template)</SelectItem>
                  {sorted.map((template) => (
                    <SelectItem key={template._id} value={template._id}>
                      {customerLabel(template.customer)} · {template.frequency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {!selectedLogTemplate ? (
            <p className="text-muted-foreground text-sm">Create a template first to see run logs.</p>
          ) : (selectedLogTemplate.runLogs?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">
              No run logs yet. Worker/manual execution results will appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {(selectedLogTemplate.runLogs ?? [])
                .slice()
                .reverse()
                .map((log) => (
                  <div key={`${log.runAt}-${log.status}-${log.message}`} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        variant={
                          log.status === "success"
                            ? "default"
                            : log.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {log.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {format(new Date(log.runAt), "yyyy-MM-dd HH:mm")} · {log.trigger}
                      </span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{log.message || "No message."}</p>
                    {log.invoiceNumber ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">Invoice #{log.invoiceNumber}</p>
                    ) : null}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) {
            setInvoiceFormErrors({});
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recurring invoice template" : "New recurring invoice template"}</DialogTitle>
            <DialogDescription>
              Use a billable customer (email or VAT required). Define schedule, due terms, and line items.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Billing customer (AR)</Label>
              <Select
                value={customerId || "__none__"}
                onValueChange={(v) => {
                  setCustomerId(v === "__none__" ? "" : v);
                  setInvoiceFormErrors((p) => ({ ...p, customerId: "" }));
                }}
                disabled={saveMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select billing customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select —</SelectItem>
                  {customerOptions.map((c) => (
                    <SelectItem key={c._id} value={c._id} disabled={!isBillableCustomer(c)}>
                      {c.name}
                      {isBillableCustomer(c) ? "" : " (not billable)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Billable customers: {billableCustomerOptions.length} / {customerOptions.length}
              </p>
              {invoiceFormErrors.customerId ? (
                <p className="text-destructive text-sm">{invoiceFormErrors.customerId}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as RecurringInvoiceFrequency)}
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
              <Label htmlFor="ri-start">Start date (optional)</Label>
              <Input
                id="ri-start"
                type="datetime-local"
                value={startIssueLocal}
                onChange={(e) => {
                  setStartIssueLocal(e.target.value);
                  setInvoiceFormErrors((prev) => ({ ...prev, startIssueLocal: "" }));
                }}
                disabled={saveMut.isPending}
              />
              {invoiceFormErrors.startIssueLocal ? (
                <p className="text-destructive text-sm">{invoiceFormErrors.startIssueLocal}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ri-next">Next issue (local)</Label>
              <Input
                id="ri-next"
                type="datetime-local"
                value={nextIssueLocal}
                onChange={(e) => {
                  setNextIssueLocal(e.target.value);
                  setInvoiceFormErrors((p) => ({ ...p, nextIssueLocal: "" }));
                }}
                disabled={saveMut.isPending}
              />
              {invoiceFormErrors.nextIssueLocal ? (
                <p className="text-destructive text-sm">{invoiceFormErrors.nextIssueLocal}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ri-end">End date (optional)</Label>
              <Input
                id="ri-end"
                type="datetime-local"
                value={endIssueLocal}
                onChange={(e) => {
                  setEndIssueLocal(e.target.value);
                  setInvoiceFormErrors((prev) => ({ ...prev, endIssueLocal: "" }));
                }}
                disabled={saveMut.isPending}
              />
              {invoiceFormErrors.endIssueLocal ? (
                <p className="text-destructive text-sm">{invoiceFormErrors.endIssueLocal}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Timezone</Label>
              <Select
                value={timezone}
                onValueChange={(value) => {
                  setTimezone(value);
                  setInvoiceFormErrors((prev) => ({ ...prev, timezone: "" }));
                }}
                disabled={saveMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {invoiceFormErrors.timezone ? (
                <p className="text-destructive text-sm">{invoiceFormErrors.timezone}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
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
            <div className="grid gap-2">
              <Label htmlFor="ri-due-days">Due in (days)</Label>
              <Input
                id="ri-due-days"
                type="number"
                min={1}
                max={365}
                value={dueDays}
                onChange={(e) => {
                  setDueDays(e.target.value);
                  setInvoiceFormErrors((prev) => ({ ...prev, dueDays: "" }));
                }}
                disabled={saveMut.isPending}
              />
              {invoiceFormErrors.dueDays ? (
                <p className="text-destructive text-sm">{invoiceFormErrors.dueDays}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ri-ccy">Currency</Label>
              <Input
                id="ri-ccy"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={8}
                disabled={saveMut.isPending}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="ri-notes">Notes (optional)</Label>
              <Input
                id="ri-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={saveMut.isPending}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="grid gap-1">
                <Label>Lines</Label>
                {invoiceFormErrors.lines ? <p className="text-destructive text-sm">{invoiceFormErrors.lines}</p> : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => {
                  setLines((rows) => [...rows, emptyLine()]);
                  setInvoiceFormErrors((p) => ({ ...p, lines: "" }));
                }}
              >
                <Plus className="mr-1 size-4" /> Add line
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              {lines.map((row, i) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2 border-b pb-2 last:border-0">
                  <div className="grid min-w-[180px] flex-2 gap-1">
                    <span className="text-muted-foreground text-xs">Description</span>
                    <Input
                      value={row.description}
                      onChange={(e) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                      }
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <div className="grid w-24 gap-1">
                    <span className="text-muted-foreground text-xs">Qty</span>
                    <Input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
                      }
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <div className="grid w-28 gap-1">
                    <span className="text-muted-foreground text-xs">Unit price</span>
                    <Input
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))
                      }
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <div className="grid min-w-[100px] flex-1 gap-1">
                    <span className="text-muted-foreground text-xs">Tax code</span>
                    <Input
                      value={row.taxCode}
                      onChange={(e) =>
                        setLines((r) => r.map((x, j) => (j === i ? { ...x, taxCode: e.target.value } : x)))
                      }
                      disabled={saveMut.isPending}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    disabled={saveMut.isPending || lines.length <= 1}
                    onClick={() => setLines((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            {previewSubtotal != null ? (
              <p className="text-muted-foreground text-sm">
                Template subtotal (excl. tax):{" "}
                <span className="font-medium font-mono text-foreground">{formatCurrency(previewSubtotal)}</span>
              </p>
            ) : null}
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Next runs preview</p>
              <p className="mt-1 text-muted-foreground">
                {previewQuery.isLoading
                  ? "Calculating from server..."
                  : previewQuery.data?.runs?.length
                    ? previewQuery.data.runs
                        .map((run) => format(new Date(run.issueDate), "yyyy-MM-dd HH:mm"))
                        .join(" , ")
                    : nextRunPreviewLocal.join(" , ") || "Set a valid next issue date to preview upcoming runs."}
              </p>
              {previewQuery.error instanceof Error ? (
                <p className="mt-1 text-destructive text-xs">{previewQuery.error.message}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
              disabled={saveMut.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitRecurringInvoiceSave} disabled={saveMut.isPending}>
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
              Removes this schedule only; issued invoices are not deleted.
              {deleteTarget ? (
                <span className="mt-2 block font-medium text-foreground">{customerLabel(deleteTarget.customer)}</span>
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
            <DialogTitle>Issue invoice now?</DialogTitle>
            <DialogDescription>
              Creates a new posted invoice from this template dated today, then advances{" "}
              <code className="rounded bg-muted px-1 text-xs">nextIssueAt</code> by one period.
              {runTarget ? (
                <span className="mt-2 block space-y-1">
                  <span className="block font-medium text-foreground">{customerLabel(runTarget.customer)}</span>
                  <span className="block text-muted-foreground text-xs">
                    Estimated total: {formatCurrency(templateSubtotal(runTarget))}
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
              Issue now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
