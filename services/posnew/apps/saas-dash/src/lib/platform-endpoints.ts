type JobsFilter = {
	queue?: string;
	status?: string;
	limit?: number;
	offset?: number;
};

type DevicesFilter = {
	status?: "all" | "pending" | "approved" | "revoked";
	organizationId?: string;
};

function withQuery(
	path: string,
	params: Record<string, string | number | undefined>,
): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === "") continue;
		query.set(key, String(value));
	}
	const suffix = query.toString();
	return suffix ? `${path}?${suffix}` : path;
}

/**
 * Canonical platform API path builders used by owner dashboard modules.
 * Keeping these in one place prevents frontend/backend route drift.
 */
export const platformEndpoints = {
	notifications: {
		list: (scope: "all" | "unread" = "all") =>
			withQuery("/notifications", {
				unread: scope === "unread" ? "true" : undefined,
			}),
		unreadCount: () => "/notifications/unread-count",
		markOneRead: (notificationId: string) =>
			`/notifications/${encodeURIComponent(notificationId)}/read`,
		markAllRead: () => "/notifications/all/read",
	},
	jobs: {
		list: (filters: JobsFilter) =>
			withQuery("/jobs", {
				queue:
					filters.queue && filters.queue !== "all" ? filters.queue : undefined,
				status:
					filters.status && filters.status !== "all"
						? filters.status
						: undefined,
				limit: filters.limit,
				offset: filters.offset,
			}),
		detail: (queue: string, id: string) =>
			`/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(id)}`,
	},
	organizations: {
		observability: (organizationId: string) =>
			`/organizations/${encodeURIComponent(organizationId)}/observability`,
		/** Comma-separated organization ObjectIds (max 100). */
		healthSummary: (organizationIds: readonly string[]) =>
			withQuery("/organizations/health-summary", {
				ids: organizationIds.length ? organizationIds.join(",") : undefined,
			}),
	},
	devices: {
		list: (filters: DevicesFilter = {}) =>
			withQuery("/devices", {
				status:
					filters.status && filters.status !== "all"
						? filters.status
						: undefined,
				organizationId: filters.organizationId,
			}),
		pendingCount: (organizationId?: string) =>
			withQuery("/devices/pending-count", { organizationId }),
		approve: (deviceId: string, organizationId: string) =>
			withQuery(`/devices/${encodeURIComponent(deviceId)}/approve`, {
				organizationId,
			}),
		revoke: (deviceId: string, organizationId: string) =>
			withQuery(`/devices/${encodeURIComponent(deviceId)}/revoke`, {
				organizationId,
			}),
		nickname: (deviceId: string, organizationId: string) =>
			withQuery(`/devices/${encodeURIComponent(deviceId)}/nickname`, {
				organizationId,
			}),
		remove: (deviceId: string, organizationId: string) =>
			withQuery(`/devices/${encodeURIComponent(deviceId)}`, {
				organizationId,
			}),
	},
} as const;
