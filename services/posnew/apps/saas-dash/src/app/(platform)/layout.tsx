"use client";

import { DashboardShellLayout } from "@restaurant-pos/ui/shell";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlatformAppSidebar } from "@/components/platform-app-sidebar";
import { PlatformSearchDialog } from "@/components/platform-search-dialog";
import { PlatformShellHeaderEnd } from "@/components/platform-shell-header-end";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionRefresh } from "@/hooks/use-session-refresh";
import { useAuthStore } from "@/lib/auth-store";
import { invalidateNotificationQueriesEverywhere } from "@/lib/notifications-cache";
import { platformApiBaseUrl } from "@/lib/platform-constants";
import { classifyPlatformAuditAction } from "@/lib/platform-critical-alerts";
import { probePlatformSessionAlive } from "@/lib/platform-public-http";
import { qk } from "@/lib/query-keys";

function emitSessionTelemetry(
	event: string,
	data: Record<string, unknown> = {},
) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent("platform-session-telemetry", {
			detail: {
				event,
				ts: Date.now(),
				...data,
			},
		}),
	);
}

export default function PlatformLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const [gate, setGate] = useState<"loading" | "ok" | "no">("loading");
	const sessionUser = useAuthStore((s) => s.user);
	useSessionRefresh(gate === "ok");

	useEffect(() => {
		let cancelled = false;
		const checkSession = async () => {
			emitSessionTelemetry("bootstrap:start");
			try {
				const ok = await useAuthStore.getState().bootstrapSession();
				if (cancelled) return;

				if (!ok) {
					emitSessionTelemetry("bootstrap:unauthenticated");
					setGate("no");
					router.replace("/login");
					return;
				}

				if (cancelled) return;
				const activeUser = useAuthStore.getState().user;
				if (!activeUser) {
					emitSessionTelemetry("bootstrap:missing-user");
					setGate("no");
					router.replace("/login");
					return;
				}

				emitSessionTelemetry("bootstrap:ok", {
					userId: activeUser.id || activeUser._id,
				});
				setGate("ok");
			} catch (err) {
				console.error("Auth bootstrap failed:", err);
				emitSessionTelemetry("bootstrap:error");
				if (!cancelled) {
					setGate("no");
					router.replace("/login");
				}
			}
		};

		checkSession();
		return () => {
			cancelled = true;
		};
	}, [router]);

	/** If the shell is up but the store no longer has a user (logout, cross-tab, or failed refresh), leave the shell. */
	useEffect(() => {
		if (gate !== "ok") return;
		if (sessionUser) return;
		setGate("no");
		router.replace("/login");
	}, [gate, sessionUser, router]);

	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);

	useEffect(() => {
		if (gate !== "ok" || !user) return;

		const url = new URL(`${platformApiBaseUrl()}/stream`);
		const es = new EventSource(url.toString(), { withCredentials: true });
		let checkingSession = false;
		let redirected = false;
		let probeTimer: ReturnType<typeof setTimeout> | null = null;

		const runProbe = async () => {
			if (checkingSession || redirected) return;
			if (typeof navigator !== "undefined" && !navigator.onLine) return;
			checkingSession = true;
			try {
				const first = await probePlatformSessionAlive();
				emitSessionTelemetry("sse:probe", { state: first });
				if (first === "offline") {
					return;
				}
				if (first === "alive") {
					return;
				}
				const recovered = await useAuthStore.getState().refreshSession();
				if (recovered || redirected) {
					if (recovered) emitSessionTelemetry("sse:recovered");
					return;
				}
				emitSessionTelemetry("sse:expired");
				redirected = true;
				es.close();
				useAuthStore.getState().logout({ sessionExpired: true });
				setGate("no");
				toast.error("Session expired. Please sign in again.");
				router.replace("/login");
			} finally {
				checkingSession = false;
			}
		};

		es.onerror = () => {
			// SSE often errors on transient network / proxy issues (e.g. incomplete chunked encoding).
			// Debounce and distinguish offline vs real auth loss before signing the user out.
			if (redirected) return;
			if (typeof navigator !== "undefined" && !navigator.onLine) return;
			if (probeTimer) return;
			probeTimer = setTimeout(() => {
				probeTimer = null;
				void runProbe();
			}, 2000);
		};

		es.addEventListener("audit", (event) => {
			queryClient.invalidateQueries({
				predicate: (query) =>
					Array.isArray(query.queryKey) &&
					query.queryKey[0] === "platform" &&
					query.queryKey[1] === "audits",
			});

			let data: Record<string, unknown> = {};
			try {
				data = JSON.parse(event.data || "{}") as Record<string, unknown>;
			} catch (err) {
				console.error("[SSE] Failed to parse audit event data:", err);
			}
			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent("platform-audit-sse", { detail: data }),
				);
			}

			try {
				const actionStr = String(data.action || "");
				const level = classifyPlatformAuditAction(actionStr);
				if (level === "critical") {
					toast.error("Critical platform event", {
						description: actionStr,
						duration: 14_000,
					});
					if (
						typeof document !== "undefined" &&
						document.visibilityState === "hidden" &&
						typeof Notification !== "undefined" &&
						Notification.permission === "granted"
					) {
						try {
							new Notification("Critical platform event", { body: actionStr });
						} catch {
							/* ignore */
						}
					}
				} else if (level === "warning") {
					toast.warning("Platform activity", {
						description: actionStr,
						duration: 9000,
					});
				}

				// Keep notification state server-authoritative across tabs.
				invalidateNotificationQueriesEverywhere(queryClient);

				if (actionStr === "device.new_pending") {
					void queryClient.invalidateQueries({ queryKey: qk.devicesListRoot });
					void queryClient.invalidateQueries({
						queryKey: qk.devicesPendingCount(),
					});
				}

				if (data.action === "platform.org.create") {
					void queryClient.invalidateQueries({
						queryKey: ["platform", "orgs"],
					});
					void queryClient.invalidateQueries({ queryKey: qk.metricsSummary });
					void queryClient.invalidateQueries({
						predicate: (q) =>
							Array.isArray(q.queryKey) &&
							q.queryKey[0] === "platform" &&
							q.queryKey[1] === "metrics" &&
							(q.queryKey[2] === "kpis" || q.queryKey[2] === "analytics"),
					});
				}
			} catch (err) {
				console.error("[SSE] Failed to process audit side-effects:", err);
				void import("@sentry/react")
					.then((Sentry) => {
						Sentry.captureException(err, {
							tags: { area: "platform-sse", event: "audit" },
						});
					})
					.catch(() => {
						/* ignore sentry import failures */
					});
			}
		});

		return () => {
			if (probeTimer) clearTimeout(probeTimer);
			es.close();
		};
	}, [gate, user, queryClient, router]);

	if (gate === "loading") {
		return (
			<div className="flex min-h-screen">
				<div className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:block" />
				<div className="flex flex-1 flex-col gap-6 p-6 pt-16 md:pt-6">
					<Skeleton className="h-8 w-40" />
					<div className="grid gap-4 md:grid-cols-3">
						<Skeleton className="h-24 rounded-xl" />
						<Skeleton className="h-24 rounded-xl" />
						<Skeleton className="h-24 rounded-xl" />
					</div>
					<Skeleton className="h-48 rounded-xl" />
				</div>
			</div>
		);
	}

	if (gate === "no") return null;

	return (
		<>
			<a
				href="#main-content"
				className="bg-background text-foreground sr-only z-[100] rounded-md border px-3 py-2 shadow focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
			>
				Skip to content
			</a>
			<DashboardShellLayout
				defaultOpen
				variant="inset"
				collapsible="icon"
				sidebar={<PlatformAppSidebar variant="inset" collapsible="icon" />}
				headerStart={<PlatformSearchDialog />}
				headerEnd={<PlatformShellHeaderEnd />}
			>
				<main id="main-content">{children}</main>
			</DashboardShellLayout>
		</>
	);
}
