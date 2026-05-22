import { describe, expect, it } from "vitest";
import { classifyPlatformAuditAction } from "@/lib/platform-critical-alerts";

describe("classifyPlatformAuditAction", () => {
	it("classifies critical actions", () => {
		expect(classifyPlatformAuditAction("platform.org.delete")).toBe("critical");
	});

	it("classifies warning actions and prefixes", () => {
		expect(classifyPlatformAuditAction("platform.org.provisioning_retry")).toBe(
			"warning",
		);
		expect(classifyPlatformAuditAction("platform.impersonation.start")).toBe(
			"warning",
		);
	});

	it("falls back to info for unknown actions", () => {
		expect(classifyPlatformAuditAction("platform.unknown.action")).toBe("info");
	});
});
