import { expect, test } from "@playwright/test";

const ownerEmail = process.env.E2E_PLATFORM_OWNER_EMAIL;
const ownerPassword = process.env.E2E_PLATFORM_OWNER_PASSWORD;
const readEmail = process.env.E2E_PLATFORM_SUPPORT_READ_EMAIL;
const readPassword = process.env.E2E_PLATFORM_SUPPORT_READ_PASSWORD;

test.describe("platform RBAC (requires API + seeded users)", () => {
	test("owner can create organization", async ({ page }) => {
		test.skip(
			!ownerEmail || !ownerPassword,
			"Set E2E_PLATFORM_OWNER_EMAIL and E2E_PLATFORM_OWNER_PASSWORD",
		);

		await page.goto("/login");
		await page.getByLabel("Email").fill(ownerEmail!);
		await page.getByLabel("Password").fill(ownerPassword!);
		await page.getByRole("button", { name: /sign in/i }).click();
		await page.waitForURL(/\//, { timeout: 60_000 });

		await page.goto("/organizations");
		await expect(
			page.getByRole("heading", { name: "Organizations" }),
		).toBeVisible();

		await page.getByRole("button", { name: "New organization" }).click();
		const slug = `e2e-${Date.now()}`;
		await page.getByLabel("Name", { exact: true }).fill(`E2E Org ${slug}`);
		await page.getByLabel("Slug", { exact: true }).fill(slug);
		await page.getByRole("button", { name: "Create" }).click();

		await expect(page.getByText("Organization created")).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page.getByRole("link", { name: new RegExp(`E2E Org ${slug}`) }),
		).toBeVisible({
			timeout: 30_000,
		});
	});

	test("support_read is unauthorized on webhooks", async ({ page }) => {
		test.skip(
			!readEmail || !readPassword,
			"Set E2E_PLATFORM_SUPPORT_READ_EMAIL and E2E_PLATFORM_SUPPORT_READ_PASSWORD",
		);

		await page.goto("/login");
		await page.getByLabel("Email").fill(readEmail!);
		await page.getByLabel("Password").fill(readPassword!);
		await page.getByRole("button", { name: /sign in/i }).click();
		await page.waitForURL(/\//, { timeout: 60_000 });

		await page.goto("/webhooks");
		await page.waitForURL(/\/unauthorized/, { timeout: 30_000 });
		await expect(
			page.getByRole("heading", { name: "Unauthorized" }),
		).toBeVisible();
	});
});
