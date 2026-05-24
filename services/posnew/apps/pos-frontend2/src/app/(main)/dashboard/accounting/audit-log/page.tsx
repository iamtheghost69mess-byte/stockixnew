"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, History, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatJournalEntryReference, type JournalAuditLogDoc, posFetchAuditLogs } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function userLabel(u: JournalAuditLogDoc["user"]): string {
  if (!u) return "—";
  if (typeof u === "object" && "name" in u && u.name) return u.name;
  if (typeof u === "object" && "email" in u && u.email) return u.email;
  return "—";
}

function journalRef(log: JournalAuditLogDoc): { href: string | null; label: string } {
  const je = log.journalEntry;
  if (je && typeof je === "object" && je._id) {
    const label = formatJournalEntryReference(je.entryNumber);
    return { href: `/dashboard/accounting/journal/${je._id}`, label };
  }
  return { href: null, label: "—" };
}

export default function AccountingAuditLogPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");

  const [page, setPage] = useState(1);
  const limit = 25;
  const [actionFilter, setActionFilter] = useState("");

  const query = useMemo(
    () => ({
      page,
      limit,
      action: actionFilter.trim() || undefined,
    }),
    [page, actionFilter],
  );

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["accounting", "audit-log", query],
    queryFn: () => posFetchAuditLogs(query),
    enabled: canRead,
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need accounting read permission to view the audit log.</p>
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
            <History className="size-7" />
            Audit log
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Append-only journal audit trail. Filter by action substring (server exact match on{" "}
            <code className="text-xs">action</code>).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/reports/pos-audit">POS audit trail</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/accounting/exports">GL exports</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Read-only. Paginated when page and limit are sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-md flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="action">Action (optional)</Label>
              <Input
                id="action"
                placeholder="e.g. journal.ar_payment"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {isLoading && !data ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit rows for this filter.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Journal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((log) => {
                    const jr = journalRef(log);
                    return (
                      <TableRow key={log._id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {log.createdAt ? format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>{userLabel(log.user)}</TableCell>
                        <TableCell>
                          {jr.href ? (
                            <Button variant="link" className="h-auto p-0" asChild>
                              <Link href={jr.href}>{jr.label}</Link>
                            </Button>
                          ) : (
                            jr.label
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {totalPages} · {total} total
                  {isFetching ? " · …" : null}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
