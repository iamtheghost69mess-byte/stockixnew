"use client";

import { useAuthStore } from "@/lib/auth-store";
import { hasPermission, type PlatformPermission } from "@/lib/permissions";

function readApiScopes(
	user: Record<string, unknown> | null | undefined,
): string[] {
	if (!user || typeof user !== "object") return [];
	const raw = user.apiScopes ?? user.scopes;
	if (!Array.isArray(raw)) return [];
	return raw.filter((x): x is string => typeof x === "string");
}

/**
 * `undefined` means the platform user is not loaded yet (or was cleared) — callers must not
 * treat that as “denied” or they will redirect to /unauthorized during session transitions.
 */
export function usePermission(
	permission: PlatformPermission,
): boolean | undefined {
	const user = useAuthStore((s) => s.user);
	if (!user) return undefined;
	const roles = user.roles as string[] | undefined;
	const apiScopes = readApiScopes(user);
	return hasPermission(roles, permission, apiScopes);
}
