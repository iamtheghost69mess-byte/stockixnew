"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BackofficeNotificationDoc } from "@/lib/pos-accounting-api";
import { posFetchBackofficeNotifications, posFetchBackofficeUnreadNotificationCount } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { cn } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const unreadCountQueryKey = ["accounting", "notifications", "unread-count"] as const;

const PREVIEW_LIMIT = 5;

function severityDotClass(severity: BackofficeNotificationDoc["severity"]): string {
  if (severity === "critical") return "bg-destructive";
  if (severity === "warning") return "bg-amber-500 dark:bg-amber-400";
  return "bg-primary";
}

function notificationTargetHref(n: BackofficeNotificationDoc): string {
  const href = n.href?.trim();
  return href && href.length > 0 ? href : "/dashboard/notifications";
}

function sortNewestFirst(items: readonly BackofficeNotificationDoc[]): BackofficeNotificationDoc[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

export function NotificationBell() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: unreadCountQueryKey,
    queryFn: posFetchBackofficeUnreadNotificationCount,
    enabled: canRead,
    refetchInterval: 15_000,
  });

  const previewQuery = useQuery({
    queryKey: ["accounting", "notifications", "preview", PREVIEW_LIMIT] as const,
    queryFn: () =>
      posFetchBackofficeNotifications({
        status: "all",
        severity: "all",
        limit: PREVIEW_LIMIT,
      }),
    enabled: canRead && menuOpen,
    staleTime: 20_000,
  });

  const previewItems = useMemo(() => sortNewestFirst(previewQuery.data ?? []), [previewQuery.data]);

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  if (!canRead) {
    return (
      <Button asChild size="icon" variant="outline" className="relative shrink-0" aria-label="Notifications">
        <Link prefetch={false} href="/dashboard/notifications">
          <Bell className="size-4" />
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="relative shrink-0"
          aria-label="Notifications menu"
          aria-haspopup="menu"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
              {displayCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[min(calc(100vw-2rem),20rem)] overflow-hidden p-0 shadow-lg"
      >
        <div className="border-b bg-muted/30 px-3 py-2.5">
          <p className="font-semibold text-foreground text-sm leading-none">Notifications</p>
          <p className="mt-1 text-muted-foreground text-xs leading-snug">
            {unreadCount > 0 ? `${unreadCount} unread` : "No unread items"}
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {previewQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              <span className="text-xs">Loading…</span>
            </div>
          ) : previewQuery.isError ? (
            <p className="px-3 py-6 text-center text-destructive text-xs">Could not load notifications.</p>
          ) : previewItems.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">You&apos;re all caught up.</p>
          ) : (
            <div className="py-1">
              {previewItems.map((n) => (
                <DropdownMenuItem
                  key={n._id}
                  asChild
                  className="h-auto cursor-pointer rounded-none px-0 py-0 focus:bg-accent"
                >
                  <Link
                    prefetch={false}
                    href={notificationTargetHref(n)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm outline-none",
                      !n.isRead && "bg-muted/40",
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", severityDotClass(n.severity))}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("line-clamp-2 text-foreground leading-snug", !n.isRead && "font-semibold")}>
                        {n.title || "Notification"}
                      </span>
                      {n.body ? (
                        <span className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-snug">{n.body}</span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                        {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : "Recently"}
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem asChild className="cursor-pointer rounded-sm px-2 py-2">
            <Link
              prefetch={false}
              href="/dashboard/notifications"
              className="flex w-full items-center justify-between gap-2 font-medium text-sm"
              onClick={() => setMenuOpen(false)}
            >
              <span>View all notifications</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
