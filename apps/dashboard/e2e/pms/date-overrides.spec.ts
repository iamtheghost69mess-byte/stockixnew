/**
 * Date Overrides page — override list, add dialog, delete.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Date Overrides page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/date-overrides");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Date Overrides" })).toBeVisible();
  });

  test("property filter select is visible", async ({ page }) => {
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("'Add override' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add override/i })).toBeVisible();
  });

  test("shows override date '2024-12-25'", async ({ page }) => {
    await expect(page.getByText("2024-12-25")).toBeVisible();
  });

  test("shows override type badge 'closed'", async ({ page }) => {
    await expect(page.getByText("closed")).toBeVisible();
  });

  test("shows override note 'Christmas'", async ({ page }) => {
    await expect(page.getByText("Christmas")).toBeVisible();
  });

  test("table has Property, Date, Type, Note columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Property" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Date" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Note" })).toBeVisible();
  });

  test("delete button is visible per row", async ({ page }) => {
    // Trash icon button in each row
    await expect(page.locator("button svg").first()).toBeVisible();
  });

  test("opens add override dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add override/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Add date override")).toBeVisible();
  });

  test("dialog has Property selector", async ({ page }) => {
    await page.getByRole("button", { name: /add override/i }).click();
    await expect(page.getByRole("dialog").getByText("Property")).toBeVisible();
  });

  test("dialog has Date input and Type selector", async ({ page }) => {
    await page.getByRole("button", { name: /add override/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Date")).toBeVisible();
    await expect(dialog.getByText("Type")).toBeVisible();
  });

  test("dialog has Note field", async ({ page }) => {
    await page.getByRole("button", { name: /add override/i }).click();
    await expect(page.getByRole("dialog").getByText(/note/i)).toBeVisible();
  });

  test("Add button enabled when property is auto-selected from list", async ({ page }) => {
    await page.getByRole("button", { name: /add override/i }).click();
    // Properties load and auto-select first one, so button should be enabled
    await expect(page.getByRole("dialog").getByRole("button", { name: /^add$/i })).toBeEnabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add override/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
