import { expect, type Page, test } from "@playwright/test";

const ownerEmail = process.env.E2E_PLATFORM_OWNER_EMAIL;
const ownerPassword = process.env.E2E_PLATFORM_OWNER_PASSWORD;
const platformApiBase = (
	process.env.E2E_PLATFORM_API_BASE || "http://localhost:8010"
).replace(/\/$/, "");
const tenantOrigin = (process.env.E2E_TENANT_BASE_URL || "").replace(/\/$/, "");

async function loginAsOwner(page: Page) {
	const login = await page.request.post(
		`${platformApiBase}/api/platform/v1/auth/login`,
		{
			data: { email: ownerEmail, password: ownerPassword },
		},
	);
	expect(login.ok()).toBeTruthy();
	const body = (await login.json()) as { success?: boolean };
	expect(body?.success).toBeTruthy();
	const setCookieHeaders = login
		.headersArray()
		.filter((header) => header.name.toLowerCase() === "set-cookie")
		.map((header) => header.value);
	const accessCookie = setCookieHeaders.find((value) =>
		value.startsWith("platformAccessToken="),
	);
	const refreshCookie = setCookieHeaders.find((value) =>
		value.startsWith("platformRefreshToken="),
	);
	expect(Boolean(accessCookie)).toBeTruthy();
	expect(Boolean(refreshCookie)).toBeTruthy();

	const readCookieValue = (cookieHeader: string | undefined): string => {
		if (!cookieHeader) return "";
		const firstChunk = cookieHeader.split(";")[0] || "";
		const parts = firstChunk.split("=");
		return parts.slice(1).join("=");
	};

	await page.context().addCookies([
		{
			name: "platformAccessToken",
			value: readCookieValue(accessCookie),
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
		},
		{
			name: "platformRefreshToken",
			value: readCookieValue(refreshCookie),
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
		},
	]);

	await page.goto("/");
	await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe("auth repair verification", () => {
	test.describe.configure({ mode: "serial" });

	test("login + reload keeps session; no login bounce", async ({ page }) => {
		test.skip(
			!ownerEmail || !ownerPassword,
			"Set E2E_PLATFORM_OWNER_EMAIL and E2E_PLATFORM_OWNER_PASSWORD",
		);

		const refreshStatuses: number[] = [];
		page.on("response", (res) => {
			const u = res.url();
			if (u.includes("/api/platform/v1/auth/refresh")) {
				refreshStatuses.push(res.status());
			}
		});

		await loginAsOwner(page);
		await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

		await page.reload({ waitUntil: "domcontentloaded" });
		await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

		const me = await page.evaluate(async () => {
			const res = await fetch("http://localhost:8010/api/platform/v1/auth/me", {
				credentials: "include",
			});
			const body = await res.json().catch(() => ({}));
			return { ok: res.ok, body };
		});
		expect(me.ok).toBeTruthy();
		expect(me.body?.success).toBeTruthy();

		// In dev, first refresh can 401 before fallback token kicks in.
		// Repair condition: flow recovers and the latest refresh is healthy.
		if (refreshStatuses.length > 0) {
			expect(refreshStatuses.some((s) => s >= 200 && s < 300)).toBeTruthy();
			const last = refreshStatuses[refreshStatuses.length - 1];
			expect(last >= 200 && last < 300).toBeTruthy();
		}
	});

	test("unauthorized route redirects logged-out users to login", async ({
		context,
	}) => {
		const anon = await context.browser()?.newContext();
		if (!anon) throw new Error("Browser context unavailable");
		const anonPage = await anon.newPage();
		await anonPage.goto("/unauthorized");
		await anonPage.waitForURL(/\/login/, { timeout: 20_000 });
		await anon.close();
	});

	test("tenant root preserves org query on redirect", async ({ page }) => {
		test.skip(
			!tenantOrigin,
			"Set E2E_TENANT_BASE_URL to verify tenant redirect behavior",
		);

		const org = "repair-check-org";
		const res = await page.request.get(`${tenantOrigin}/?org=${org}`, {
			maxRedirects: 0,
		});
		expect(res.status()).toBeGreaterThanOrEqual(300);
		expect(res.status()).toBeLessThan(400);
		const location = res.headers().location || "";
		expect(location).toContain(`/login?org=${org}`);
	});

	test("organizations tenant URL does not fallback to localhost:3000", async ({
		page,
	}) => {
		test.skip(
			!ownerEmail || !ownerPassword || !tenantOrigin,
			"Set E2E_PLATFORM_OWNER_EMAIL, E2E_PLATFORM_OWNER_PASSWORD, E2E_TENANT_BASE_URL",
		);

		await loginAsOwner(page);
		await page.goto("/organizations");
		await expect(
			page.getByRole("heading", { name: "Organizations" }),
		).toBeVisible();

		const firstOrg = page.locator("a[href^='/organizations/']").first();
		await expect(firstOrg).toBeVisible();
		await firstOrg.click();

		const tenantCardText = await page
			.locator("div.rounded-md.border.p-3")
			.filter({ hasText: "Tenant access URL" })
			.first()
			.innerText();
		expect(tenantCardText).toContain(tenantOrigin);
		expect(tenantCardText).not.toContain("http://localhost:3000");
	});
});
