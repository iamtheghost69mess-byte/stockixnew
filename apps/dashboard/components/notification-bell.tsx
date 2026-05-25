"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { toast } from "@/components/reusabletoast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type NotificationSeverity = "info" | "success" | "warning" | "error";

type Notification = {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  tenantId?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  readAt: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
};

type NotificationsListResponse = {
  success?: boolean;
  data?: Notification[];
};

type CountResponse = {
  success?: boolean;
  data?: { unread?: number };
};

function toastDuration(severity: NotificationSeverity): number {
  if (severity === "error") return 8000;
  if (severity === "warning") return 6000;
  if (severity === "success") return 4000;
  return 5000;
}

function severityIcon(severity: NotificationSeverity): string {
  if (severity === "error") return "🔴";
  if (severity === "warning") return "🟡";
  if (severity === "success") return "🟢";
  return "🔵";
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const refreshCounts = useCallback(async () => {
    const countRes = await fetch("/api/notifications/count", { cache: "no-store" });
    if (countRes.ok) {
      const countJson = await readJson<CountResponse>(countRes);
      setUnreadCount(countJson.data?.unread ?? 0);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [notifRes, countRes] = await Promise.all([
          fetch("/api/notifications?limit=20", { cache: "no-store" }),
          fetch("/api/notifications/count", { cache: "no-store" }),
        ]);
        if (notifRes.ok) {
          const notifJson = await readJson<NotificationsListResponse>(notifRes);
          setNotifications(notifJson.data ?? []);
        }
        if (countRes.ok) {
          const countJson = await readJson<CountResponse>(countRes);
          setUnreadCount(countJson.data?.unread ?? 0);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    esRef.current = es;

    const onConnected = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as { unread?: number };
        if (typeof data.unread === "number") {
          setUnreadCount(data.unread);
        }
      } catch {
        /* ignore */
      }
    };

    const onNotification = (ev: MessageEvent) => {
      let notification: Notification;
      try {
        notification = JSON.parse(String(ev.data)) as Notification;
      } catch {
        return;
      }

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev];
      });
      setUnreadCount((prev) => prev + 1);

      const toastFn =
        notification.severity === "error"
          ? toast.error
          : notification.severity === "warning"
            ? toast.warning
            : notification.severity === "success"
              ? toast.success
              : toast.raw;

      const actionUrl = notification.actionUrl?.trim();
      toastFn(notification.title, {
        description: notification.body,
        duration: toastDuration(notification.severity),
        ...(actionUrl
          ? {
              action: {
                label: notification.actionLabel ?? "View",
                onClick: () => router.push(actionUrl),
              },
            }
          : {}),
      });
    };

    es.addEventListener("connected", onConnected);
    es.addEventListener("notification", onNotification);
    es.addEventListener("ping", () => {
      /* keep-alive */
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      es.close();
      window.setTimeout(() => {
        void refreshCounts();
      }, 5000);
    };

    return () => {
      es.removeEventListener("connected", onConnected);
      es.removeEventListener("notification", onNotification);
      es.close();
      esRef.current = null;
    };
  }, [refreshCounts, router]);

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  };

  const openNotification = (n: Notification) => {
    if (!n.readAt) void handleMarkRead(n.id);
    const url = n.actionUrl?.trim();
    if (url) router.push(url);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative shrink-0" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void handleMarkAllRead()}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <ScrollArea className="h-[min(24rem,70vh)]">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    !n.readAt && "bg-muted/20",
                  )}
                  onClick={() => openNotification(n)}
                >
                  <span className="mt-0.5 text-base leading-none" aria-hidden>
                    {severityIcon(n.severity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {!n.readAt ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                    {n.actionLabel && n.actionUrl ? (
                      <p className="mt-1 text-xs text-primary">{n.actionLabel} →</p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
