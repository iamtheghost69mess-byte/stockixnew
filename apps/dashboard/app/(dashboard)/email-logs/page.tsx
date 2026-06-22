"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Mail } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Skeleton } from "@repo/ui/skeleton";
import { MetaTable, type MetaTableColumn } from "@repo/ui-shared";
import { useMe } from "@/hooks/use-me";
import { useEmailLogs, type EmailLogRow } from "./hooks/use-email-logs";

const COLUMNS: MetaTableColumn<EmailLogRow>[] = [
  {
    key: "createdAt",
    label: "Sent",
    width: "140px",
    renderCell: (v) => (
      <span className="whitespace-nowrap text-xs">{format(new Date(v as string), "yyyy-MM-dd HH:mm")}</span>
    ),
  },
  {
    key: "templateKey",
    label: "Template",
    renderCell: (v) => <span className="font-mono text-xs">{v}</span>,
  },
  { key: "status", label: "Status" },
  {
    key: "deliveryStatus",
    label: "Delivery",
    renderCell: (v) => v ?? "—",
  },
  {
    key: "tenantName",
    label: "Tenant",
    renderCell: (v, row) => (
      <span className="text-xs">{(v ?? row.tenantSlug ?? "—") as string}</span>
    ),
  },
  {
    key: "providerMessageId",
    label: "Provider ID",
    width: "160px",
    renderCell: (v, row) => (
      <span className="block max-w-[140px] truncate font-mono text-xs">
        {(v ?? (row.error ? `err: ${row.error}` : "—")) as string}
      </span>
    ),
  },
];

export default function EmailLogsPage() {
  const { me, loading: meLoading } = useMe();
  const [templateKey, setTemplateKey] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const canView = Boolean(me?.capabilities.canAccessSettings);

  const { logs, totalPages, loading, error } = useEmailLogs({
    canView,
    templateKey,
    status,
    page,
  });

  if (meLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
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
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="templateKey">Template</Label>
              <Input
                id="templateKey"
                placeholder="e.g. owner-invite"
                value={templateKey}
                onChange={(e) => { setTemplateKey(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                placeholder="sent | failed | skipped"
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <MetaTable
            columns={COLUMNS}
            data={logs}
            isLoading={loading}
            emptyMessage="No email log entries yet."
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
