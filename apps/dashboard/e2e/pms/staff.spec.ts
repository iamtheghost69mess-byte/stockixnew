/**
 * Staff page — Staff / Property access / Invites tabs, add dialogs.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Staff page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/staff");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible();
  });

  test("shows Staff, Property access, and Invites tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Staff" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Property access" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Invites" })).toBeVisible();
  });

  test("Staff tab is active by default", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Staff" })).toHaveAttribute("data-state", "active");
  });

  test("'Add staff' button is visible in Staff tab", async ({ page }) => {
    await expect(page.getByRole("button", { name: /add staff/i })).toBeVisible();
  });

  test("lists staff member 'Omar Sayed'", async ({ page }) => {
    await expect(page.getByText("Omar Sayed")).toBeVisible();
  });

  test("shows staff role 'manager'", async ({ page }) => {
    await expect(page.getByText("manager")).toBeVisible();
  });

  test("shows staff email", async ({ page }) => {
    await expect(page.getByText("omar@sunsetvilla.com")).toBeVisible();
  });

  test("table has Name, Role, Email columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
  });

  test("Property access tab shows empty state for no managers", async ({ page }) => {
    await page.getByRole("tab", { name: "Property access" }).click();
    await expect(page.getByText(/no property managers/i)).toBeVisible();
  });

  test("Invites tab shows 'Create invite' button", async ({ page }) => {
    await page.getByRole("tab", { name: "Invites" }).click();
    await expect(page.getByRole("button", { name: /create invite/i })).toBeVisible();
  });

  test("Invites tab shows empty state when no invites exist", async ({ page }) => {
    await page.getByRole("tab", { name: "Invites" }).click();
    await expect(page.getByText(/no invites/i)).toBeVisible();
  });

  test("opens add staff dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add staff/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Add staff member")).toBeVisible();
  });

  test("add staff dialog has Full name, Role, Email fields", async ({ page }) => {
    await page.getByRole("button", { name: /add staff/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Full name")).toBeVisible();
    await expect(dialog.getByText("Role")).toBeVisible();
    await expect(dialog.getByText("Email (optional)")).toBeVisible();
  });

  test("Add button disabled when staff name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /add staff/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  test("Add button enabled after entering name", async ({ page }) => {
    await page.getByRole("button", { name: /add staff/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Full name").locator("..").getByRole("textbox").fill("New Staff Member");
    await expect(dialog.getByRole("button", { name: /^add$/i })).toBeEnabled();
  });

  test("cancel closes add staff dialog", async ({ page }) => {
    await page.getByRole("button", { name: /add staff/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("opens create invite dialog from Invites tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Invites" }).click();
    await page.getByRole("button", { name: /create invite/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Create property manager invite")).toBeVisible();
  });

  test("invite dialog has Property UUID and Expires in fields", async ({ page }) => {
    await page.getByRole("tab", { name: "Invites" }).click();
    await page.getByRole("button", { name: /create invite/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Property UUID")).toBeVisible();
    await expect(dialog.getByText("Expires in (days)")).toBeVisible();
  });

  test("Create invite button disabled when property ID is empty", async ({ page }) => {
    await page.getByRole("tab", { name: "Invites" }).click();
    await page.getByRole("button", { name: /create invite/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /create invite/i })).toBeDisabled();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
