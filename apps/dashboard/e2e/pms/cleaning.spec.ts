/**
 * Cleaning page — Tasks tab, Cleaners tab, status transitions.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Cleaning page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/cleaning");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Cleaning" })).toBeVisible();
  });

  test("shows Tasks and Cleaners tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Tasks" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Cleaners" })).toBeVisible();
  });

  test("Tasks tab is active by default", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Tasks" })).toHaveAttribute("data-state", "active");
  });

  test("shows date input in Tasks tab", async ({ page }) => {
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test("'Add task' button is visible in Tasks tab", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add task/i })).toBeVisible();
  });

  test("shows cleaning task notes 'Auto-created on checkout'", async ({ page }) => {
    await expect(page.getByText("Auto-created on checkout")).toBeVisible();
  });

  test("shows task status badge 'pending'", async ({ page }) => {
    await expect(page.getByText("pending")).toBeVisible();
  });

  test("shows 'Start' button for pending task", async ({ page }) => {
    await expect(page.getByRole("button", { name: /start/i })).toBeVisible();
  });

  test("opens add task dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add task/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Add cleaning task")).toBeVisible();
  });

  test("add task dialog has Room UUID and Notes fields", async ({ page }) => {
    await page.getByRole("button", { name: /add task/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Room UUID")).toBeVisible();
    await expect(dialog.getByText("Notes")).toBeVisible();
  });

  test("add task Add button disabled when room ID empty", async ({ page }) => {
    await page.getByRole("button", { name: /add task/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  test("clicking Cleaners tab shows cleaner list", async ({ page }) => {
    await page.getByRole("tab", { name: "Cleaners" }).click();
    await expect(page.getByText("Fatima Al-Amin")).toBeVisible();
  });

  test("Cleaners tab shows phone number", async ({ page }) => {
    await page.getByRole("tab", { name: "Cleaners" }).click();
    await expect(page.getByText("+20509876543")).toBeVisible();
  });

  test("'Add cleaner' button visible in Cleaners tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Cleaners" }).click();
    await expect(page.getByRole("button", { name: /add cleaner/i })).toBeVisible();
  });

  test("opens add cleaner dialog", async ({ page }) => {
    await page.getByRole("tab", { name: "Cleaners" }).click();
    await page.getByRole("button", { name: /add cleaner/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Add cleaner")).toBeVisible();
  });

  test("add cleaner dialog has Full name, Phone, Email fields", async ({ page }) => {
    await page.getByRole("tab", { name: "Cleaners" }).click();
    await page.getByRole("button", { name: /add cleaner/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Full name")).toBeVisible();
    await expect(dialog.getByText("Phone")).toBeVisible();
    await expect(dialog.getByText("Email")).toBeVisible();
  });

  test("cancel closes add cleaner dialog", async ({ page }) => {
    await page.getByRole("tab", { name: "Cleaners" }).click();
    await page.getByRole("button", { name: /add cleaner/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
