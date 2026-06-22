"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AlertCircle, ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { useAuditLog } from "./hooks/use-audit-log";
import type { AuditLogEntry } from "@/types/audit-log";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Short human-readable summary for known action metadata shapes; null → render raw JSON block. */
function humanMetadataSummary(action: string, metadata: unknown): string | null {
  const m = isRecord(metadata) ? metadata : null;
  if (!m) return null;
  const a = action.toLowerCase();
  if (a.includes("org")) {
    if (typeof m.name === "string" && m.name.trim()) {
      const n = m.name.trim();
      return n.length > 80 ? `${n.slice(0, 77)}…` : n;
    }
    if (typeof m.slug === "string" && m.slug.trim()) {
      const s = m.slug.trim();
      return s.length > 76 ? `Slug ${s.slice(0, 73)}…` : `Slug ${s}`;
    }
  }
  if (a.includes("license")) {
    if (typeof m.licenseKey === "string" && m.licenseKey.trim()) {
      const k = m.licenseKey.trim().toUpperCase();
      return k.length > 28 ? `${k.slice(0, 25)}…` : k;
    }
    if (typeof m.licenseId === "string" && m.licenseId.length > 0) {
      return `License ${m.licenseId.slice(0, 8)}…`;
    }
  }
  return null;
}

function AuditMetadataCell({ action, metadata }: { action: string; metadata: unknown }) {
  const human = humanMetadataSummary(action, metadata);
  if (human !== null) {
    return <span className="leading-relaxed text-muted-foreground">{human}</span>;
  }
  if (!isRecord(metadata) || Object.keys(metadata).length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="max-w-full min-w-0 rounded-md border border-border/60 bg-muted/25">
      <pre
        className="max-h-40 w-full min-w-0 overflow-auto whitespace-pre-wrap wrap-break-word p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground"
        tabIndex={0}
      >
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </div>
  );
}

const SKELETON_ROWS = 6;

export default function AuditLogPage() {
  const { me } = useMe();
  const canView = Boolean(me?.capabilities.canAccessSettings);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [actionInput, setActionInput] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setActionFilter(actionInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [actionInput]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, actorSearch, tenantSearch]);

  const { entries, total, totalPages, loading: listLoading, error } = useAuditLog({
    canView,
    page,
    pageSize,
    actionFilter,
    actorSearch,
    tenantSearch,
  });

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (!me) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full max-w-2xl" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Audit log</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Card className="max-w-lg border-destructive/40">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Audit log is restricted to Super Admins.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Audit log</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only history of platform actions (super admin).
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Could not load audit log</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>Optional filters apply to the table below.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="audit-action">Action</Label>
              <Input
                id="audit-action"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder="e.g. tenant.suspend, license"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Matches the event code (dot-separated), not the friendly label.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-actor">Actor</Label>
              <Input
                id="audit-actor"
                value={actorSearch}
                onChange={(e) => setActorSearch(e.target.value)}
                placeholder="Name or email"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-tenant">Target tenant</Label>
              <Input
                id="audit-tenant"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Name or slug"
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
                  setActorSearch("");
                  setTenantSearch("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm ring-1 ring-foreground/10">
          <CardHeader className="border-b border-border/80 pb-4">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>
              Newest entries first. Hover a timestamp for the exact date and time.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative w-full overflow-x-auto">
              <Table className="w-full min-w-[960px] table-fixed">
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                    <TableHead className="whitespace-nowrap font-medium">When</TableHead>
                    <TableHead className="whitespace-nowrap font-medium">Action</TableHead>
                    <TableHead className="whitespace-nowrap font-medium">Actor</TableHead>
                    <TableHead className="whitespace-nowrap font-medium">Target</TableHead>
                    <TableHead className="whitespace-normal font-medium">Details</TableHead>
                    <TableHead className="hidden whitespace-nowrap font-medium lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listLoading && entries.length === 0
                    ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                        <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                          <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full max-w-xs" />
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                  {!listLoading && entries.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="h-40 text-center align-middle">
                        <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
                          <FileText className="h-10 w-10 opacity-40" aria-hidden />
                          <p className="text-sm font-medium text-foreground">No matching entries</p>
                          <p className="max-w-sm text-xs">
                            Try clearing filters or broadening the action search.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {entries.map((row) => {
                    const created = new Date(row.createdAt);
                    const rel = formatDistanceToNow(created, { addSuffix: true });
                    const full = format(created, "PPpp");
                    return (
                      <TableRow key={row.id} className="border-b transition-colors hover:bg-muted/50">
                        <TableCell className="align-top whitespace-normal wrap-break-word text-sm text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  className="cursor-default border-b border-dotted border-muted-foreground/50 bg-transparent p-0 text-left text-inherit tabular-nums hover:border-muted-foreground"
                                >
                                  {rel}
                                </button>
                              }
                            />
                            <TooltipContent side="top">{full}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal wrap-break-word">
                          <div className="text-sm font-medium leading-snug">{row.actionLabel}</div>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  className="mt-0.5 cursor-default border-0 bg-transparent p-0 text-left font-mono text-[11px] text-muted-foreground"
                                >
                                  {row.action}
                                </button>
                              }
                            />
                            <TooltipContent side="top" className="font-mono text-xs">
                              Event code
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal wrap-break-word">
                          <div className="text-sm font-medium leading-snug">{row.actorLabel}</div>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  className="mt-0.5 cursor-default border-0 bg-transparent p-0 text-left font-mono text-[11px] text-muted-foreground"
                                >
                                  {row.actorId.slice(0, 8)}…
                                </button>
                              }
                            />
                            <TooltipContent side="top" className="font-mono text-xs">
                              {row.actorId}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal wrap-break-word text-sm">
                          {row.targetLabel ? (
                            row.targetTenantId ? (
                              <Link
                                href={`/tenants/${row.targetTenantId}`}
                                className="font-medium text-primary underline-offset-4 hover:underline"
                              >
                                {row.targetLabel}
                              </Link>
                            ) : (
                              <span className="font-medium">{row.targetLabel}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-0 align-top whitespace-normal py-2.5 text-sm">
                          <AuditMetadataCell action={row.action} metadata={row.metadata} />
                        </TableCell>
                        <TableCell className="hidden min-w-0 align-top whitespace-nowrap border-l border-border/50 bg-muted/15 px-3 font-mono text-xs text-muted-foreground lg:table-cell">
                          {row.ipAddress ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{from}</span>
              –
              <span className="font-medium text-foreground">{to}</span> of{" "}
              <span className="font-medium text-foreground">{total}</span> entries
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || listLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="min-w-28 text-center text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages || listLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </TooltipProvider>
  );
}
