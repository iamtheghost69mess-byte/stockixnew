import { expect, test } from "@playwright/test";

const ownerEmail = process.env.E2E_PLATFORM_OWNER_EMAIL;
const ownerPassword = process.env.E2E_PLATFORM_OWNER_PASSWORD;

test.describe("Reports Section E2E", () => {
	test("unauthenticated user is redirected to login", async ({ page }) => {
		await page.goto("/reports");
		await expect(page).toHaveURL(/\/login/);
	});

	test("authenticated user can navigate and use reports", async ({ page }) => {
		test.skip(!ownerEmail || !ownerPassword, "E2E credentials not set");

		// Login
		await page.goto("/login");
		await page.getByLabel("Email").fill(ownerEmail!);
		await page.getByLabel("Password").fill(ownerPassword!);
		await page.getByRole("button", { name: /sign in/i }).click();
		await page.waitForURL(/\//);

		// Navigate via Sidebar
		await page.getByRole("link", { name: "Reports" }).click();
		await page.waitForURL(/\/reports/);

		// 1. Page Header
		await expect(
			page.getByRole("heading", { name: "Platform Reports" }),
		).toBeVisible();

		// 2. Control-plane cards rendered (no financial report tabs)
		await expect(page.getByText("Organizations")).toBeVisible();
		await expect(page.getByText("Product events (24h)")).toBeVisible();
		await expect(page.getByText("Platform audits (24h)")).toBeVisible();

		// 4. Persistence Check
		const currentUrl = page.url();
		await page.reload();
		expect(page.url()).toBe(currentUrl);

		// 4. Control-plane rollup section exists
		await expect(page.getByText("Rollup Window")).toBeVisible();
	});
});
