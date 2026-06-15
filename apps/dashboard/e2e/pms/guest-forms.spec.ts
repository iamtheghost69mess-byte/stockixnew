/**
 * Guest Forms page — template builder, booking lookup, share link.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage, BOOKING_ID } from "./_utils.js";

test.describe("Guest Forms page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/guest-forms");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Guest Forms" })).toBeVisible();
  });

  test("shows Templates and Booking lookup tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Templates" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Booking lookup" })).toBeVisible();
  });

  test("Templates tab is active by default", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Templates" })).toHaveAttribute("data-state", "active");
  });

  test("'New template' button is visible in Templates tab", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new template/i })).toBeVisible();
  });

  test("lists template 'Pre-arrival form'", async ({ page }) => {
    await expect(page.getByText("Pre-arrival form")).toBeVisible();
  });

  test("shows field badges for the template", async ({ page }) => {
    await expect(page.getByText("Full name *")).toBeVisible();
    await expect(page.getByText("Passport number *")).toBeVisible();
  });

  test("shows field badge for house rules checkbox", async ({ page }) => {
    await expect(page.getByText("I agree to house rules *")).toBeVisible();
  });

  test("table has Name, Property, Fields columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Property" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Fields" })).toBeVisible();
  });

  test("clicking Booking lookup tab shows UUID input", async ({ page }) => {
    await page.getByRole("tab", { name: "Booking lookup" }).click();
    await expect(page.getByPlaceholder(/xxxxxxxx-xxxx/)).toBeVisible();
  });

  test("Look up button is disabled when booking ID is empty", async ({ page }) => {
    await page.getByRole("tab", { name: "Booking lookup" }).click();
    await expect(page.getByRole("button", { name: /look up/i })).toBeDisabled();
  });

  test("Look up button enables after entering a booking ID", async ({ page }) => {
    await page.getByRole("tab", { name: "Booking lookup" }).click();
    await page.getByPlaceholder(/xxxxxxxx-xxxx/).fill(BOOKING_ID);
    await expect(page.getByRole("button", { name: /look up/i })).toBeEnabled();
  });

  test("opens create template dialog", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("New guest form template")).toBeVisible();
  });

  test("dialog has Template name field", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog").getByText("Template name")).toBeVisible();
  });

  test("dialog has Property UUID field", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog").getByText("Property UUID")).toBeVisible();
  });

  test("dialog has Add field section with Label and Type inputs", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add field")).toBeVisible();
    await expect(dialog.getByText("Label")).toBeVisible();
    await expect(dialog.getByText("Type")).toBeVisible();
  });

  test("dialog 'Add field' button disabled when label is empty", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    // The "+ Add field" button inside the field builder section
    const dialog = page.getByRole("dialog");
    const addFieldBtn = dialog.getByRole("button", { name: /add field/i });
    await expect(addFieldBtn).toBeDisabled();
  });

  test("Create button disabled when template name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /create/i })).toBeDisabled();
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
