/**
 * Bookings page — status filter, booking table, action buttons, create dialog.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Bookings page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/bookings");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  });

  test("status filter select is visible", async ({ page }) => {
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("'New booking' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new booking/i })).toBeVisible();
  });

  test("shows check-in date '2024-09-01'", async ({ page }) => {
    await expect(page.getByText("2024-09-01")).toBeVisible();
  });

  test("shows check-out date '2024-09-07'", async ({ page }) => {
    await expect(page.getByText("2024-09-07")).toBeVisible();
  });

  test("shows platform 'airbnb'", async ({ page }) => {
    await expect(page.getByText("airbnb")).toBeVisible();
  });

  test("shows booking status badge 'confirmed'", async ({ page }) => {
    await expect(page.getByText("confirmed")).toBeVisible();
  });

  test("shows 'Check in' action button for confirmed booking", async ({ page }) => {
    await expect(page.getByRole("button", { name: /check in/i })).toBeVisible();
  });

  test("shows 'Cancel' action button for confirmed booking", async ({ page }) => {
    await expect(page.getByRole("button", { name: /cancel/i }).first()).toBeVisible();
  });

  test("shows total amount", async ({ page }) => {
    await expect(page.getByText("$900.00")).toBeVisible();
  });

  test("opens create dialog when 'New booking' clicked", async ({ page }) => {
    await page.getByRole("button", { name: /new booking/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("New booking")).toBeVisible();
  });

  test("dialog has property, room, guest, date fields", async ({ page }) => {
    await page.getByRole("button", { name: /new booking/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Property UUID")).toBeVisible();
    await expect(dialog.getByText("Room UUID")).toBeVisible();
    await expect(dialog.getByText("Guest UUID")).toBeVisible();
    await expect(dialog.getByText("Check-in (YYYY-MM-DD)")).toBeVisible();
  });

  test("dialog Create button is always enabled (UUIDs not pre-validated)", async ({ page }) => {
    await page.getByRole("button", { name: /new booking/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /create/i })).toBeEnabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /new booking/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
