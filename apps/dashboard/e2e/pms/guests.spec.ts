/**
 * Guests page — search input, compliance fields, guest list, create dialog.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Guests page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/guests");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Guests" })).toBeVisible();
  });

  test("search input is visible", async ({ page }) => {
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible();
  });

  test("'New guest' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new guest/i })).toBeVisible();
  });

  test("lists guest 'Ahmed Hassan'", async ({ page }) => {
    await expect(page.getByText("Ahmed Hassan")).toBeVisible();
  });

  test("shows guest email", async ({ page }) => {
    await expect(page.getByText("ahmed@example.com")).toBeVisible();
  });

  test("shows nationality column", async ({ page }) => {
    await expect(page.getByText("EG")).toBeVisible();
  });

  test("shows ID type 'passport'", async ({ page }) => {
    await expect(page.getByText("passport")).toBeVisible();
  });

  test("shows passport number", async ({ page }) => {
    await expect(page.getByText("A12345678")).toBeVisible();
  });

  test("shows visa badge 'Yes'", async ({ page }) => {
    await expect(page.getByText("Yes")).toBeVisible();
  });

  test("opens create dialog when 'New guest' clicked", async ({ page }) => {
    await page.getByRole("button", { name: /new guest/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("New guest")).toBeVisible();
  });

  test("dialog has Full name, Email, Phone fields", async ({ page }) => {
    await page.getByRole("button", { name: /new guest/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Full name")).toBeVisible();
    await expect(dialog.getByText("Email")).toBeVisible();
    await expect(dialog.getByText("Phone")).toBeVisible();
  });

  test("dialog has compliance fields — passport number and nationality", async ({ page }) => {
    await page.getByRole("button", { name: /new guest/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Passport number")).toBeVisible();
    await expect(dialog.getByText("Nationality")).toBeVisible();
  });

  test("Create button disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /new guest/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /create/i })).toBeDisabled();
  });

  test("Create button enabled after name is filled", async ({ page }) => {
    await page.getByRole("button", { name: /new guest/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Full name").locator("..").getByRole("textbox").fill("New Guest");
    await expect(dialog.getByRole("button", { name: /create/i })).toBeEnabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /new guest/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
