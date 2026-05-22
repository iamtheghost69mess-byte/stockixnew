import { describe, expect, it } from "vitest";
import { hasPermission, P, permissionsForRoles } from "@/lib/permissions";

describe("permissionsForRoles", () => {
	it("expands owner to all", () => {
		const p = permissionsForRoles(["platform_owner"]);
		expect(p).toContain(P.ORG_WRITE);
		expect(p).toContain(P.COMPLIANCE_RUN);
	});

	it("support_read is read-only surface", () => {
		const p = permissionsForRoles(["platform_support_read"]);
		expect(p).toContain(P.ORG_READ);
		expect(p).not.toContain(P.ORG_WRITE);
	});
});

describe("hasPermission", () => {
	it("owner bypasses checks", () => {
		expect(hasPermission(["platform_owner"], P.COMPLIANCE_RUN)).toBe(true);
	});

	it("org_write implies org_read", () => {
		expect(hasPermission(["platform_support_write"], P.ORG_READ)).toBe(true);
	});

	it("apiScopes from JWT/user payload are honored", () => {
		expect(hasPermission(undefined, P.ORG_READ, ["org:read"])).toBe(true);
		expect(hasPermission(undefined, P.ORG_WRITE, ["org:read"])).toBe(false);
	});
});
