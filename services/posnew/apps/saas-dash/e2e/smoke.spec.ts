import { expect, test } from "@playwright/test";

test.describe("saas-dash smoke", () => {
	test("login page renders", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByText("Platform sign in")).toBeVisible();
	});

	test("login form has required fields", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByLabel("Email")).toBeVisible();
		await expect(page.getByLabel("Password")).toBeVisible();
		await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
	});

	test("unauthorized route redirects unauthenticated users to login", async ({
		page,
	}) => {
		await page.goto("/unauthorized");
		await page.waitForURL(/\/login/, { timeout: 20_000 });
	});

	test("root redirects unauthenticated users to login", async ({ page }) => {
		await page.goto("/");
		await page.waitForURL(/\/login/, { timeout: 20_000 });
	});

	test("protected organizations route redirects to login when logged out", async ({
		page,
	}) => {
		await page.goto("/organizations");
		await page.waitForURL(/\/login/, { timeout: 20_000 });
	});

	test("protected compliance route redirects to login when logged out", async ({
		page,
	}) => {
		await page.goto("/compliance");
		await page.waitForURL(/\/login/, { timeout: 20_000 });
	});

	test("protected api-keys route redirects to login when logged out", async ({
		page,
	}) => {
		await page.goto("/api-keys");
		await page.waitForURL(/\/login/, { timeout: 20_000 });
	});

	test("notifications route redirects to login when logged out", async ({
		page,
	}) => {
		await page.goto("/notifications");
		await page.waitForURL(/\/login/, { timeout: 20_000 });
	});
});
