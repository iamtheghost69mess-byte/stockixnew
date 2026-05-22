import { expect, test } from "@playwright/test";

const ownerEmail = process.env.E2E_PLATFORM_OWNER_EMAIL;
const ownerPassword = process.env.E2E_PLATFORM_OWNER_PASSWORD;

test.describe("notifications (requires seeded owner)", () => {
	test("owner can access notifications page and execute mark-all-read", async ({
		page,
	}) => {
		test.skip(
			!ownerEmail || !ownerPassword,
			"Set E2E_PLATFORM_OWNER_EMAIL and E2E_PLATFORM_OWNER_PASSWORD",
		);

		await page.goto("/login");
		await page.getByLabel("Email").fill(ownerEmail!);
		await page.getByLabel("Password").fill(ownerPassword!);
		await page.getByRole("button", { name: /sign in/i }).click();
		await page.waitForURL(/\//, { timeout: 60_000 });

		await page.goto("/notifications");
		await expect(
			page.getByRole("heading", { name: "Platform Event Feed" }),
		).toBeVisible();

		await page.getByRole("button", { name: "Mark all read" }).click();
		await expect(page.getByText("Feed activity cleared.")).toBeVisible();
	});
});
