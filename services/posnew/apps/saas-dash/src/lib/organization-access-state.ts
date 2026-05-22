export type OrganizationAccessState = {
	readonly status: "active" | "expired" | "not_started";
	readonly reason: string;
	readonly blocked: boolean;
};

export const DEFAULT_ORGANIZATION_ACCESS_STATE: OrganizationAccessState = {
	status: "not_started",
	reason: "Access state not available.",
	blocked: true,
};

export function readOrganizationAccessState(
	value: unknown,
): OrganizationAccessState {
	if (!value || typeof value !== "object") {
		return DEFAULT_ORGANIZATION_ACCESS_STATE;
	}
	const candidate = value as Record<string, unknown>;
	const status = candidate.status;
	const reason = candidate.reason;
	const blocked = candidate.blocked;
	if (
		(status === "active" || status === "expired" || status === "not_started") &&
		typeof reason === "string" &&
		typeof blocked === "boolean"
	) {
		return { status, reason, blocked };
	}
	return DEFAULT_ORGANIZATION_ACCESS_STATE;
}
