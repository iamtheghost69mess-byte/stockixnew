"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchPosAuditPage } from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";

const PAGE_SIZE = 25;

export default function PosAuditReportPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(new Date(Date.now() - 7 * 86400000), "yyyy-MM-dd");
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["reports", "pos-audit", { from, to, action, userId, page }],
    queryFn: () =>
      fetchPosAuditPage({
        page,
        limit: PAGE_SIZE,
        from: from || undefined,
        to: to || undefined,
        action: action.trim() || undefined,
        userId: userId.trim() || undefined,
      }),
  });

  const dateRange = useMemo(() => `${from || "…"} → ${to || "…"}`, [from, to]);

  const exportRows = useMemo(
    () =>
      (query.data?.rows ?? []).map((r) => ({
        when: r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : "",
        action: r.action,
        user: r.user?.name || r.user?.username || "",
        location: r.location?.name || "",
        ip: r.ip || "",
        detail: JSON.stringify(r.metadata ?? {}).slice(0, 200),
      })),
    [query.data?.rows],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">POS audit trail</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Filterable log of POS actions (voids, discounts, payments, etc.) for the current branch scope.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link href="/dashboard/accounting/audit-log">GL / journal audit log</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow by date, exact action key, or staff user id.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label htmlFor="pos-audit-from">From</Label>
            <Input id="pos-audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="pos-audit-to">To</Label>
            <Input id="pos-audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid min-w-[10rem] gap-1">
            <Label htmlFor="pos-audit-action">Action</Label>
            <Input
              id="pos-audit-action"
              placeholder="e.g. void"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid min-w-[10rem] gap-1">
            <Label htmlFor="pos-audit-user">User id</Label>
            <Input
              id="pos-audit-user"
              placeholder="Mongo ObjectId"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => setPage(1)}>
            Apply
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            exportReportPdf({
              fileName: "pos-audit.pdf",
              title: "POS audit trail",
              branchName: "Current scope",
              dateRange,
              columns: [
                { key: "when", label: "When" },
                { key: "action", label: "Action" },
                { key: "user", label: "User" },
                { key: "location", label: "Branch" },
                { key: "ip", label: "IP" },
                { key: "detail", label: "Metadata" },
              ],
              rows: exportRows,
            })
          }
        >
          <Download className="mr-2 size-4" />
          Export PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            exportReportExcel({
              fileName: "pos-audit.xlsx",
              branchName: "Current scope",
              dateRange,
              columns: [
                { key: "when", label: "When" },
                { key: "action", label: "Action" },
                { key: "user", label: "User" },
                { key: "location", label: "Branch" },
                { key: "ip", label: "IP" },
                { key: "detail", label: "Metadata" },
              ],
              rows: exportRows,
            })
          }
        >
          <FileSpreadsheet className="mr-2 size-4" />
          Export Excel
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {query.data != null ? `${query.data.total} total · page ${query.data.page}` : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : query.isError ? (
            <p className="text-destructive text-sm">{query.error instanceof Error ? query.error.message : "Error"}</p>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data?.rows ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                        No rows for this filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (query.data?.rows ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.action}</TableCell>
                        <TableCell className="text-sm">{r.user?.name || r.user?.username || "—"}</TableCell>
                        <TableCell className="text-sm">{r.location?.name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.ip || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {query.data != null && query.data.total > PAGE_SIZE ? (
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page * PAGE_SIZE >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
