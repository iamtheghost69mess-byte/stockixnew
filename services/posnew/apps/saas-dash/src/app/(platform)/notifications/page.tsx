"use client";
import { cn } from "@restaurant-pos/ui";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FeedPage } from "@/components/feed-page";
import { Button } from "@/components/ui/button";
import {
	type Notification,
	notificationListResponseSchema,
} from "@/lib/api-schemas/notifications";
import { useNotificationStore } from "@/lib/notification-store";
import { invalidateNotificationQueriesEverywhere } from "@/lib/notifications-cache";
import { P } from "@/lib/permissions";
import { platformEndpoints } from "@/lib/platform-endpoints";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";

/**
 * Modernized Activity Feed.
 * Powered by the FeedPage engine, providing real-time platform signals
 * with professional severity-based aesthetics.
 */
export default function NotificationsPage() {
	const qc = useQueryClient();
	const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
	const [feedScope, setFeedScope] = useState<"all" | "unread">("all");

	const markAllReadM = useMutation({
		mutationFn: () =>
			platformJson(platformEndpoints.notifications.markAllRead(), {
				method: "POST",
			}),
		onSuccess: () => {
			invalidateNotificationQueriesEverywhere(qc);
			setUnreadCount(0);
			toast.success("Feed activity cleared.");
		},
	});

	const markOneReadM = useMutation({
		mutationFn: (notificationId: string) =>
			platformJson(
				platformEndpoints.notifications.markOneRead(notificationId),
				{ method: "POST" },
			),
		onSuccess: () => {
			invalidateNotificationQueriesEverywhere(qc);
		},
		onError: () => {
			toast.error("Failed to update notification state.");
		},
	});

	const requestDesktopAlerts = async () => {
		if (
			globalThis.window === undefined ||
			!("Notification" in globalThis.window)
		) {
			toast.error("Desktop alerts not supported.");
			return;
		}
		const r = await Notification.requestPermission();
		if (r === "granted") toast.success("Desktop alerts synchronized.");
		else toast.message(`Alert Permission: ${r}`);
	};

	const extraActions = (
		<div className="flex items-center gap-2">
			<div className="flex items-center rounded-md border bg-card/50 p-1">
				<Button
					variant={feedScope === "all" ? "secondary" : "ghost"}
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={() => setFeedScope("all")}
				>
					All
				</Button>
				<Button
					variant={feedScope === "unread" ? "secondary" : "ghost"}
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={() => setFeedScope("unread")}
				>
					Unread
				</Button>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={requestDesktopAlerts}
				className="text-muted-foreground hover:text-primary transition-colors"
			>
				<BellRing className="mr-2 h-4 w-4" />
				Sync Desktop Alerts
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={() => markAllReadM.mutate()}
				disabled={markAllReadM.isPending}
			>
				{markAllReadM.isPending && (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				)}
				Mark all read
			</Button>
		</div>
	);

	const notificationsApiPath = useMemo(() => {
		return platformEndpoints.notifications.list(feedScope);
	}, [feedScope]);

	const notificationsQueryKey = useMemo(
		() => [...qk.notificationsFeed, feedScope, notificationsApiPath] as const,
		[feedScope, notificationsApiPath],
	);

	const renderNotification = (n: Notification) => (
		<div
			className={cn(
				"group relative flex flex-col gap-1.5 rounded-xl border p-4 transition-all duration-200 hover:shadow-md bg-card",
				n.isRead ? "" : "border-primary/50 shadow-sm",
				n.severity === "critical" && "border-destructive/30 bg-destructive/5",
				n.severity === "warning" && "border-amber-500/30 bg-amber-500/5",
			)}
		>
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-2.5">
					<div
						className={cn(
							"h-2.5 w-2.5 rounded-full",
							n.isRead
								? "bg-muted-foreground/30"
								: "bg-primary animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.6)]",
							n.severity === "critical" &&
								"bg-destructive shadow-[0_0_12px_rgba(239,68,68,0.4)]",
							n.severity === "warning" &&
								"bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]",
						)}
					/>
					<h3
						className={cn(
							"text-sm font-semibold tracking-tight",
							n.isRead ? "text-muted-foreground" : "text-foreground",
						)}
					>
						{n.title}
					</h3>
				</div>
				<span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest tabular-nums">
					{new Date(n.createdAt).toLocaleTimeString()}
				</span>
			</div>

			{n.body && (
				<p className="text-sm text-muted-foreground/80 leading-relaxed ml-5">
					{n.body}
				</p>
			)}

			{n.href && (
				<Link
					href={n.href}
					className="inline-flex items-center gap-1.5 text-xs text-primary font-medium ml-5 mt-1 hover:underline group-hover:translate-x-0.5 transition-transform"
				>
					<ExternalLink className="h-3 w-3" />
					Observe Context
				</Link>
			)}

			{!n.isRead && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="mt-2 self-end text-xs"
					onClick={() => markOneReadM.mutate(n.id)}
					disabled={markOneReadM.isPending}
				>
					{markOneReadM.isPending && (
						<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
					)}
					{!markOneReadM.isPending && (
						<CheckCheck className="mr-1.5 h-3.5 w-3.5" />
					)}
					Mark read
				</Button>
			)}
		</div>
	);

	return (
		<FeedPage
			id="notifications"
			label="Signals & Alerts"
			permission={P.AUDIT_READ}
			apiPath={notificationsApiPath}
			queryKey={notificationsQueryKey}
			schema={notificationListResponseSchema}
			dataSelector={(p) => p.data}
			renderItem={renderNotification}
			title="Platform Event Feed"
			description="Real-time broadcast of critical administrative signals, provisioning events, and high-severity audit logs."
			extraActions={extraActions}
			refreshInterval={15000}
			loadingMessage="Loading notifications…"
			emptyMessage={
				feedScope === "unread"
					? "No unread notifications"
					: "No notifications yet"
			}
			emptyHint={
				feedScope === "unread"
					? "Switch to All or mark items read to clear this filter."
					: "Provisioning, security, and control-plane alerts will show here when the platform emits them."
			}
		/>
	);
}
