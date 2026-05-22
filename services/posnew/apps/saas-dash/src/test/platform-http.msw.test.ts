import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { useAuthStore } from "@/lib/auth-store";
import {
	platformFetch,
	platformJson,
	retryAfterSecondsFromResponse,
} from "@/lib/platform-http";
import { resetSingleFlightRefreshForTests } from "@/lib/refresh-mutex";

const okOrgList = () =>
	HttpResponse.json({ success: true, data: [], nextCursor: null });

const server = setupServer(
	http.post("http://localhost:9999/api/platform/v1/auth/refresh", () =>
		HttpResponse.json({
			success: true,
			data: { success: true },
		}),
	),
	http.get("http://localhost:9999/api/platform/v1/organizations", () =>
		okOrgList(),
	),
);

describe("platformFetch + MSW", () => {
	beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
	afterEach(() => {
		server.resetHandlers();
		resetSingleFlightRefreshForTests();
	});
	afterAll(() => server.close());

	beforeEach(() => {
		process.env.NEXT_PUBLIC_POS_API_ORIGIN = "http://localhost:9999";
		useAuthStore.setState({
			user: null,
			sessionExpiredOpen: false,
		});
	});

	it("refreshes on 401 then retries GET", async () => {
		let orgHits = 0;
		server.use(
			http.get("http://localhost:9999/api/platform/v1/organizations", () => {
				orgHits += 1;
				if (orgHits === 1) {
					return HttpResponse.json(
						{ type: "about:blank", title: "Unauthorized", status: 401 },
						{ status: 401 },
					);
				}
				return okOrgList();
			}),
		);
		const res = await platformFetch("/organizations");
		expect(res.ok).toBe(true);
		const json = (await res.json()) as { success?: boolean };
		expect(json.success).toBe(true);
		expect(orgHits).toBe(2);
	});

	it("maps 429 with Retry-After via platformJson", async () => {
		server.use(
			http.get("http://localhost:9999/api/platform/v1/metrics/summary", () =>
				HttpResponse.json(
					{
						type: "about:blank",
						title: "Too Many",
						status: 429,
						detail: "slow down",
					},
					{
						status: 429,
						headers: { "Retry-After": "12" },
					},
				),
			),
		);
		useAuthStore.setState({
			user: { email: "a@b.c" },
			sessionExpiredOpen: false,
		});
		await expect(platformJson("/metrics/summary")).rejects.toMatchObject({
			status: 429,
			retryAfterSec: 12,
			code: "rate.limited",
		});
	});

	it("logout with session modal on refresh reuse response", async () => {
		server.use(
			http.get("http://localhost:9999/api/platform/v1/organizations", () =>
				HttpResponse.json(
					{ type: "about:blank", title: "Unauthorized", status: 401 },
					{ status: 401 },
				),
			),
			http.post("http://localhost:9999/api/platform/v1/auth/refresh", () =>
				HttpResponse.json(
					{
						type: "about:blank",
						title: "Reuse",
						status: 401,
						detail: "Reuse",
						code: "PLATFORM_REFRESH_REUSE",
					},
					{ status: 401 },
				),
			),
		);
		const res = await platformFetch("/organizations");
		expect(res.ok).toBe(false);
		const st = useAuthStore.getState();
		expect(st.user).toBeNull();
		expect(st.sessionExpiredOpen).toBe(true);
	});

	it("parallel 401s trigger a single refresh (mutex)", async () => {
		let refreshHits = 0;
		let orgHits = 0;
		server.use(
			http.post(
				"http://localhost:9999/api/platform/v1/auth/refresh",
				async () => {
					refreshHits += 1;
					await new Promise((r) => setTimeout(r, 20));
					return HttpResponse.json({
						success: true,
						data: { success: true },
					});
				},
			),
			http.get("http://localhost:9999/api/platform/v1/organizations", () => {
				orgHits += 1;
				if (orgHits <= 2) {
					return HttpResponse.json(
						{ type: "about:blank", title: "Unauthorized", status: 401 },
						{ status: 401 },
					);
				}
				return okOrgList();
			}),
		);
		useAuthStore.setState({
			user: { email: "a@b.c" },
			sessionExpiredOpen: false,
		});
		const [a, b] = await Promise.all([
			platformFetch("/organizations"),
			platformFetch("/organizations"),
		]);
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		expect(refreshHits).toBe(1);
	});

	it("exposes Retry-After on 429 responses", async () => {
		const res = new Response(JSON.stringify({ detail: "wait" }), {
			status: 429,
			headers: { "Retry-After": "7" },
		});
		expect(retryAfterSecondsFromResponse(res)).toBe(7);
	});
});
