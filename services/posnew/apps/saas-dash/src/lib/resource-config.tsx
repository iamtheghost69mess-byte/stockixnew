"use client";

import type { ReactNode } from "react";
import type * as z from "zod";
import { HealthDot } from "@/components/owner/health-dot";
import { apiKeyListResponseSchema } from "@/lib/api-schemas/api-keys";
import { auditListResponseSchema } from "@/lib/api-schemas/audits";
import { featureFlagListResponseSchema } from "@/lib/api-schemas/flags";
import { jobListResponseSchema } from "@/lib/api-schemas/jobs";
import {
	type OrganizationHealthSummaryRow,
	organizationListResponseSchema,
} from "@/lib/api-schemas/organizations";
import { orgInvitationListResponseSchema } from "@/lib/api-schemas/team";
import { platformGlobalUserListResponseSchema } from "@/lib/api-schemas/users";
import {
	webhookListResponseSchema,
	webhookOutboxListResponseSchema,
} from "@/lib/api-schemas/webhooks";
import type { PlatformPermission } from "@/lib/permissions";
import { qk } from "@/lib/query-keys";

/** Passed to {@link ResourceDefinition.listMetaSelector} for offset pagination. */
export type ResourceListMetaContext = {
	readonly pageOffset: number;
	readonly pageSize: number;
};

export type ResourcePagination =
	| {
			readonly kind: "cursor";
			readonly cursorParam?: string;
			readonly limitParam?: string;
			readonly pageSize?: number;
	  }
	| {
			readonly kind: "offset";
			readonly offsetParam?: string;
			readonly limitParam?: string;
			readonly pageSize?: number;
	  };

export type ResourceField = {
	key: string;
	label: string;
	type:
		| "text"
		| "badge"
		| "date"
		| "link"
		| "money"
		| "switch"
		| "progress"
		| "custom";
	href?: (row: any) => string;
	variant?: (val: any) => "default" | "outline" | "destructive" | "secondary";
	/** Optional ID for actions triggered by this field (e.g. toggling a switch). */
	actionId?: string;
	/** Optional: check if the switch should be disabled. */
	disabled?: (row: any) => boolean;
	/** Optional: custom render hook for complex cell content. */
	render?: (row: any) => ReactNode;
};

export interface ResourceDefinition {
	id: string;
	label: string;
	permission: PlatformPermission;
	apiPath: string;
	schema: z.ZodType<any>;
	columns: ResourceField[];
	/**
	 * Selects the array of data from the parsed response.
	 * Resolves SRP violation in the generator by making data extraction metadata-driven.
	 */
	dataSelector: (parsed: any) => any[];
	/** Optional override for the search query parameter name (default: 'search'). */
	searchParam?: string;
	/**
	 * When set, TanStack Query keys are `[...queryKeyBase, { search, queryParams }]`
	 * so mutations/SSE can invalidate via the same prefix (e.g. `qk.flags`).
	 */
	queryKeyBase?: readonly unknown[];
	/** Cursor- or offset-based paging; driven by {@link ResourcePage}. */
	pagination?: ResourcePagination;
	/**
	 * Extract paging tokens from the parsed API body (cursor `nextCursor` or offset `hasMore`).
	 */
	listMetaSelector?: (
		parsed: Record<string, unknown>,
		ctx: ResourceListMetaContext,
	) => {
		readonly nextCursor?: string | null;
		readonly hasMore?: boolean;
	};
}

/**
 * Master Registry for Metadata-Driven UI.
 * This registry defines how professional management pages are rendered dynamically.
 */
export const ResourceRegistry: Record<string, ResourceDefinition> = {
	organizations: {
		id: "organizations",
		label: "Organizations",
		permission: "org:read",
		apiPath: "/organizations",
		queryKeyBase: qk.organizationsListRoot,
		schema: organizationListResponseSchema,
		dataSelector: (p) => p.data || [],
		searchParam: "q",
		pagination: {
			kind: "cursor",
			pageSize: 50,
			limitParam: "limit",
			cursorParam: "cursor",
		},
		listMetaSelector: (p) => ({
			nextCursor: (p.nextCursor as string | null | undefined) ?? null,
		}),
		columns: [
			{
				key: "name",
				label: "Organization Name",
				type: "link",
				href: (o) => `/organizations/${o._id}`,
			},
			{
				key: "ownerHealth",
				label: "Health",
				type: "custom",
				render: (row: Record<string, unknown>) => {
					const h = row.ownerHealthSummary as
						| OrganizationHealthSummaryRow
						| null
						| undefined;
					const level =
						h?.healthLevel === "ok" ||
						h?.healthLevel === "degraded" ||
						h?.healthLevel === "down"
							? h.healthLevel
							: "unknown";
					return (
						<div className="flex items-center gap-2">
							<HealthDot level={level} />
							<span className="text-xs text-muted-foreground tabular-nums">
								{typeof h?.usersCount === "number" ? h.usersCount : "—"}
							</span>
						</div>
					);
				},
			},
			{ key: "slug", label: "Slug", type: "text" },
			{ key: "ownerEmail", label: "Owner Email", type: "text" },
			{
				key: "accessState.status",
				label: "Status",
				type: "badge",
				variant: (v) => {
					if (v === "active") return "default";
					if (v === "not_started") return "secondary";
					return "destructive";
				},
			},
			{ key: "createdAt", label: "Provisioned", type: "date" },
		],
	},
	invitations: {
		id: "invitations",
		label: "Team Invitations",
		permission: "invite:admin",
		apiPath: "/invitations",
		schema: orgInvitationListResponseSchema,
		dataSelector: (p) => p.data || [],
		columns: [
			{ key: "email", label: "Recipient Email", type: "text" },
			{ key: "organization.name", label: "Target Organization", type: "text" },
			{
				key: "roleHint",
				label: "Role Hint",
				type: "badge",
				variant: () => "secondary",
			},
			{ key: "expiresAt", label: "Expires", type: "date" },
			{ key: "createdAt", label: "Sent", type: "date" },
		],
	},
	users: {
		id: "users",
		label: "Global Users",
		permission: "org:read",
		apiPath: "/users/global",
		queryKeyBase: qk.usersGlobalListRoot,
		schema: platformGlobalUserListResponseSchema,
		dataSelector: (p) => p.data?.users || [],
		pagination: {
			kind: "offset",
			pageSize: 50,
			limitParam: "limit",
			offsetParam: "skip",
		},
		listMetaSelector: (p, ctx) => {
			const data = p.data as { users?: unknown[]; total?: number } | undefined;
			const n = data?.users?.length ?? 0;
			const total = data?.total ?? 0;
			return { hasMore: ctx.pageOffset + n < total };
		},
		columns: [
			{
				key: "email",
				label: "Email",
				type: "link",
				href: (u) => `/users/${u._id}`,
			},
			{ key: "name", label: "Name", type: "text" },
			{ key: "role", label: "Role", type: "badge", variant: () => "outline" },
			{ key: "organization.name", label: "Target Organization", type: "text" },
			{
				key: "status",
				label: "Status",
				type: "badge",
				variant: (v) => (v === "suspended" ? "destructive" : "default"),
			},
		],
	},
	apiKeys: {
		id: "apiKeys",
		label: "API Keys",
		permission: "org:read",
		apiPath: "/auth/api-keys",
		queryKeyBase: qk.apiKeys,
		schema: apiKeyListResponseSchema,
		dataSelector: (p) => p.data || [],
		columns: [
			{ key: "keyPrefix", label: "Prefix", type: "text" },
			{ key: "label", label: "Label", type: "text" },
			{ key: "lastUsedAt", label: "Last Used", type: "date" },
			{ key: "createdAt", label: "Created", type: "date" },
		],
	},
	webhooks: {
		id: "webhooks",
		label: "Webhook Endpoints",
		permission: "webhook:admin",
		apiPath: "/webhooks/endpoints",
		queryKeyBase: qk.webhookEndpointsListRoot,
		schema: webhookListResponseSchema,
		dataSelector: (p) => p.data || [],
		columns: [
			{ key: "organization", label: "Org ID", type: "text" },
			{ key: "url", label: "URL", type: "text" },
			{
				key: "disabled",
				label: "Status",
				type: "badge",
				variant: (v) => (v ? "secondary" : "default"),
			},
			{ key: "createdAt", label: "Registered", type: "date" },
		],
	},
	webhookOutbox: {
		id: "webhookOutbox",
		label: "Delivery Log (Outbox)",
		permission: "webhook:admin",
		apiPath: "/webhooks/outbox",
		schema: webhookOutboxListResponseSchema,
		dataSelector: (p) => p.data || [],
		columns: [
			{ key: "createdAt", label: "Timestamp", type: "date" },
			{
				key: "status",
				label: "Status",
				type: "badge",
				variant: (v) => (v === "failed" ? "destructive" : "secondary"),
			},
			{ key: "eventType", label: "Event", type: "text" },
			{ key: "attemptCount", label: "Attempts", type: "text" },
			{ key: "lastError", label: "Last Error", type: "text" },
			{ key: "payloadPreview", label: "Payload Preview", type: "text" },
		],
	},
	jobs: {
		id: "jobs",
		label: "Background Jobs",
		permission: "queue:admin",
		apiPath: "/jobs",
		queryKeyBase: qk.jobsListRoot,
		schema: jobListResponseSchema,
		dataSelector: (p) => p.data || [],
		pagination: {
			kind: "offset",
			pageSize: 50,
			limitParam: "limit",
			offsetParam: "offset",
		},
		listMetaSelector: (p, ctx) => ({
			hasMore:
				(p.data as unknown[] | undefined)?.length === ctx.pageSize &&
				ctx.pageSize > 0,
		}),
		columns: [
			{ key: "id", label: "Job ID", type: "text" },
			{ key: "name", label: "Job Name", type: "text" },
			{
				key: "state",
				label: "State",
				type: "badge",
				variant: (v) => (v === "failed" ? "destructive" : "default"),
			},
			{ key: "progress", label: "Progress", type: "progress" },
			{ key: "timestamp", label: "Created", type: "date" },
		],
	},
	audits: {
		id: "audits",
		label: "Platform Audits",
		permission: "audit:read",
		apiPath: "/audits",
		queryKeyBase: qk.auditsListRoot,
		schema: auditListResponseSchema,
		dataSelector: (p) => p.data || [],
		columns: [
			{ key: "action", label: "Action", type: "text" },
			{ key: "organization", label: "Organization/Ctx", type: "text" },
			{ key: "actorPlatformUser", label: "Actor ID", type: "text" },
			{ key: "createdAt", label: "Timestamp", type: "date" },
		],
	},
	flags: {
		id: "flags",
		label: "Feature Flags",
		permission: "flag:admin",
		apiPath: "/flags",
		queryKeyBase: qk.flags,
		schema: featureFlagListResponseSchema,
		dataSelector: (p) => p.data || [],
		columns: [
			{ key: "key", label: "Flag Key", type: "text" },
			{ key: "description", label: "Description", type: "text" },
			{
				key: "defaultEnabled",
				label: "Default state",
				type: "switch",
				actionId: "toggle-default",
			},
			{
				key: "killSwitch",
				label: "Emergency Kill",
				type: "switch",
				actionId: "toggle-kill",
				variant: (v) => (v ? "destructive" : "default"),
			},
			{ key: "rolloutPercent", label: "Rollout %", type: "text" },
			{ key: "updatedAt", label: "Last modified", type: "date" },
		],
	},
};
