import { describe, expect, it } from "vitest";

import { platformEndpoints } from "@/lib/platform-endpoints";

describe("platformEndpoints.notifications", () => {
	it("builds all notifications path", () => {
		expect(platformEndpoints.notifications.list("all")).toBe("/notifications");
	});

	it("builds unread notifications path", () => {
		expect(platformEndpoints.notifications.list("unread")).toBe(
			"/notifications?unread=true",
		);
	});

	it("builds mark-all-read path", () => {
		expect(platformEndpoints.notifications.markAllRead()).toBe(
			"/notifications/all/read",
		);
	});

	it("builds unread-count path", () => {
		expect(platformEndpoints.notifications.unreadCount()).toBe(
			"/notifications/unread-count",
		);
	});

	it("builds mark-one-read path safely", () => {
		expect(platformEndpoints.notifications.markOneRead("abc/123")).toBe(
			"/notifications/abc%2F123/read",
		);
	});
});

describe("platformEndpoints.jobs", () => {
	it("builds jobs list with queue and status filters", () => {
		expect(
			platformEndpoints.jobs.list({
				queue: "provisioning",
				status: "failed",
				limit: 50,
				offset: 0,
			}),
		).toBe("/jobs?queue=provisioning&status=failed&limit=50&offset=0");
	});

	it("omits all filters from canonical jobs list", () => {
		expect(
			platformEndpoints.jobs.list({
				queue: "all",
				status: "all",
				limit: 50,
				offset: 0,
			}),
		).toBe("/jobs?limit=50&offset=0");
	});

	it("builds job detail path safely", () => {
		expect(platformEndpoints.jobs.detail("webhooks_out", "abc/123")).toBe(
			"/jobs/webhooks_out/abc%2F123",
		);
	});
});

describe("platformEndpoints.organizations", () => {
	it("builds observability path safely", () => {
		expect(platformEndpoints.organizations.observability("org/abc")).toBe(
			"/organizations/org%2Fabc/observability",
		);
	});

	it("builds health-summary with comma-separated ids", () => {
		expect(
			platformEndpoints.organizations.healthSummary([
				"507f1f77bcf86cd799439011",
				"507f191e810c19729de860ea",
			]),
		).toBe(
			"/organizations/health-summary?ids=507f1f77bcf86cd799439011%2C507f191e810c19729de860ea",
		);
	});
});
