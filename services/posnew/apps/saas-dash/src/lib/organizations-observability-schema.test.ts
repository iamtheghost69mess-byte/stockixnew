import { describe, expect, it } from "vitest";

import { organizationObservabilityResponseSchema } from "@/lib/api-schemas/organizations";

describe("organizationObservabilityResponseSchema", () => {
	it("parses a minimal valid payload", () => {
		const raw = {
			success: true,
			data: {
				organizationId: "507f1f77bcf86cd799439011",
				generatedAt: "2026-01-01T00:00:00.000Z",
				apiUsage: {
					windows: {
						last24hUtcDays: ["2026-01-01"],
						last7dUtcDays: ["2026-01-01"],
						last30dUtcDays: ["2026-01-01"],
						requests: { last24h: 1, last7d: 2, last30d: 3 },
						byStatusFamily: {
							last24h: { "2xx": 1 },
							last7d: { "2xx": 2 },
							last30d: { "2xx": 3 },
						},
						topEndpoints: {
							last24h: [{ method: "GET", endpointKey: "/api/x", count: 1 }],
							last7d: [{ method: "GET", endpointKey: "/api/x", count: 2 }],
							last30d: [{ method: "GET", endpointKey: "/api/x", count: 3 }],
						},
					},
					note: "test",
				},
				usageCountersSnapshot: {
					apiCallsThisMonth: 10,
					ordersThisMonth: 2,
					usagePeriodYm: "2026-01",
				},
				storage: {
					approximateTotalBytes: 1000,
					note: "approx",
					byCollection: {
						orders: { approximateBytes: 500, documents: 5 },
						users: { approximateBytes: 200, documents: 2 },
						menuitems: { approximateBytes: 200, documents: 2 },
						ingredients: { approximateBytes: 100, documents: 1 },
					},
				},
				entityCounts: {
					users: 1,
					locations: 1,
					menuItems: 1,
					orders: 1,
					payments: 0,
					invoices: 0,
				},
			},
		};
		const parsed = organizationObservabilityResponseSchema.parse(raw);
		expect(parsed.data?.organizationId).toBe("507f1f77bcf86cd799439011");
		expect(parsed.data?.apiUsage.windows.requests.last30d).toBe(3);
	});
});
