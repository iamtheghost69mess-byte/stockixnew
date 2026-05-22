/** TanStack Query keys + invalidation map targets (see `invalidateAfterMutation`). */
export const qk = {
	me: ["platform", "me"] as const,
	metricsSummary: ["platform", "metrics", "summary"] as const,
	metricsKpis: (from: string, to: string) =>
		["platform", "metrics", "kpis", { from, to }] as const,
	metricsAnalytics: (from: string, to: string) =>
		["platform", "metrics", "analytics", { from, to }] as const,
	orgList: (q: string, cursor?: string | null) =>
		["platform", "orgs", { q, cursor }] as const,
	orgDetail: (id: string) => ["platform", "org", id] as const,
	orgObservability: (id: string) =>
		["platform", "org", id, "observability"] as const,
	/** Prefix for all audit list queries (SSE + invalidations match this root). */
	auditsListRoot: ["platform", "audits"] as const,
	audits: (filters?: {
		organizationId?: string | null;
		action?: string | null;
		userId?: string | null;
		from?: string | null;
		to?: string | null;
	}) => [...qk.auditsListRoot, filters ?? {}] as const,
	systemOwnerSettings: ["platform", "system-settings"] as const,
	/** Invalidates all platform webhook queries (endpoints list + outbox). */
	webhooksAll: ["platform", "webhooks"] as const,
	webhookEndpointsListRoot: ["platform", "webhooks", "endpoints"] as const,
	webhooks: (organizationId?: string | null) =>
		["platform", "webhooks", { organizationId }] as const,
	webhookOutbox: (filters?: {
		organizationId?: string | null;
		endpointId?: string | null;
		status?: string | null;
	}) => ["platform", "webhooks", "outbox", filters ?? {}] as const,
	apiKeys: ["platform", "api-keys"] as const,
	job: (queue: string, id: string) => ["platform", "job", queue, id] as const,
	jobsList: (filters: {
		queue?: string;
		status?: string;
		limit: number;
		offset: number;
	}) => ["platform", "jobs", "list", filters] as const,
	/** Prefix for jobs ResourcePage queries (filters live in query key tail). */
	jobsListRoot: ["platform", "jobs"] as const,
	organizationsListRoot: ["platform", "orgs"] as const,
	notificationsFeed: ["platform", "notifications"] as const,
	notificationsUnreadCount: [
		"platform",
		"notifications",
		"unread-count",
	] as const,
	devicesListRoot: ["platform", "devices"] as const,
	devicesList: (filters: {
		status?: "all" | "pending" | "approved" | "revoked";
		organizationId?: string;
	}) => ["platform", "devices", "list", filters] as const,
	devicesPendingCount: (organizationId?: string) =>
		["platform", "devices", "pending-count", { organizationId }] as const,
	orgsHealthSummary: (idsKey: string) =>
		["platform", "organizations", "health-summary", idsKey] as const,

	usersGlobalList: (filters: {
		skip: number;
		limit: number;
		status?: string;
		search?: string;
	}) => ["platform", "users", "global", filters] as const,
	usersGlobalListRoot: ["platform", "users", "global"] as const,
	usersGlobalDetail: (id: string) =>
		["platform", "users", "global", id] as const,

	/** Accounting & Integrations Admin */
	organizationsList: ["organizations", "list"] as const,
	flags: ["platform", "flags"] as const,
	invitations: ["platform", "invitations"] as const,
};

export type MutationName =
	| "orgCreate"
	| "orgLifecycle"
	| "orgEntitlements"
	| "orgAdminPinReset"
	| "orgDelete"
	| "bootstrap"
	| "systemSettingsPatch"
	| "complianceExport"
	| "complianceDeletion"
	| "webhookEndpoint"
	| "jobRetry"
	| "apiKeyCreate"
	| "apiKeyRevoke"
	| "globalUserStatus"
	| "globalUserReset"
	| "webhookRevoke"
	| "bootstrapComplete"
	| "webhookOutbox"
	| "devicesMutation";

/** What to invalidate after each mutation (documented map). */
export function invalidateAfterMutation(
	name: MutationName,
): (readonly unknown[])[] {
	switch (name) {
		case "orgCreate":
			return [qk.metricsSummary, ["platform", "metrics"], ["platform", "orgs"]];
		case "orgLifecycle":
		case "orgEntitlements":
		case "orgAdminPinReset":
		case "bootstrap":
		case "bootstrapComplete":
			return [
				["platform", "orgs"],
				["platform", "org"],
				qk.metricsSummary,
				["platform", "metrics"],
				["platform", "audits"],
			];
		/** Omit `["platform", "org"]` so deleting from `/organizations/:id` does not refetch that id (404). */
		case "orgDelete":
			return [
				["platform", "orgs"],
				qk.metricsSummary,
				["platform", "metrics"],
				["platform", "audits"],
			];
		case "systemSettingsPatch":
			return [qk.systemOwnerSettings];
		case "complianceExport":
		case "complianceDeletion":
			return [
				["platform", "audits"],
				["platform", "org"],
				qk.metricsSummary,
				["platform", "metrics"],
			];
		case "webhookEndpoint":
		case "webhookRevoke":
			return [qk.webhooksAll];
		case "webhookOutbox":
			return [["platform", "webhooks", "outbox"]];
		case "jobRetry":
			return [["platform", "job"], qk.jobsListRoot];
		case "apiKeyCreate":
		case "apiKeyRevoke":
			return [qk.apiKeys];
		case "globalUserStatus":
		case "globalUserReset":
			return [
				["platform", "users", "global"],
				["platform", "users", "global", "list"],
			];
		case "devicesMutation":
			return [qk.devicesListRoot];
		default:
			return [];
	}
}
