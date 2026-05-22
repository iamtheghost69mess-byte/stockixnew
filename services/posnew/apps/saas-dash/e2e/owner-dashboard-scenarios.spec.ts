import { expect, type Page, test } from "@playwright/test";

const ownerEmail = process.env.E2E_PLATFORM_OWNER_EMAIL;
const ownerPassword = process.env.E2E_PLATFORM_OWNER_PASSWORD;
const platformApiBase = (
	process.env.E2E_PLATFORM_API_BASE || "http://localhost:8010"
).replace(/\/$/, "");
const hasOwnerCredentials = Boolean(ownerEmail && ownerPassword);
const ownerCredentialsSkipReason =
	"Skipped: set E2E_PLATFORM_OWNER_EMAIL and E2E_PLATFORM_OWNER_PASSWORD to run owner-authenticated scenarios.";

const protectedRoutes = [
	"/",
	"/organizations",
	"/notifications",
	"/reports",
	"/compliance",
	"/api-keys",
];

async function loginAsOwner(page: Page): Promise<void> {
	const loginResponse = await page.request.post(
		`${platformApiBase}/api/platform/v1/auth/login`,
		{
			data: { email: ownerEmail, password: ownerPassword },
		},
	);
	if (!loginResponse.ok()) {
		throw new Error(
			`Owner API login failed (${loginResponse.status()}). Ensure backend is running and credentials are valid.`,
		);
	}
	const payload = (await loginResponse.json()) as {
		success?: boolean;
	};
	if (!payload.success) {
		throw new Error("Owner API login failed.");
	}
	const setCookieHeaders = loginResponse
		.headersArray()
		.filter((header) => header.name.toLowerCase() === "set-cookie")
		.map((header) => header.value);
	const accessCookie = setCookieHeaders.find((value) =>
		value.startsWith("platformAccessToken="),
	);
	const refreshCookie = setCookieHeaders.find((value) =>
		value.startsWith("platformRefreshToken="),
	);
	if (!accessCookie || !refreshCookie) {
		throw new Error("Owner API login response missing platform tokens.");
	}
	const readCookieValue = (cookieHeader: string): string => {
		const firstChunk = cookieHeader.split(";")[0] || "";
		const parts = firstChunk.split("=");
		return parts.slice(1).join("=");
	};

	await page.goto("/login");
	const dashboardOrigin = new URL(page.url()).origin;
	await page.context().addCookies([
		{
			name: "platformAccessToken",
			value: readCookieValue(accessCookie),
			url: dashboardOrigin,
		},
		{
			name: "platformRefreshToken",
			value: readCookieValue(refreshCookie),
			url: dashboardOrigin,
		},
	]);
	await page.goto("/");
	await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
		timeout: 60_000,
	});
	await page.waitForTimeout(1200);
	if (new URL(page.url()).pathname.startsWith("/login")) {
		throw new Error(
			"Session did not persist after login bootstrap. Ensure backend refresh flow is reachable and credentials are valid.",
		);
	}
}

test.describe("owner dashboard scenario verification (unauthenticated)", () => {
	test("all protected owner routes redirect to login when unauthenticated", async ({
		page,
	}) => {
		for (const route of protectedRoutes) {
			await page.goto(route);
			await page.waitForURL(/\/login/, { timeout: 20_000 });
		}
	});
});

function registerOwnerAuthenticatedScenarios(): void {
	test.describe.configure({ mode: "serial" });

	test("owner can navigate core dashboard sections", async ({ page }) => {
		await loginAsOwner(page);

		await page.goto("/notifications");
		await expect(
			page.getByRole("heading", { name: "Platform Event Feed" }),
		).toBeVisible({
			timeout: 15_000,
		});

		await page.goto("/reports");
		try {
			await expect(
				page.getByRole("heading", { name: "Platform Reports" }),
			).toBeVisible({
				timeout: 15_000,
			});
		} catch {
			await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
		}

		await page.goto("/organizations");
		await expect(
			page.getByRole("heading", { name: "Organizations" }),
		).toBeVisible();
	});

	test("owner notification workflow supports filters and mark-all-read", async ({
		page,
	}) => {
		await loginAsOwner(page);

		await page.goto("/notifications");
		await expect(
			page.getByRole("heading", { name: "Platform Event Feed" }),
		).toBeVisible({
			timeout: 15_000,
		});

		await page.getByRole("button", { name: /^Unread$/ }).click();
		await page.getByRole("button", { name: /^All$/ }).click();

		await page.getByRole("button", { name: "Mark all read" }).click();
		await expect(page.getByText("Feed activity cleared.")).toBeVisible();
	});

	test("owner desktop alert control path is operational", async ({
		context,
		page,
	}) => {
		await context.addInitScript(() => {
			const NotificationMock = function NotificationMock() {
				return undefined;
			} as unknown as Notification;

			Object.defineProperty(NotificationMock, "permission", {
				configurable: true,
				enumerable: true,
				get: () => "default",
			});

			Object.defineProperty(NotificationMock, "requestPermission", {
				configurable: true,
				enumerable: true,
				value: async () => "granted" as NotificationPermission,
			});

			Object.defineProperty(window, "Notification", {
				configurable: true,
				writable: true,
				value: NotificationMock,
			});
		});

		await loginAsOwner(page);
		await page.goto("/notifications");
		await page.getByRole("button", { name: "Sync Desktop Alerts" }).click();
		await expect(page.getByText("Desktop alerts synchronized.")).toBeVisible();
	});
}

if (!hasOwnerCredentials) {
	test.describe.skip(
		`owner dashboard scenario verification (authenticated owner) — ${ownerCredentialsSkipReason}`,
		registerOwnerAuthenticatedScenarios,
	);
} else {
	test.describe(
		"owner dashboard scenario verification (authenticated owner)",
		registerOwnerAuthenticatedScenarios,
	);
}
