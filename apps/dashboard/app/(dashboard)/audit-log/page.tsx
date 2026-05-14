"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import type { AuditLogEntry } from "@/types/audit-log";

function actionVariant(action: string): "destructive" | "default" | "secondary" {
  const a = action.toLowerCase();
  if (
    a.includes("delete")
    || a.includes("revoke")
    || a.includes("suspend")
    || a.includes("blacklist")
  ) {
    return "destructive";
  }
  if (
    a.includes("create")
    || a.includes("provision")
    || a.includes("reactivate")
    || a.includes("extend")
  ) {
    return "default";
  }
  return "secondary";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function formatAuditDetails(action: string, metadata: unknown): string {
  const m = isRecord(metadata) ? metadata : null;
  const a = action.toLowerCase();
  if (a.includes("org")) {
    if (typeof m?.name === "string" && m.name.trim()) {
      const n = m.name.trim();
      return n.length > 80 ? `${n.slice(0, 77)}…` : n;
    }
    if (typeof m?.slug === "string" && m.slug.trim()) {
      const s = m.slug.trim();
      return s.length > 76 ? `Slug ${s.slice(0, 73)}…` : `Slug ${s}`;
    }
  }
  if (a.includes("license")) {
    if (typeof m?.licenseKey === "string" && m.licenseKey.trim()) {
      const k = m.licenseKey.trim().toUpperCase();
      return k.length > 28 ? `${k.slice(0, 25)}…` : k;
    }
    if (typeof m?.licenseId === "string" && m.licenseId.length > 0) {
      return `License ${m.licenseId.slice(0, 8)}…`;
    }
  }
  const raw = m ? JSON.stringify(m) : "";
  if (!raw) return "—";
  return raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
}

function parseEntries(body: unknown): AuditLogEntry[] {
  if (!isRecord(body) || !Array.isArray(body.entries)) return [];
  return body.entries.filter((row): row is AuditLogEntry => {
    if (!isRecord(row)) return false;
    return (
      typeof row.id === "string"
      && typeof row.action === "string"
      && typeof row.actorId === "string"
      && typeof row.actorName === "string"
      && typeof row.createdAt === "string"
    );
  });
}

export default function AuditLogPage() {
  const me = useMe();
  const canView = Boolean(me?.capabilities.canAccessSettings);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actionInput, setActionInput] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorId, setActorId] = useState("");
  const [tenantId, setTenantId] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setActionFilter(actionInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [actionInput]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, actorId, tenantId]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (actionFilter) p.set("action", actionFilter);
    if (actorId.trim()) p.set("actorId", actorId.trim());
    if (tenantId.trim()) p.set("tenantId", tenantId.trim());
    return p.toString();
  }, [page, pageSize, actionFilter, actorId, tenantId]);

  const load = useCallback(async () => {
    if (!canView) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-log?${queryString}`);
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatApiError(data, res.status === 403 ? "Access denied" : `HTTP ${res.status}`));
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }
      if (!isRecord(data)) {
        setEntries([]);
        return;
      }
      setEntries(parseEntries(data));
      setTotal(typeof data.total === "number" ? data.total : 0);
      setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
    } catch {
      setError("Failed to load audit log.");
      setEntries([]);
    } finally {
      setListLoading(false);
    }
  }, [queryString, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (me && !canView) {
    return (
      <Card className="max-w-lg border-destructive/40">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>Audit log is restricted to Super Admins.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only history of platform actions (super admin).
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {canView ? (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
                <CardDescription>Optional filters apply to the list below.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="audit-action">Action contains</Label>
                  <Input
                    id="audit-action"
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    placeholder="e.g. license, org"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-actor">Actor ID</Label>
                  <Input
                    id="audit-actor"
                    value={actorId}
                    onChange={(e) => setActorId(e.target.value)}
                    placeholder="UUID"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-tenant">Target tenant ID</Label>
                  <Input
                    id="audit-tenant"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="UUID"
                    autoComplete="off"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setActionInput("");
                      setActionFilter("");
                      setActorId("");
                      setTenantId("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-xl border border-border/80 bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px]">When</TableHead>
                    <TableHead className="min-w-[160px]">Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead className="min-w-[200px]">Details</TableHead>
                    <TableHead className="hidden lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listLoading && entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!listLoading && entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No audit entries match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {entries.map((row) => {
                    const created = new Date(row.createdAt);
                    const rel = formatDistanceToNow(created, { addSuffix: true });
                    const full = format(created, "PPpp");
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="cursor-default border-b border-dotted border-muted-foreground/60" />
                              }
                            >
                              {rel}
                            </TooltipTrigger>
                            <TooltipContent>{full}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={actionVariant(row.action)} className="font-mono text-xs font-normal">
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="text-sm font-medium">{row.actorName}</div>
                          <div className="font-mono text-xs text-muted-foreground">{row.actorId}</div>
                        </TableCell>
                        <TableCell className="max-w-md align-top text-sm text-muted-foreground">
                          <span className="wrap-break-word">{formatAuditDetails(row.action, row.metadata)}</span>
                        </TableCell>
                        <TableCell className="hidden max-w-[140px] align-top font-mono text-xs text-muted-foreground lg:table-cell">
                          {row.ipAddress ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {from}–{to} of {total} entries
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
