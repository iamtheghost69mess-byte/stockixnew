"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { fetchLocationsList, normalizeLocationsQueryData } from "@/lib/inventory-api";
import type { AccountingSessionDoc, JournalEntryDoc } from "@/lib/pos-accounting-api";
import {
  formatJournalEntryReference,
  formatRegisterSessionReference,
  posCloseAccountingSession,
  posFetchAccountingSessions,
  posFetchSessionSummary,
  posOpenAccountingSession,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { accountingSessionCloseSchema } from "@/lib/schemas/accounting/session-close";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { cn, formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type SessionSortBy = "openedAt" | "sessionNumber" | "status" | "openingFloat";

function userLabel(u: AccountingSessionDoc["openedBy"]): string {
  if (!u) return "—";
  if (typeof u === "object" && "name" in u && u.name) return u.name;
  if (typeof u === "object" && "email" in u && u.email) return u.email;
  return "—";
}

function isSessionAlreadyClosedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already closed") || lower.includes("not found or already closed");
}

function SortableTh({
  label,
  active,
  direction,
  onClick,
  className,
  alignEnd,
}: Readonly<{
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
  alignEnd?: boolean;
}>) {
  let sortIcon: ReactNode = null;
  if (active) {
    sortIcon =
      direction === "asc" ? <ArrowUp className="size-3.5 opacity-70" /> : <ArrowDown className="size-3.5 opacity-70" />;
  }
  return (
    <TableHead className={cn(alignEnd && "text-right", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 gap-1 px-2 font-semibold hover:bg-transparent",
          alignEnd ? "ml-auto flex w-full justify-end pr-2" : "-ml-2",
        )}
        onClick={onClick}
      >
        {label}
        {sortIcon}
      </Button>
    </TableHead>
  );
}

function SessionSummaryContent({ sessionId }: Readonly<{ sessionId: string }>) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "session-summary", sessionId],
    queryFn: () => posFetchSessionSummary(sessionId),
    enabled: Boolean(sessionId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading summary…
      </div>
    );
  }
  if (isError) {
    return <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>;
  }
  if (!data) return <p className="text-muted-foreground text-sm">No data.</p>;

  const entries = data.journalEntries || [];
  const recon = data.session.cashReconciliationLog ?? [];
  return (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto">
      <div className="text-muted-foreground text-sm">
        {formatRegisterSessionReference(data.session.sessionNumber)} ·{" "}
        {data.session.status === "open" ? "Open" : "Closed"}
        {data.session.openingFloat != null && <> · Opening float {formatCurrency(Number(data.session.openingFloat))}</>}
      </div>
      {recon.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium text-foreground text-sm">Cash reconciliation history</p>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-3">When</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="pr-3">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recon.map((row, idx) => (
                  <TableRow key={`${String(row.at)}-${idx}`}>
                    <TableCell className="whitespace-nowrap pl-3 text-xs tabular-nums">
                      {row.at ? format(new Date(row.at), "yyyy-MM-dd HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {row.countedCash != null ? formatCurrency(Number(row.countedCash)) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {row.expectedCash != null ? formatCurrency(Number(row.expectedCash)) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {row.variance != null ? formatCurrency(Number(row.variance)) : "—"}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate pr-3 text-xs">{row.note || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No entries linked to this session yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="pl-3">Reference</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="pr-3 text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e: JournalEntryDoc) => (
                <TableRow key={e._id}>
                  <TableCell className="pl-3 font-medium font-mono text-xs">
                    {formatJournalEntryReference(e.entryNumber)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {e.sourceType}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {e.entryDate ? format(new Date(e.entryDate), "yyyy-MM-dd HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm">{e.memo || "—"}</TableCell>
                  <TableCell className="pr-3 text-right">
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link href={`/dashboard/accounting/journal/${e._id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function AccountingSessionsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const canWrite = posCan(permissions, "backoffice.accounting.write");

  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(25);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [sortBy, setSortBy] = useState<SessionSortBy>("openedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const listParams = useMemo(
    () => ({
      page,
      limit,
      status: statusFilter,
      sortBy,
      sortDir,
    }),
    [page, limit, statusFilter, sortBy, sortDir],
  );

  const {
    data: sessionList,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "sessions", listParams],
    queryFn: () => posFetchAccountingSessions(listParams),
    enabled: canRead,
  });

  const sessions = sessionList?.sessions ?? [];
  const total = sessionList?.total ?? 0;
  const effectiveLimit = sessionList?.limit ?? limit;
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
  const rangeStart = total === 0 ? 0 : (page - 1) * effectiveLimit + 1;
  const rangeEnd = Math.min(page * effectiveLimit, total);

  const { data: locationsRaw } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
    enabled: canWrite,
  });
  const locations = normalizeLocationsQueryData(locationsRaw);

  const [openDialog, setOpenDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [locationId, setLocationId] = useState<string>("");

  const [closeTarget, setCloseTarget] = useState<AccountingSessionDoc | null>(null);
  const [closingCounted, setClosingCounted] = useState("");
  const [closingCountedCard, setClosingCountedCard] = useState("");
  const [expectedCash, setExpectedCash] = useState("");
  const [expectedCard, setExpectedCard] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closeFieldErrors, setCloseFieldErrors] = useState<Record<string, string>>({});

  const [summarySessionId, setSummarySessionId] = useState<string | null>(null);

  const onColumnSort = (col: SessionSortBy) => {
    setPage(1);
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const openMut = useMutation({
    mutationFn: () =>
      posOpenAccountingSession({
        openingFloat: Number(openingFloat) || 0,
        location: locationId || null,
      }),
    onSuccess: () => {
      toast.success("Session opened.");
      void qc.invalidateQueries({ queryKey: ["accounting", "sessions"] });
      setOpenDialog(false);
      setOpeningFloat("0");
      setLocationId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Open failed."),
  });

  const closeMut = useMutation({
    mutationFn: () => {
      if (!closeTarget) throw new Error("No session");
      const counted = Number(closingCounted);
      return posCloseAccountingSession(closeTarget._id, {
        closingCountedCash: counted,
        closingCountedCard: Number(closingCountedCard) || 0,
        expectedCash: expectedCash.trim() === "" ? undefined : Number(expectedCash),
        expectedCard: expectedCard.trim() === "" ? undefined : Number(expectedCard),
        discrepancyNote: closeNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Session closed.");
      void qc.invalidateQueries({ queryKey: ["accounting", "sessions"] });
      setCloseFieldErrors({});
      setCloseTarget(null);
      setClosingCounted("");
      setClosingCountedCard("");
      setExpectedCash("");
      setExpectedCard("");
      setCloseNote("");
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Close failed.";
      if (isSessionAlreadyClosedMessage(message)) {
        toast.message("Session is already closed. Refreshed list.");
        void qc.invalidateQueries({ queryKey: ["accounting", "sessions"] });
        setCloseFieldErrors({});
        setCloseTarget(null);
        setClosingCounted("");
        setClosingCountedCard("");
        setExpectedCash("");
        setExpectedCard("");
        setCloseNote("");
        return;
      }
      toast.error(message);
    },
  });

  function submitCloseSession() {
    if (!closeTarget) return;
    const parsed = accountingSessionCloseSchema.safeParse({
      closingCounted,
      closingCountedCard,
      expectedCash,
      expectedCard,
    });
    if (!parsed.success) {
      setCloseFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setCloseFieldErrors({});
    closeMut.mutate();
  }

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need accounting read permission to view register sessions.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="grid gap-6 border-border/60 border-b pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/dashboard/accounting/accounts">
              <ArrowLeft className="mr-2 size-4" />
              Accounts
            </Link>
          </Button>
          <h1 className="flex flex-wrap items-center gap-3 font-bold text-3xl tracking-tight">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <Timer className="size-5" aria-hidden />
            </span>
            <span>Register sessions</span>
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Open and close cash register sessions. Session summary lists GL entries tied to the session.
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          {canWrite ? (
            <Button className="w-full sm:w-auto" size="default" onClick={() => setOpenDialog(true)}>
              Open session
            </Button>
          ) : (
            <p className="max-w-xs text-muted-foreground text-sm leading-snug lg:text-right">
              Accounting write required to open or close sessions.
            </p>
          )}
        </div>
      </header>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 font-semibold text-base">
            <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
            Cash close checklist
          </CardTitle>
          <CardDescription>
            Use this sequence when closing a shift so counts, notes, and GL stay aligned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground text-sm leading-relaxed">
            <li>
              <span className="text-foreground">Pause new sales</span> on the register (or hand off) so the drawer total
              is stable before you count.
            </li>
            <li>
              <span className="text-foreground">Count physical cash</span> in the drawer; optionally reconcile card
              terminal batches against expected card totals.
            </li>
            <li>
              <span className="text-foreground">Open the close-session dialog</span> and enter{" "}
              <span className="font-medium text-foreground">counted cash</span> and{" "}
              <span className="font-medium text-foreground">counted card</span>. Use expected cash/card overrides only
              when you have an agreed system total to compare against.
            </li>
            <li>
              If there is a variance, <span className="text-foreground">add a discrepancy note</span> so audit and
              managers see the context in the session summary.
            </li>
            <li>
              After close, <span className="text-foreground">open session summary</span> and confirm journal entries and
              cash reconciliation history look correct; drill into any line from the journal link if needed.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-y-2 border-b pb-6 @max-md/card-header:has-data-[slot=card-action]:grid-cols-1 @max-md/card-header:has-data-[slot=card-action]:gap-y-4">
          <CardTitle className="font-semibold text-lg leading-tight">Sessions</CardTitle>
          <CardDescription className="text-pretty">
            {total === 0
              ? "No sessions in this result set."
              : `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString()}`}
          </CardDescription>
          <CardAction className="@max-md/card-header:col-start-1 @max-md/card-header:row-span-1 @max-md/card-header:row-start-3 w-full @md/card-header:max-w-[min(100%,28rem)] max-w-full @md/card-header:self-end @max-md/card-header:self-stretch @max-md/card-header:justify-self-stretch @md/card-header:pt-0 pt-3">
            <div
              role="toolbar"
              aria-label="Session list filters and pagination"
              className="flex w-full @md/card-header:flex-row flex-col @md/card-header:flex-wrap @md/card-header:items-end @md/card-header:justify-end gap-3 @md/card-header:gap-x-4 @md/card-header:gap-y-2"
            >
              <div className="grid @md/card-header:w-[10.5rem] w-full min-w-0 gap-1.5">
                <Label htmlFor="sess-status" className="font-medium text-muted-foreground text-xs">
                  Status
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as "all" | "open" | "closed");
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="sess-status" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid @md/card-header:w-[5.75rem] w-full min-w-0 gap-1.5">
                <Label htmlFor="sess-page-size" className="font-medium text-muted-foreground text-xs">
                  Rows per page
                </Label>
                <Select
                  value={String(limit)}
                  onValueChange={(v) => {
                    setLimit(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="sess-page-size" className="h-9 w-full">
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
              <div className="grid @md/card-header:w-auto w-full @md/card-header:min-w-[9.5rem] min-w-0 gap-1.5">
                <span className="font-medium text-muted-foreground text-xs">Page</span>
                <div
                  aria-label={`Page ${page} of ${totalPages}`}
                  className="flex h-9 items-center gap-0.5 rounded-md border border-input bg-background px-0.5 shadow-xs"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="min-w-[4.5rem] flex-1 text-center font-medium text-foreground text-sm tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sessions yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <SortableTh
                      label="Session"
                      active={sortBy === "sessionNumber"}
                      direction={sortDir}
                      onClick={() => onColumnSort("sessionNumber")}
                      className="pl-2"
                    />
                    <SortableTh
                      label="Status"
                      active={sortBy === "status"}
                      direction={sortDir}
                      onClick={() => onColumnSort("status")}
                    />
                    <SortableTh
                      label="Opened"
                      active={sortBy === "openedAt"}
                      direction={sortDir}
                      onClick={() => onColumnSort("openedAt")}
                    />
                    <TableHead>Closed</TableHead>
                    <SortableTh
                      label="Opening"
                      active={sortBy === "openingFloat"}
                      direction={sortDir}
                      onClick={() => onColumnSort("openingFloat")}
                      alignEnd
                    />
                    <TableHead>Opened by</TableHead>
                    <TableHead className="pr-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s._id}>
                      <TableCell className="pl-3 font-medium font-mono text-xs tabular-nums">
                        {formatRegisterSessionReference(s.sessionNumber)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {s.openedAt ? format(new Date(s.openedAt), "yyyy-MM-dd HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {s.closedAt ? format(new Date(s.closedAt), "yyyy-MM-dd HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {s.openingFloat != null ? formatCurrency(Number(s.openingFloat)) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate text-sm">{userLabel(s.openedBy)}</TableCell>
                      <TableCell className="pr-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSummarySessionId(s._id)}>
                            Summary
                          </Button>
                          {canWrite && s.status === "open" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={closeMut.isPending}
                              onClick={() => {
                                if (closeMut.isPending) return;
                                setCloseFieldErrors({});
                                setCloseTarget(s);
                                setClosingCounted(String(s.openingFloat ?? 0));
                                setClosingCountedCard("0");
                                setExpectedCash("");
                                setExpectedCard("");
                                setCloseNote("");
                              }}
                            >
                              Close
                            </Button>
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

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open session</DialogTitle>
            <DialogDescription>Only one open session per organization is allowed by the server.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-2">
            <div className="grid gap-2">
              <Label htmlFor="openingFloat">Opening float</Label>
              <Input
                id="openingFloat"
                className="h-10"
                type="number"
                min={0}
                step="0.01"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
              />
            </div>
            <div className="grid w-full min-w-0 gap-2">
              <Label>Location (optional)</Label>
              <Select value={locationId || "__none__"} onValueChange={(v) => setLocationId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <SelectValue placeholder="All / default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name || loc.code || "Location"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => openMut.mutate()} disabled={openMut.isPending}>
              {openMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(closeTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setCloseFieldErrors({});
            setCloseTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Close {closeTarget ? formatRegisterSessionReference(closeTarget.sessionNumber) : "session"}
            </DialogTitle>
            <DialogDescription>
              Counted cash is required. Expected cash defaults to opening float if omitted.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-4">
              <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Cash</h3>
              <div className="space-y-2">
                <Label htmlFor="counted">Counted cash (Actual)</Label>
                <Input
                  id="counted"
                  className="h-10"
                  type="number"
                  step="0.01"
                  value={closingCounted}
                  onChange={(e) => {
                    setClosingCounted(e.target.value);
                    setCloseFieldErrors((p) => ({ ...p, closingCounted: "" }));
                  }}
                />
                {closeFieldErrors.closingCounted ? (
                  <p className="text-destructive text-sm">{closeFieldErrors.closingCounted}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected">Expected cash</Label>
                <Input
                  id="expected"
                  className="h-10"
                  type="number"
                  step="0.01"
                  value={expectedCash}
                  onChange={(e) => {
                    setExpectedCash(e.target.value);
                    setCloseFieldErrors((p) => ({ ...p, expectedCash: "" }));
                  }}
                  placeholder={`Default: ${closeTarget?.openingFloat ?? 0}`}
                />
                {closeFieldErrors.expectedCash ? (
                  <p className="text-destructive text-sm">{closeFieldErrors.expectedCash}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Card / Digital</h3>
              <div className="space-y-2">
                <Label htmlFor="counted-card">Counted card (Actual)</Label>
                <Input
                  id="counted-card"
                  className="h-10"
                  type="number"
                  step="0.01"
                  value={closingCountedCard}
                  onChange={(e) => setClosingCountedCard(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected-card">Expected card</Label>
                <Input
                  id="expected-card"
                  className="h-10"
                  type="number"
                  step="0.01"
                  value={expectedCard}
                  onChange={(e) => {
                    setExpectedCard(e.target.value);
                    setCloseFieldErrors((p) => ({ ...p, expectedCard: "" }));
                  }}
                  placeholder="0.00"
                />
                {closeFieldErrors.expectedCard ? (
                  <p className="text-destructive text-sm">{closeFieldErrors.expectedCard}</p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <Label htmlFor="note">Closing notes / Discrepancy memo</Label>
            <Input
              id="note"
              className="h-10"
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="Explain any shortages or overages..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitCloseSession} disabled={closeMut.isPending}>
              {closeMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Close session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(summarySessionId)}
        onOpenChange={(open) => {
          if (!open) setSummarySessionId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session summary</DialogTitle>
            <DialogDescription>GL entries referencing this register session.</DialogDescription>
          </DialogHeader>
          {summarySessionId ? <SessionSummaryContent sessionId={summarySessionId} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummarySessionId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
