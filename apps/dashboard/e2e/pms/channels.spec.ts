/**
 * iCal Channels page — channel list, sync, add dialog, sync logs.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("iCal Channels page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/channels");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "iCal Channels" })).toBeVisible();
  });

  test("'Sync now' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /sync now/i })).toBeVisible();
  });

  test("'Add channel' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add channel/i })).toBeVisible();
  });

  test("shows channel platform 'airbnb'", async ({ page }) => {
    await expect(page.getByText("airbnb")).toBeVisible();
  });

  test("shows buffer values '-1 / +1 d'", async ({ page }) => {
    await expect(page.getByText("-1 / +1 d")).toBeVisible();
  });

  test("shows channel status badge 'OK'", async ({ page }) => {
    await expect(page.getByText("OK")).toBeVisible();
  });

  test("shows failure count '0'", async ({ page }) => {
    await expect(page.getByText("0")).toBeVisible();
  });

  test("shows recent sync logs section", async ({ page }) => {
    await expect(page.getByText(/recent sync logs/i)).toBeVisible();
  });

  test("shows sync log messages", async ({ page }) => {
    await expect(page.getByText(/Synced 3 events/)).toBeVisible();
  });

  test("opens add channel dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add channel/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Add iCal channel")).toBeVisible();
  });

  test("dialog has Property UUID and Name fields", async ({ page }) => {
    await page.getByRole("button", { name: /add channel/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Property UUID")).toBeVisible();
    await expect(dialog.getByText("Name")).toBeVisible();
  });

  test("dialog has Platform and Import URL fields", async ({ page }) => {
    await page.getByRole("button", { name: /add channel/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Platform")).toBeVisible();
    await expect(dialog.getByText("Import URL (iCal feed)")).toBeVisible();
  });

  test("dialog has Buffer before and Buffer after fields", async ({ page }) => {
    await page.getByRole("button", { name: /add channel/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Buffer before (days)")).toBeVisible();
    await expect(dialog.getByText("Buffer after (days)")).toBeVisible();
  });

  test("Add button disabled when name and property are empty", async ({ page }) => {
    await page.getByRole("button", { name: /add channel/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add channel/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
