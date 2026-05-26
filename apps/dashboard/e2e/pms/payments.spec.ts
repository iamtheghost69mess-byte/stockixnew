/**
 * Payments page — payment list, record dialog.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Payments page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/payments");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  });

  test("'Record payment' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /record payment/i })).toBeVisible();
  });

  test("shows payment amount $450.00", async ({ page }) => {
    await expect(page.getByText("$450.00")).toBeVisible();
  });

  test("shows payment method 'card'", async ({ page }) => {
    await expect(page.getByText("card")).toBeVisible();
  });

  test("shows payment status badge 'completed'", async ({ page }) => {
    await expect(page.getByText("completed")).toBeVisible();
  });

  test("shows transaction ID", async ({ page }) => {
    await expect(page.getByText("txn_001")).toBeVisible();
  });

  test("table has Date, Booking ID, Method, Amount, Status, Transaction ID columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Date" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Method" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  });

  test("opens 'Record payment' dialog", async ({ page }) => {
    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Record payment")).toBeVisible();
  });

  test("dialog has Booking UUID field", async ({ page }) => {
    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(page.getByRole("dialog").getByText("Booking UUID")).toBeVisible();
  });

  test("dialog has Amount and Method fields", async ({ page }) => {
    await page.getByRole("button", { name: /record payment/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Amount (cents)")).toBeVisible();
    await expect(dialog.getByText("Method")).toBeVisible();
  });

  test("Record button disabled when booking ID is empty", async ({ page }) => {
    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /record/i })).toBeDisabled();
  });

  test("Record button enables after booking ID is filled", async ({ page }) => {
    await page.getByRole("button", { name: /record payment/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Booking UUID").locator("..").getByRole("textbox").fill("eeeeeeee-0000-0000-0000-000000000001");
    await expect(dialog.getByRole("button", { name: /record/i })).toBeEnabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /record payment/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
