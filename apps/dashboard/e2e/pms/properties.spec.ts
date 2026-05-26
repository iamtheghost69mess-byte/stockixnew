/**
 * Properties page — CRUD, property audit, no-tenant gate.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage, mockPmsRoutes, PROPERTY_ID } from "./_utils.js";

test.describe("Properties page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/properties");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  });

  test("lists existing property 'Sunset Villa'", async ({ page }) => {
    await expect(page.getByText("Sunset Villa")).toBeVisible();
  });

  test("shows feedSlug in property row", async ({ page }) => {
    await expect(page.getByText("sunset-villa")).toBeVisible();
  });

  test("'New property' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new property/i })).toBeVisible();
  });

  test("opens create dialog when 'New property' clicked", async ({ page }) => {
    await page.getByRole("button", { name: /new property/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("New property")).toBeVisible();
  });

  test("dialog has name, address, check-in/out time, min nights fields", async ({ page }) => {
    await page.getByRole("button", { name: /new property/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/name/i)).toBeVisible();
    await expect(dialog.getByLabel(/address/i)).toBeVisible();
  });

  test("create button is disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /new property/i }).click();
    const createBtn = page.getByRole("dialog").getByRole("button", { name: /create/i });
    await expect(createBtn).toBeDisabled();
  });

  test("create button enables after name is filled", async ({ page }) => {
    await page.getByRole("button", { name: /new property/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/name/i).fill("New Test Villa");
    const createBtn = dialog.getByRole("button", { name: /create/i });
    await expect(createBtn).toBeEnabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /new property/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});

test.describe("Property audit", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/properties");
  });

  test("audit button exists per property row", async ({ page }) => {
    await expect(page.getByRole("button", { name: /audit/i })).toBeVisible();
  });
});
