import type { NavMainItem } from "@restaurant-pos/ui/shell";
import {
	Bell,
	Building2,
	ClipboardList,
	Code2,
	KeyRound,
	LayoutDashboard,
	ListTree,
	Monitor,
	Settings2,
	Users,
	Webhook,
	Wrench,
} from "lucide-react";
import { P, type PlatformPermission } from "@/lib/permissions";

export type PlatformNavEntry = NavMainItem & {
	readonly perm: PlatformPermission;
	readonly category?: "platform" | "settings" | "security";
	readonly hidden?: boolean;
};

export const platformNavEntries: readonly PlatformNavEntry[] = [
	{
		title: "Overview",
		url: "/",
		icon: LayoutDashboard,
		perm: P.METRICS_READ,
		category: "platform",
	},
	{
		title: "Organizations",
		url: "/organizations",
		icon: Building2,
		perm: P.ORG_READ,
		category: "platform",
	},
	{
		title: "Global Users",
		url: "/users",
		icon: Users,
		perm: P.ORG_READ,
		category: "platform",
	},
	{
		title: "Jobs",
		url: "/jobs",
		icon: ListTree,
		perm: P.QUEUE_ADMIN,
		category: "platform",
	},
	{
		title: "Notifications",
		url: "/notifications",
		icon: Bell,
		perm: P.AUDIT_READ,
		category: "platform",
	},
	{
		title: "Reports",
		url: "/reports",
		icon: ClipboardList,
		perm: P.METRICS_READ,
		category: "platform",
	},
	{
		title: "Audits",
		url: "/audits",
		icon: ClipboardList,
		perm: P.AUDIT_READ,
		category: "platform",
	},
	{
		title: "Webhooks",
		url: "/webhooks",
		icon: Webhook,
		perm: P.WEBHOOK_ADMIN,
		category: "platform",
	},
	{
		title: "Compliance",
		url: "/compliance",
		icon: ClipboardList,
		perm: P.COMPLIANCE_RUN,
		category: "platform",
	},
	{
		title: "API keys",
		url: "/api-keys",
		icon: KeyRound,
		perm: P.ORG_WRITE,
		category: "platform",
	},
	{
		title: "Developers",
		url: "/developers",
		icon: Code2,
		perm: P.ORG_READ,
		category: "platform",
	},
	{
		title: "Devices",
		url: "/devices",
		icon: Monitor,
		perm: P.ORG_READ,
		category: "security",
	},

	// Settings group
	{
		title: "System",
		url: "/system",
		icon: Wrench,
		perm: P.ORG_WRITE,
		category: "settings",
	},
	{
		title: "Flags",
		url: "/flags",
		icon: Settings2,
		perm: P.FLAG_ADMIN,
		category: "settings",
	},
	{
		title: "Team",
		url: "/team",
		icon: Users,
		perm: P.INVITE_ADMIN,
		category: "settings",
	},
];
