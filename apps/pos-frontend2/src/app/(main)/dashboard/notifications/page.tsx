"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BackofficeNotificationDoc, BackofficeNotificationSeverity } from "@/lib/pos-accounting-api";
import {
  posFetchBackofficeNotifications,
  posFetchBackofficeUnreadNotificationCount,
  posMarkAllBackofficeNotificationsRead,
  posMarkBackofficeNotificationRead,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const unreadCountQueryKey = ["accounting", "notifications", "unread-count"] as const;

function severityBadgeVariant(severity: BackofficeNotificationSeverity): "default" | "secondary" | "destructive" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "secondary";
  return "default";
}

function notificationHref(notification: BackofficeNotificationDoc): string {
  return notification.href?.trim() || "/dashboard/default";
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((state) => state.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const canWrite = posCan(permissions, "backoffice.accounting.write");
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [severity, setSeverity] = useState<BackofficeNotificationSeverity | "all">("all");

  const notificationsQuery = useQuery({
    queryKey: ["accounting", "notifications", "list", status, severity],
    queryFn: () => posFetchBackofficeNotifications({ status, severity, limit: 50 }),
    enabled: canRead,
    refetchInterval: 15_000,
  });
  const unreadCountQuery = useQuery({
    queryKey: unreadCountQueryKey,
    queryFn: posFetchBackofficeUnreadNotificationCount,
    enabled: canRead,
    refetchInterval: 15_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => posMarkBackofficeNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "notifications"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to mark as read.");
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => posMarkAllBackofficeNotificationsRead(),
    onSuccess: (result) => {
      toast.success(`Marked ${result.modifiedCount} notification(s) as read.`);
      void queryClient.invalidateQueries({ queryKey: ["accounting", "notifications"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to mark all as read.");
    },
  });

  const unreadCount = Number(unreadCountQuery.data || 0);
  const data = notificationsQuery.data ?? [];
  const unreadRows = useMemo(() => data.filter((row) => !row.isRead).length, [data]);

  if (!canRead) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-muted-foreground">
          Notifications require{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">backoffice.accounting.read</code>.
        </p>
        <Button variant="link" asChild className="h-auto px-0">
          <Link href="/dashboard/default">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="space-y-4 border-b pb-6">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/dashboard/default">
            <ArrowLeft className="mr-2 size-4" />
            Dashboard
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 font-semibold text-3xl tracking-tight">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bell className="size-6" />
              </span>
              Notifications
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm">
              Critical and business alerts from accounting, orders, inventory, and devices.
            </p>
          </div>
          <Button
            onClick={() => markAllMutation.mutate()}
            disabled={!canWrite || markAllMutation.isPending || unreadCount <= 0}
          >
            {markAllMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCheck className="mr-2 size-4" />}
            Mark all read
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total in view</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{data.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unread in view</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{unreadRows}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unread total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{unreadCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feed</CardTitle>
          <CardDescription>Latest 50 notifications. Refreshes every 15 seconds.</CardDescription>
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="w-44">
              <Select value={status} onValueChange={(value) => setStatus(value as "all" | "unread" | "read")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={severity} onValueChange={(value) => setSeverity(value as BackofficeNotificationSeverity | "all")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {notificationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Loading notifications...
            </div>
          ) : notificationsQuery.error instanceof Error ? (
            <p className="text-destructive text-sm">{notificationsQuery.error.message}</p>
          ) : data.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-muted-foreground text-sm">
              No notifications found for current filters.
            </div>
          ) : (
            data.map((row) => (
              <div key={row._id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={severityBadgeVariant(row.severity)}>{row.severity}</Badge>
                    {!row.isRead ? <Badge variant="outline">Unread</Badge> : <Badge variant="secondary">Read</Badge>}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {row.createdAt ? formatDistanceToNow(new Date(row.createdAt), { addSuffix: true }) : "just now"}
                  </span>
                </div>
                <p className="mt-2 font-medium">{row.title}</p>
                {row.body ? <p className="mt-1 text-muted-foreground text-sm">{row.body}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={notificationHref(row)}>Open</Link>
                  </Button>
                  {!row.isRead ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canWrite || markReadMutation.isPending}
                      onClick={() => markReadMutation.mutate(row._id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
