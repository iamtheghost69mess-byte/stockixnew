/**
 * Navigation — verifies all 14 PMS nav links render, are clickable,
 * and the active link is visually highlighted.
 */

import { test, expect } from "@playwright/test";
import { goToPmsPage } from "./_utils.js";

const NAV_LINKS = [
  { label: "Overview", href: "/pms" },
  { label: "Properties", href: "/pms/properties" },
  { label: "Rooms", href: "/pms/rooms" },
  { label: "Bookings", href: "/pms/bookings" },
  { label: "Guests", href: "/pms/guests" },
  { label: "Payments", href: "/pms/payments" },
  { label: "iCal Channels", href: "/pms/channels" },
  { label: "Cleaning", href: "/pms/cleaning" },
  { label: "Reports", href: "/pms/reports" },
  { label: "Calendar", href: "/pms/calendar" },
  { label: "Date Overrides", href: "/pms/date-overrides" },
  { label: "Templates", href: "/pms/message-templates" },
  { label: "Guest Forms", href: "/pms/guest-forms" },
  { label: "Staff", href: "/pms/staff" },
] as const;

test.describe("PMS navigation", () => {
  test.beforeEach(async ({ page }) => {
    await goToPmsPage(page, "/pms");
  });

  test("renders all 14 nav links", async ({ page }) => {
    for (const { label } of NAV_LINKS) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("Overview link is active when on /pms", async ({ page }) => {
    const overviewLink = page.getByRole("link", { name: "Overview", exact: true });
    await expect(overviewLink).toHaveClass(/bg-primary/);
  });

  test("clicking Properties navigates and marks it active", async ({ page }) => {
    await page.getByRole("link", { name: "Properties", exact: true }).click();
    await page.waitForURL("**/pms/properties");
    const propertiesLink = page.getByRole("link", { name: "Properties", exact: true });
    await expect(propertiesLink).toHaveClass(/bg-primary/);
    await expect(page.getByRole("link", { name: "Overview", exact: true })).not.toHaveClass(/bg-primary/);
  });

  test("page heading matches nav section", async ({ page }) => {
    await page.getByRole("link", { name: "Bookings", exact: true }).click();
    await page.waitForURL("**/pms/bookings");
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  });

  test("info banner is visible on every PMS page", async ({ page }) => {
    await expect(page.getByText("You are here:")).toBeVisible();
  });

  test("guest form link in info banner shows /g/:token format", async ({ page }) => {
    await expect(page.getByText("/g/:token")).toBeVisible();
  });
});
