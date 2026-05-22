/**
 * Mirrors `apps/pos-backend/constants/platformPermissions.js` for UX-only checks.
 * The API remains the source of truth.
 */
export const P = {
	ORG_READ: "org:read",
	ORG_WRITE: "org:write",
	METRICS_READ: "metrics:read",
	WEBHOOK_ADMIN: "webhook:admin",
	QUEUE_ADMIN: "queue:admin",
	FLAG_ADMIN: "flag:admin",
	IMPERSONATE: "impersonate",
	COMPLIANCE_RUN: "compliance:run",
	INVITE_ADMIN: "invite:admin",
	AUDIT_READ: "audit:read",
} as const;

export type PlatformPermission = (typeof P)[keyof typeof P];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PlatformPermission[]> = {
	platform_owner: Object.values(P),
	platform_support_read: [
		P.ORG_READ,
		P.METRICS_READ,
		P.AUDIT_READ,
	],
	platform_support_write: [
		P.ORG_READ,
		P.ORG_WRITE,
		P.METRICS_READ,
		P.AUDIT_READ,
		P.WEBHOOK_ADMIN,
		P.INVITE_ADMIN,
		P.FLAG_ADMIN,
		P.COMPLIANCE_RUN,
		P.IMPERSONATE,
	],
	platform_finance: [P.ORG_READ, P.METRICS_READ, P.AUDIT_READ, P.COMPLIANCE_RUN],
	platform_engineer: [
		P.ORG_READ,
		P.METRICS_READ,
		P.QUEUE_ADMIN,
		P.FLAG_ADMIN,
		P.AUDIT_READ,
		P.COMPLIANCE_RUN,
	],
};

export function permissionsForRoles(
	roles: string[] | undefined,
	apiScopes: string[] = [],
): string[] {
	const set = new Set<string>(apiScopes);
	for (const r of roles || []) {
		const perms = ROLE_DEFAULT_PERMISSIONS[r];
		if (perms) perms.forEach((x) => set.add(x));
	}
	return [...set];
}

export function hasPermission(
	roles: string[] | undefined,
	permission: PlatformPermission,
	apiScopes: string[] = [],
): boolean {
	if ((roles || []).includes("platform_owner")) return true;
	const eff = permissionsForRoles(roles, apiScopes);
	if (permission === P.ORG_READ && eff.includes(P.ORG_WRITE)) return true;
	return eff.includes(permission);
}
