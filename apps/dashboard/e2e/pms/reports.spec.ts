/**
 * Reports page — date range, Occupancy / Revenue / Guests tabs.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

test.describe("Reports page", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms/reports");
  });

  test("shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  });

  test("shows From and To date inputs", async ({ page }) => {
    await expect(page.getByLabel("From")).toBeVisible();
    await expect(page.getByLabel("To")).toBeVisible();
  });

  test("shows Occupancy, Revenue, and Guests tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Occupancy" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Revenue" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Guests" })).toBeVisible();
  });

  test("Occupancy tab is active by default", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Occupancy" })).toHaveAttribute("data-state", "active");
  });

  test("Occupancy tab shows stat cards", async ({ page }) => {
    await expect(page.getByText("Total rooms")).toBeVisible();
    await expect(page.getByText("Active bookings")).toBeVisible();
    await expect(page.getByText("Avg occupancy")).toBeVisible();
  });

  test("Occupancy table has Date, Occupied rooms, Rate columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Date" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Occupied rooms" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Rate" })).toBeVisible();
  });

  test("switching to Revenue tab shows revenue cards", async ({ page }) => {
    await page.getByRole("tab", { name: "Revenue" }).click();
    await expect(page.getByText("Total revenue")).toBeVisible();
    await expect(page.getByText("Collected")).toBeVisible();
    await expect(page.getByText("Outstanding")).toBeVisible();
  });

  test("Revenue tab shows By month and By platform sections", async ({ page }) => {
    await page.getByRole("tab", { name: "Revenue" }).click();
    await expect(page.getByText("By month")).toBeVisible();
    await expect(page.getByText("By platform")).toBeVisible();
  });

  test("switching to Guests tab shows guest stat cards", async ({ page }) => {
    await page.getByRole("tab", { name: "Guests" }).click();
    await expect(page.getByText("Unique guests")).toBeVisible();
    await expect(page.getByText("Total bookings")).toBeVisible();
    await expect(page.getByText("Bookings / guest")).toBeVisible();
  });

  test("no-tenant gate shows when sessionStorage is cleared", async ({ page }) => {
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByText(/select a tenant/i)).toBeVisible();
  });
});
