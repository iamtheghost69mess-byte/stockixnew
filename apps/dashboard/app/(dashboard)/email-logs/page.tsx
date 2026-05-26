"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";

type EmailLogRow = {
  id: string;
  templateKey: string;
  status: string;
  deliveryStatus: string | null;
  providerMessageId: string | null;
  error: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  createdAt: string;
};

export default function EmailLogsPage() {
  const { me, loading: meLoading } = useMe();
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState("");
  const [status, setStatus] = useState("");

  const canView = me?.capabilities.canAccessSettings;

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (templateKey.trim()) params.set("templateKey", templateKey.trim());
    if (status.trim()) params.set("status", status.trim());
    try {
      const res = await fetch(`/api/admin/email-logs?${params}`);
      const data = (await res.json()) as {
        logs?: EmailLogRow[];
        totalPages?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(formatApiError(data, res.statusText));
        setLogs([]);
        return;
      }
      setLogs(data.logs ?? []);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email logs");
    } finally {
      setLoading(false);
    }
  }, [canView, page, templateKey, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (meLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!canView) {
    return (
      <p className="text-muted-foreground text-sm">
        You do not have permission to view email logs.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Overview</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Email log</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Email log
          </CardTitle>
          <CardDescription>
            Outbound transactional emails from the control plane (hashed recipients).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="templateKey">Template</Label>
              <Input
                id="templateKey"
                placeholder="e.g. owner-invite"
                value={templateKey}
                onChange={(e) => {
                  setTemplateKey(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                placeholder="sent | failed | skipped"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : loading ? (
            <Skeleton className="h-48 w-full" />
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No email log entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Provider ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(row.createdAt), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.templateKey}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.deliveryStatus ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {row.tenantName ?? row.tenantSlug ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs">
                      {row.providerMessageId ?? (row.error ? `err: ${row.error}` : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
