"use client";

import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRightLeft, Calculator, Globe2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FxRateDoc } from "@/lib/pos-accounting-api";
import { posCreateFxRate, posDeleteFxRate, posFetchFxRates, posUpdateFxRate } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { fxRateCreateFormSchema } from "@/lib/schemas/accounting/fx-rate";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { cn } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const FX_CURRENCY_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "LBP", label: "Lebanese Pound" },
  { code: "AED", label: "UAE Dirham" },
  { code: "SAR", label: "Saudi Riyal" },
  { code: "QAR", label: "Qatari Riyal" },
  { code: "KWD", label: "Kuwaiti Dinar" },
  { code: "JOD", label: "Jordanian Dinar" },
  { code: "TRY", label: "Turkish Lira" },
];

const ALL_CURRENCIES_VALUE = "__all__";

function formatFxNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 8,
    minimumFractionDigits: 0,
  }).format(value);
}

function currencyLabel(code: string): string {
  return FX_CURRENCY_OPTIONS.find((c) => c.code === code)?.label ?? code;
}

function parsePositiveRate(raw: string): number | null {
  const r = Number.parseFloat(raw.trim());
  if (!Number.isFinite(r) || r <= 0) return null;
  return r;
}

/**
 * Org-scoped FX spot table (accounting API). Embedded on Tax &amp; treasury page.
 */
export function TaxFxRatesPanel() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const canWrite = posCan(permissions, "backoffice.accounting.write");

  const qc = useQueryClient();
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const listParams = useMemo(() => {
    const from = filterFrom.trim().toUpperCase() || undefined;
    const to = filterTo.trim().toUpperCase() || undefined;
    return { from, to };
  }, [filterFrom, filterTo]);

  const {
    data: rates = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "fx-rates", listParams.from ?? "", listParams.to ?? ""],
    queryFn: () => posFetchFxRates(listParams),
    enabled: canRead,
  });

  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateDialogMode, setRateDialogMode] = useState<"create" | "edit">("create");
  const [editRateId, setEditRateId] = useState<string | null>(null);
  const [effDate, setEffDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newFrom, setNewFrom] = useState("EUR");
  const [newTo, setNewTo] = useState("USD");
  const [newRate, setNewRate] = useState("");
  const [newNote, setNewNote] = useState("");
  const [previewAmount, setPreviewAmount] = useState("1");
  const [fxCreateFieldErrors, setFxCreateFieldErrors] = useState<Record<string, string>>({});

  const draftRate = useMemo(() => parsePositiveRate(newRate), [newRate]);
  const previewBase = useMemo(() => {
    const n = Number.parseFloat(previewAmount.trim());
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [previewAmount]);

  const buildRatePayload = () => {
    const r = Number.parseFloat(newRate);
    return {
      effectiveDate: effDate.trim() ? `${effDate.trim()}T12:00:00.000Z` : undefined,
      fromCurrency: newFrom.trim().toUpperCase(),
      toCurrency: newTo.trim().toUpperCase(),
      rate: r,
      note: newNote.trim() || undefined,
    };
  };

  const createMut = useMutation({
    mutationFn: () => posCreateFxRate(buildRatePayload()),
    onSuccess: () => {
      toast.success("Exchange rate saved.");
      void qc.invalidateQueries({ queryKey: ["accounting", "fx-rates"] });
      closeRateDialog();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => posUpdateFxRate(id, buildRatePayload()),
    onSuccess: () => {
      toast.success("Exchange rate updated.");
      void qc.invalidateQueries({ queryKey: ["accounting", "fx-rates"] });
      closeRateDialog();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed."),
  });

  const [deleteTarget, setDeleteTarget] = useState<FxRateDoc | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => posDeleteFxRate(id),
    onSuccess: () => {
      toast.success("Rate removed.");
      void qc.invalidateQueries({ queryKey: ["accounting", "fx-rates"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed."),
  });

  function closeRateDialog() {
    setRateDialogOpen(false);
    setRateDialogMode("create");
    setEditRateId(null);
    setNewRate("");
    setNewNote("");
    setPreviewAmount("1");
    setFxCreateFieldErrors({});
  }

  function openCreateDialog() {
    setRateDialogMode("create");
    setEditRateId(null);
    setEffDate(format(new Date(), "yyyy-MM-dd"));
    setNewFrom("EUR");
    setNewTo("USD");
    setNewRate("");
    setNewNote("");
    setPreviewAmount("1");
    setFxCreateFieldErrors({});
    setRateDialogOpen(true);
  }

  function openEditDialog(row: FxRateDoc) {
    setRateDialogMode("edit");
    setEditRateId(row._id);
    setEffDate(row.effectiveDate ? format(new Date(row.effectiveDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    setNewFrom(row.fromCurrency);
    setNewTo(row.toCurrency);
    setNewRate(String(row.rate));
    setNewNote(row.note ?? "");
    setPreviewAmount("1");
    setFxCreateFieldErrors({});
    setRateDialogOpen(true);
  }

  function swapNewCurrencies() {
    const prevFrom = newFrom;
    const prevTo = newTo;
    setNewFrom(prevTo);
    setNewTo(prevFrom);
    setNewRate((prev) => {
      const r = parsePositiveRate(prev);
      if (r == null || r === 0) return prev;
      const inv = 1 / r;
      if (!Number.isFinite(inv)) return prev;
      const rounded = Math.round(inv * 1e10) / 1e10;
      return String(rounded);
    });
  }

  function submitRateDialog() {
    const parsed = fxRateCreateFormSchema.safeParse({
      effDate,
      newFrom,
      newTo,
      newRate,
      newNote,
    });
    if (!parsed.success) {
      setFxCreateFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setFxCreateFieldErrors({});
    if (rateDialogMode === "edit" && editRateId) {
      updateMut.mutate(editRateId);
      return;
    }
    createMut.mutate();
  }

  const rateDialogPending = createMut.isPending || updateMut.isPending;

  if (!canRead) {
    return (
      <Alert className="border-dashed shadow-xs">
        <Globe2 className="size-4" />
        <AlertTitle>Exchange rates unavailable</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Viewing this table requires{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">backoffice.accounting.read</code>.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-border/80 bg-muted/20 shadow-xs">
        <Calculator className="size-4 text-foreground/80" />
        <AlertTitle className="text-sm">Rate convention</AlertTitle>
        <AlertDescription className="text-muted-foreground text-sm leading-relaxed">
          <code className="rounded-md bg-background px-1.5 py-0.5 font-mono text-xs ring-1 ring-border/80">
            amount in “to” = amount in “from” × rate
          </code>
          . Example: 1 EUR → 1.09 USD → From <span className="font-mono">EUR</span>, To <span className="font-mono">USD</span>, rate{" "}
          <span className="font-mono">1.09</span>. Edit a row to correct the same day; add a row for a new effective date to keep
          history.
        </AlertDescription>
      </Alert>

      {canRead && !canWrite ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
          <span className="font-medium text-foreground">View only.</span> Editing requires{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-[0.65rem] ring-1 ring-border/60">
            backoffice.accounting.write
          </code>
          .
        </p>
      ) : null}

      <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
        <CardHeader className="space-y-4 border-b bg-muted/30 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-xs ring-1 ring-border/60">
                <Globe2 className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">Spot rate table</CardTitle>
                <CardDescription className="leading-relaxed">
                  Newest effective dates first (max 200). Used for conversions — latest row on or before a date, or inverse pair.
                </CardDescription>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs tabular-nums">
                {rates.length} row{rates.length === 1 ? "" : "s"}
              </Badge>
              {canWrite ? (
                <Button size="sm" className="shadow-xs" onClick={openCreateDialog}>
                  <Plus className="mr-2 size-4" />
                  Add rate
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="grid min-w-[min(100%,200px)] flex-1 gap-2">
              <Label htmlFor="fx-filter-from" className="font-medium text-muted-foreground text-xs">
                From currency
              </Label>
              <Select
                value={filterFrom || ALL_CURRENCIES_VALUE}
                onValueChange={(value) => setFilterFrom(value === ALL_CURRENCIES_VALUE ? "" : value)}
              >
                <SelectTrigger id="fx-filter-from" className="h-10 bg-background">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CURRENCIES_VALUE}>All currencies</SelectItem>
                  {FX_CURRENCY_OPTIONS.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} — {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-[min(100%,200px)] flex-1 gap-2">
              <Label htmlFor="fx-filter-to" className="font-medium text-muted-foreground text-xs">
                To currency
              </Label>
              <Select
                value={filterTo || ALL_CURRENCIES_VALUE}
                onValueChange={(value) => setFilterTo(value === ALL_CURRENCIES_VALUE ? "" : value)}
              >
                <SelectTrigger id="fx-filter-to" className="h-10 bg-background">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CURRENCIES_VALUE}>All currencies</SelectItem>
                  {FX_CURRENCY_OPTIONS.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} — {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : rates.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
              <p className="font-medium text-foreground">No rates yet</p>
              <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
                Example: <strong>1 EUR</strong> = <strong>1.09 USD</strong> → From EUR, To USD, rate <span className="font-mono">1.09</span>.
              </p>
              {canWrite ? (
                <Button className="mt-6" onClick={openCreateDialog}>
                  <Plus className="mr-2 size-4" />
                  Add first rate
                </Button>
              ) : null}
            </div>
          ) : (
            <ScrollArea className="h-[min(420px,58vh)] rounded-lg border bg-card">
              <Table>
                <TableHeader className="sticky top-0 z-10 border-b bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                      Effective
                    </TableHead>
                    <TableHead className="h-10 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Pair</TableHead>
                    <TableHead className="h-10 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                      Rate
                    </TableHead>
                    <TableHead className="h-10 min-w-[180px] font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                      Quote
                    </TableHead>
                    <TableHead className="h-10 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Note</TableHead>
                    <TableHead className="h-10 w-[96px] text-right font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((row) => (
                    <TableRow key={row._id} className="border-border/60 border-b last:border-0 hover:bg-muted/40">
                      <TableCell className="font-mono text-sm tabular-nums">
                        {row.effectiveDate ? format(new Date(row.effectiveDate), "yyyy-MM-dd") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {row.fromCurrency}
                          </Badge>
                          <span className="text-muted-foreground text-xs">→</span>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {row.toCurrency}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium font-mono text-sm tabular-nums">
                        {formatFxNumber(Number(row.rate))}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">1 {row.fromCurrency} = </span>
                        <span className="font-medium tabular-nums">{formatFxNumber(Number(row.rate))}</span>
                        <span className="text-muted-foreground"> {row.toCurrency}</span>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground text-sm" title={row.note || undefined}>
                        {row.note || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              aria-label="Edit"
                              onClick={() => openEditDialog(row)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              aria-label="Delete"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={rateDialogOpen}
        onOpenChange={(o) => {
          if (!o) closeRateDialog();
          else setRateDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-2 border-b bg-muted/30 px-6 py-5">
            <DialogTitle className="text-xl">
              {rateDialogMode === "edit" ? "Edit exchange rate" : "Add exchange rate"}
            </DialogTitle>
            <DialogDescription>
              {rateDialogMode === "edit" ? (
                <>Updates this row in place. Effective date is the UTC day the rate applies from.</>
              ) : (
                <>
                  Effective at the start of the chosen UTC day. Add another row for a different date to preserve history.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="tax-fx-e">Effective date</Label>
              <DatePicker id="tax-fx-e" value={effDate} onValueChange={setEffDate} className="w-full" />
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-inner">
              <p className="text-center font-medium text-muted-foreground text-xs uppercase tracking-wide">You are defining</p>
              <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="font-semibold text-2xl tabular-nums">1</span>
                  <Select
                    value={newFrom}
                    onValueChange={(value) => {
                      setNewFrom(value);
                      setFxCreateFieldErrors((p) => ({ ...p, newFrom: "" }));
                    }}
                  >
                    <SelectTrigger className="h-11 w-[140px] font-mono font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FX_CURRENCY_OPTIONS.map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="hidden text-muted-foreground sm:inline">=</span>
                <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
                  <Input
                    id="tax-fx-nr"
                    inputMode="decimal"
                    placeholder="e.g. 1.085"
                    className={cn(
                      "h-11 min-w-[120px] flex-1 text-center font-mono font-semibold text-lg tabular-nums sm:max-w-[200px]",
                      fxCreateFieldErrors.newRate && "border-destructive",
                    )}
                    value={newRate}
                    onChange={(e) => {
                      setNewRate(e.target.value);
                      setFxCreateFieldErrors((p) => ({ ...p, newRate: "" }));
                    }}
                  />
                  <Select
                    value={newTo}
                    onValueChange={(value) => {
                      setNewTo(value);
                      setFxCreateFieldErrors((p) => ({ ...p, newTo: "" }));
                    }}
                  >
                    <SelectTrigger className="h-11 w-[140px] font-mono font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FX_CURRENCY_OPTIONS.map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 text-center text-muted-foreground text-xs">
                {currencyLabel(newFrom)} → {currencyLabel(newTo)}
              </p>
              {fxCreateFieldErrors.newFrom ? (
                <p className="mt-2 text-center text-destructive text-xs">{fxCreateFieldErrors.newFrom}</p>
              ) : null}
              {fxCreateFieldErrors.newTo ? (
                <p className="mt-2 text-center text-destructive text-xs">{fxCreateFieldErrors.newTo}</p>
              ) : null}
              {fxCreateFieldErrors.newRate ? (
                <p className="mt-2 text-center text-destructive text-xs">{fxCreateFieldErrors.newRate}</p>
              ) : null}
            </div>
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={swapNewCurrencies}>
                <ArrowRightLeft className="size-4" />
                Swap & invert
              </Button>
            </div>
            <div className="rounded-lg border border-dashed bg-muted/20 p-4">
              <Label htmlFor="tax-fx-preview" className="text-muted-foreground text-xs">
                Preview
              </Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="tax-fx-preview"
                  inputMode="decimal"
                  className="h-9 max-w-[140px] font-mono tabular-nums"
                  value={previewAmount}
                  onChange={(e) => setPreviewAmount(e.target.value)}
                />
                <p className="font-mono text-sm tabular-nums">
                  {draftRate != null && previewBase >= 0 ? (
                    <>
                      {formatFxNumber(previewBase)} {newFrom} = {formatFxNumber(previewBase * draftRate)} {newTo}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Enter a positive rate.</span>
                  )}
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tax-fx-nn">Note (optional)</Label>
              <Input id="tax-fx-nn" placeholder="Reference…" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 border-t bg-muted/20 px-6 py-4 sm:justify-end">
            <Button variant="outline" onClick={() => closeRateDialog()} disabled={rateDialogPending}>
              Cancel
            </Button>
            <Button onClick={submitRateDialog} disabled={rateDialogPending}>
              {rateDialogPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : rateDialogMode === "edit" ? (
                "Save changes"
              ) : (
                "Save rate"
              )}
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
            <DialogTitle>Remove this rate?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <span className="text-foreground">
                  Delete{" "}
                  <span className="font-mono">
                    1 {deleteTarget.fromCurrency} = {formatFxNumber(Number(deleteTarget.rate))} {deleteTarget.toCurrency}
                  </span>{" "}
                  effective {deleteTarget.effectiveDate ? format(new Date(deleteTarget.effectiveDate), "yyyy-MM-dd") : "—"}?
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget._id)}
              disabled={deleteMut.isPending || !deleteTarget}
            >
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
