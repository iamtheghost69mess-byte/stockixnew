"use client";

import {
	DashboardAppSidebar,
	NavUser,
	SidebarSupportCard,
} from "@restaurant-pos/ui/shell";
import { useQuery } from "@tanstack/react-query";
import { Command } from "lucide-react";
import type { ComponentProps } from "react";
import { useEffect, useMemo } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { getPendingDevicesCount } from "@/lib/devices-api";
import { useNotificationStore } from "@/lib/notification-store";
import { hasPermission } from "@/lib/permissions";
import { platformEndpoints } from "@/lib/platform-endpoints";
import { platformJson } from "@/lib/platform-http";
import { useOperatorPrefsStore } from "@/lib/operator-prefs-store";
import { qk } from "@/lib/query-keys";
import { platformNavEntries } from "@/navigation/platform-sidebar-items";

export type PlatformAppSidebarProps = Omit<
	ComponentProps<typeof DashboardAppSidebar>,
	"brand" | "groups" | "footer"
>;

function readApiScopes(
	user: Record<string, unknown> | null | undefined,
): string[] {
	if (!user || typeof user !== "object") return [];
	// Use apiScopes as primary, fallback to 'scopes' for legacy compatibility
	const raw = user.apiScopes ?? user.scopes;
	if (!Array.isArray(raw)) return [];
	return raw.filter((x): x is string => typeof x === "string");
}

function readRoles(user: Record<string, unknown> | null | undefined): string[] {
	if (!user || typeof user !== "object") return [];
	const rawRoles = user.roles;
	if (!Array.isArray(rawRoles)) return [];
	return rawRoles.filter((role): role is string => typeof role === "string");
}

export function PlatformAppSidebar(props: Readonly<PlatformAppSidebarProps>) {
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const unreadNotifications = useNotificationStore((s) => s.unreadCount);
	const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
	const auditsDefaultOrgId = useOperatorPrefsStore((s) => s.auditsDefaultOrgId);

	const { data: serverUnreadCount } = useQuery({
		queryKey: qk.notificationsUnreadCount,
		queryFn: async () => {
			const raw = await platformJson<{ count?: number }>(
				platformEndpoints.notifications.unreadCount(),
			);
			return raw.count || 0;
		},
		enabled: !!user,
	});
	const { data: pendingDevicesCount = 0 } = useQuery({
		queryKey: qk.devicesPendingCount(auditsDefaultOrgId || undefined),
		queryFn: () =>
			getPendingDevicesCount(
				auditsDefaultOrgId ? auditsDefaultOrgId : undefined,
			),
		enabled: Boolean(user),
	});

	// Sync server unread count with store
	useEffect(() => {
		if (serverUnreadCount !== undefined) {
			setUnreadCount(serverUnreadCount);
		}
	}, [serverUnreadCount, setUnreadCount]);

	const groups = useMemo(() => {
		const roles = readRoles(user as Record<string, unknown> | null | undefined);
		const apiScopes = readApiScopes(
			user as Record<string, unknown> | null | undefined,
		);

		const filtered = platformNavEntries.filter((e) =>
			!e.hidden && hasPermission(roles, e.perm, apiScopes),
		);

		const platformItems = filtered
			.filter((e) => !e.category || e.category === "platform")
			.map(({ perm: _p, category: _c, ...item }) => {
				// Attach badge to Notifications
				if (item.url === "/notifications" && unreadNotifications > 0) {
					return { ...item, badge: unreadNotifications };
				}
				return item;
			});

		const settingsItems = filtered
			.filter((e) => e.category === "settings")
			.map(({ perm: _p, category: _c, ...item }) => item);
		const securityItems = filtered
			.filter((e) => e.category === "security")
			.map(({ perm: _p, category: _c, ...item }) => {
				if (item.url === "/devices" && pendingDevicesCount > 0) {
					return { ...item, badge: pendingDevicesCount };
				}
				return item;
			});

		const result = [];
		if (platformItems.length > 0) {
			result.push({ id: 1, label: "Platform", items: platformItems });
		}
		if (securityItems.length > 0) {
			result.push({ id: 2, label: "Security", items: securityItems });
		}
		if (settingsItems.length > 0) {
			result.push({ id: 3, label: "Settings", items: settingsItems });
		}
		return result;
	}, [pendingDevicesCount, unreadNotifications, user]);

	const email = typeof user?.email === "string" ? user.email : "";
	const name = typeof user?.name === "string" ? user.name : "";
	const displayName = name || (email ? email.split("@")[0] : "Operator");

	return (
		<DashboardAppSidebar
			{...props}
			brand={{ href: "/", label: "Platform", icon: Command }}
			groups={groups}
			footer={
				<>
					  {/**
         *  <SidebarSupportCard />
         */}
					<NavUser
						user={{
							name: displayName,
							email: email || "Signed in",
							avatar: "",
						}}
						onLogout={() => {
							logout();
							if (globalThis.window !== undefined) {
								globalThis.window.location.replace("/login");
							}
						}}
					/>
				</>
			}
		/>
	);
}
