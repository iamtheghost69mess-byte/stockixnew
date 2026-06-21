"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Info,
} from "lucide-react";

import { toast } from "@/components/reusabletoast";
import { clientGet, clientPost } from "@/lib/client-fetch";
import {
  subscribeOwnerNotificationStream,
  type StreamNotification,
} from "@/lib/notification-stream-client";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/popover";
import { ScrollArea } from "@repo/ui/scroll-area";
import { Separator } from "@repo/ui/separator";
import { cn } from "@/lib/utils";

type NotificationSeverity = "info" | "success" | "warning" | "error";

type Notification = StreamNotification;

type NotificationsListResponse = {
  success?: boolean;
  data?: Notification[];
};

type CountResponse = {
  success?: boolean;
  data?: { unread?: number };
};

const LIST_LIMIT = 20;

function toastDuration(severity: NotificationSeverity): number {
  if (severity === "error") return 8000;
  if (severity === "warning") return 6000;
  if (severity === "success") return 4000;
  return 5000;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  const cls = "h-4 w-4 shrink-0 mt-0.5";
  if (severity === "error") {
    return <AlertCircle className={cn(cls, "text-destructive")} aria-hidden />;
  }
  if (severity === "warning") {
    return <AlertTriangle className={cn(cls, "text-amber-600 dark:text-amber-400")} aria-hidden />;
  }
  if (severity === "success") {
    return <CheckCircle2 className={cn(cls, "text-emerald-600 dark:text-emerald-400")} aria-hidden />;
  }
  return <Info className={cn(cls, "text-muted-foreground")} aria-hidden />;
}

function showNotificationToast(
  notification: Notification,
  onNavigate: (url: string) => void,
): void {
  const actionUrl = notification.actionUrl?.trim();
  const options = {
    description: notification.body,
    duration: toastDuration(notification.severity),
    ...(actionUrl
      ? {
          action: {
            label: notification.actionLabel ?? "View",
            onClick: () => onNavigate(actionUrl),
          },
        }
      : {}),
  };

  if (notification.severity === "error") {
    toast.error(notification.title, options);
  } else if (notification.severity === "warning") {
    toast.warning(notification.title, options);
  } else if (notification.severity === "success") {
    toast.success(notification.title, options);
  } else {
    toast.raw(notification.title, options);
  }
}

function NotificationItem({
  notification: n,
  onClick,
  onMarkRead,
}: {
  notification: Notification;
  onClick: () => void;
  onMarkRead: (e: React.MouseEvent) => void;
}) {
  const isUnread = !n.readAt;

  return (
    <div
      className={cn(
        "group flex gap-3 border-b px-4 py-3 last:border-0",
        "cursor-pointer transition-colors hover:bg-muted/50",
        isUnread && "bg-blue-50/50 dark:bg-blue-950/20",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <SeverityIcon severity={n.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("truncate text-sm", isUnread ? "font-semibold" : "font-medium")}>
            {n.title}
          </p>
          {isUnread ? (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
              aria-label="Unread"
            />
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
          <div className="flex items-center gap-1">
            {n.actionUrl ? (
              <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                {n.actionLabel ?? "View"}
                <ExternalLink className="h-3 w-3 opacity-70" />
              </span>
            ) : null}
            {isUnread ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Mark as read"
                onClick={onMarkRead}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const mergeNotification = useCallback((notification: Notification): void => {
    setNotifications((prev) => {
      if (prev.some((n) => n.id === notification.id)) return prev;
      return [notification, ...prev].slice(0, LIST_LIMIT);
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        clientGet<NotificationsListResponse>(`/notifications?limit=${LIST_LIMIT}`),
        clientGet<CountResponse>("/notifications/count"),
      ]);
      const items = notifRes.data ?? [];
      setNotifications(items);
      setUnreadCount(countRes.data?.unread ?? 0);
      setHasMore(items.length === LIST_LIMIT);
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    return subscribeOwnerNotificationStream({
      onConnected: (unread) => {
        if (typeof unread === "number") setUnreadCount(unread);
      },
      onPrime: mergeNotification,
      onLive: (notification) => {
        mergeNotification(notification);
        setUnreadCount((prev) => prev + 1);
        showNotificationToast(notification, (url) => router.push(url));
      },
    });
  }, [mergeNotification, router]);

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const snapshot = notifications;
    const countSnapshot = unreadCount;
    const readAt = new Date().toISOString();

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await clientPost(`/notifications/${id}/read`);
    } catch {
      setNotifications(snapshot);
      setUnreadCount(countSnapshot);
      toast.error("Failed to mark as read");
    }
  };

  const handleMarkAllRead = async () => {
    const snapshot = notifications;
    const countSnapshot = unreadCount;
    const readAt = new Date().toISOString();

    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? readAt })));
    setUnreadCount(0);

    try {
      await clientPost("/notifications/read-all");
    } catch {
      setNotifications(snapshot);
      setUnreadCount(countSnapshot);
      toast.error("Failed to mark all as read");
    }
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.readAt) void handleMarkRead(n.id);
    const url = n.actionUrl?.trim();
    if (url) {
      setOpen(false);
      router.push(url);
    }
  };

  const unread = notifications.filter((n) => !n.readAt);
  const read = notifications.filter((n) => n.readAt);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative shrink-0"
            aria-label={
              unreadCount > 0
                ? `${unreadCount} unread notifications`
                : "Notifications"
            }
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="z-50 bg-background border shadow-md rounded-md w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 ? (
              <p className="text-xs text-muted-foreground">{unreadCount} new</p>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 text-xs"
              onClick={() => void handleMarkAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <ScrollArea className="h-[min(24rem,70vh)]">
          {loading ? (
            <div className="space-y-0 p-0">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 border-b px-4 py-3 last:border-0">
                  <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-2 w-full animate-pulse rounded bg-muted" />
                    <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">All caught up</p>
              <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                No notifications yet. Tenant provisioning, license changes, and job
                alerts will appear here.
              </p>
            </div>
          ) : (
            <>
              {unread.length > 0 ? (
                <div>
                  <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    New
                  </p>
                  {unread.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onClick={() => handleNotificationClick(n)}
                      onMarkRead={(e) => void handleMarkRead(n.id, e)}
                    />
                  ))}
                </div>
              ) : null}
              {read.length > 0 ? (
                <div>
                  {unread.length > 0 ? (
                    <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Earlier
                    </p>
                  ) : null}
                  {read.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onClick={() => handleNotificationClick(n)}
                      onMarkRead={(e) => void handleMarkRead(n.id, e)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </ScrollArea>

        {notifications.length > 0 ? (
          <>
            <Separator />
            <p className="px-4 py-2 text-center text-[11px] text-muted-foreground">
              Showing last {notifications.length} notification
              {notifications.length === 1 ? "" : "s"}
              {hasMore ? " (more in database)" : ""}
            </p>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
