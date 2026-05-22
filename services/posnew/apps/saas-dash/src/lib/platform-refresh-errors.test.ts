import { describe, expect, it } from "vitest";
import { isRefreshReuseResponse } from "@/lib/platform-refresh-errors";

describe("isRefreshReuseResponse", () => {
	it("detects PLATFORM_REFRESH_REUSE in problem-shaped body", () => {
		expect(
			isRefreshReuseResponse({ code: "PLATFORM_REFRESH_REUSE", status: 401 }),
		).toBe(true);
	});

	it("returns false for other payloads", () => {
		expect(isRefreshReuseResponse(null)).toBe(false);
		expect(isRefreshReuseResponse({ code: "OTHER" })).toBe(false);
	});
});
