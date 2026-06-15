/**
 * Calendar page — date range guard, property filter, calendar events.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Calendar page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/calendar");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  });

  test("property selector is visible", async ({ page }) => {
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("From date input is visible", async ({ page }) => {
    await expect(page.getByLabel("From")).toBeVisible();
  });

  test("To date input is visible", async ({ page }) => {
    await expect(page.getByLabel("To")).toBeVisible();
  });

  test("To date input has min attribute (= from date)", async ({ page }) => {
    const toInput = page.getByLabel("To");
    const min = await toInput.getAttribute("min");
    expect(min).toBeTruthy();
  });

  test("To date input has max attribute (730-day cap)", async ({ page }) => {
    const toInput = page.getByLabel("To");
    const max = await toInput.getAttribute("max");
    expect(max).toBeTruthy();
    // Max should be ~730 days from today
    const maxDate = new Date(max!);
    const today = new Date();
    const diffDays = (maxDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(720);
    expect(diffDays).toBeLessThan(740);
  });

  test("From date input has max attribute (same 730-day cap)", async ({ page }) => {
    const fromInput = page.getByLabel("From");
    const max = await fromInput.getAttribute("max");
    expect(max).toBeTruthy();
  });

  test("shows calendar event platform badge 'airbnb'", async ({ page }) => {
    await expect(page.getByText("airbnb")).toBeVisible();
  });

  test("shows event summary 'Blocked'", async ({ page }) => {
    await expect(page.getByText("Blocked")).toBeVisible();
  });

  test("shows event start date '2024-09-01'", async ({ page }) => {
    await expect(page.getByText("2024-09-01")).toBeVisible();
  });

  test("shows event end date '2024-09-07'", async ({ page }) => {
    await expect(page.getByText("2024-09-07")).toBeVisible();
  });

  test("shows UID column with iCal UID", async ({ page }) => {
    await expect(page.getByText(/airbnb-uid-001/)).toBeVisible();
  });

  test("table has Platform, Summary, Start, End, UID columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Platform" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Summary" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Start" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "End" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "UID" })).toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
