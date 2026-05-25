/**
 * Message Templates page — template list, create dialog, delete.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Message Templates page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/message-templates");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Message Templates" })).toBeVisible();
  });

  test("'New template' button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new template/i })).toBeVisible();
  });

  test("lists template 'Pre-arrival welcome'", async ({ page }) => {
    await expect(page.getByText("Pre-arrival welcome")).toBeVisible();
  });

  test("shows channel badge 'email'", async ({ page }) => {
    await expect(page.getByText("email")).toBeVisible();
  });

  test("shows trigger 'pre arrival'", async ({ page }) => {
    await expect(page.getByText("pre arrival")).toBeVisible();
  });

  test("shows send offset '-3d'", async ({ page }) => {
    await expect(page.getByText("-3d")).toBeVisible();
  });

  test("shows subject 'Your stay is coming up!'", async ({ page }) => {
    await expect(page.getByText("Your stay is coming up!")).toBeVisible();
  });

  test("table has Name, Channel, Trigger, Offset, Subject columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Channel" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Trigger" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Offset" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Subject" })).toBeVisible();
  });

  test("opens create dialog when 'New template' clicked", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("New message template")).toBeVisible();
  });

  test("dialog has Name field", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog").getByText("Name")).toBeVisible();
  });

  test("dialog has Channel and Trigger selects", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Channel")).toBeVisible();
    await expect(dialog.getByText("Trigger")).toBeVisible();
  });

  test("dialog has Body textarea", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog").locator("textarea")).toBeVisible();
  });

  test("Create button disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /create/i })).toBeDisabled();
  });

  test("Create button disabled without body even if name is filled", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Name").locator("..").getByRole("textbox").first().fill("Test Template");
    // Body is still empty so still disabled
    await expect(dialog.getByRole("button", { name: /create/i })).toBeDisabled();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
