/**
 * Rooms page — property selector, room list, add dialog.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Rooms page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/rooms");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();
  });

  test("property selector is visible", async ({ page }) => {
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("lists room 'Ocean Suite 101' after property is selected", async ({ page }) => {
    await expect(page.getByText("Ocean Suite 101")).toBeVisible();
  });

  test("shows room type 'Suite'", async ({ page }) => {
    await expect(page.getByText("Suite")).toBeVisible();
  });

  test("shows room status badge", async ({ page }) => {
    await expect(page.getByText("available")).toBeVisible();
  });

  test("'Add room' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add room/i })).toBeVisible();
  });

  test("opens add room dialog when button clicked", async ({ page }) => {
    await page.getByRole("button", { name: /add room/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Add room")).toBeVisible();
  });

  test("dialog has Name and Type fields", async ({ page }) => {
    await page.getByRole("button", { name: /add room/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Name")).toBeVisible();
    await expect(dialog.getByText("Type")).toBeVisible();
  });

  test("dialog has Capacity and Rate fields", async ({ page }) => {
    await page.getByRole("button", { name: /add room/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Capacity")).toBeVisible();
    await expect(dialog.getByText("Rate (cents)")).toBeVisible();
  });

  test("Add button is disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /add room/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  test("Add button enables after filling name", async ({ page }) => {
    await page.getByRole("button", { name: /add room/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Room 101").fill("Deluxe Suite 202");
    await expect(dialog.getByRole("button", { name: /^add$/i })).toBeEnabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add room/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
