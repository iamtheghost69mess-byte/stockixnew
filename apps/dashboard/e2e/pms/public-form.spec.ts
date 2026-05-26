/**
 * Public guest form (/g/:token) — form render, submit, already-submitted, not-found states.
 */

import { test, expect } from "@playwright/test";
import { mockPublicFormRoutes, SHARE_TOKEN } from "./_utils.js";

test.describe("Public guest form — ready state", () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicFormRoutes(page);
    await page.goto(`/g/${SHARE_TOKEN}`);
  });

  test("shows 'Pre-arrival form' template name", async ({ page }) => {
    await expect(page.getByText("Pre-arrival form")).toBeVisible();
  });

  test("shows guest name 'Ahmed Hassan'", async ({ page }) => {
    await expect(page.getByText(/Hi Ahmed Hassan/)).toBeVisible();
  });

  test("shows check-in and check-out dates", async ({ page }) => {
    await expect(page.getByText(/2024-09-01/)).toBeVisible();
    await expect(page.getByText(/2024-09-07/)).toBeVisible();
  });

  test("shows 'Full name' field", async ({ page }) => {
    await expect(page.getByText("Full name")).toBeVisible();
  });

  test("shows 'Passport number' field", async ({ page }) => {
    await expect(page.getByText("Passport number")).toBeVisible();
  });

  test("shows 'Estimated arrival time' optional field", async ({ page }) => {
    await expect(page.getByText("Estimated arrival time")).toBeVisible();
  });

  test("shows 'I agree to house rules' checkbox field", async ({ page }) => {
    await expect(page.getByText("I agree to house rules")).toBeVisible();
  });

  test("required fields show asterisk indicator", async ({ page }) => {
    // The required asterisk (*) is rendered for required fields
    const labels = page.locator("label");
    await expect(labels.filter({ hasText: "Full name" }).locator("span.text-red-500")).toBeVisible();
  });

  test("Submit button is visible and enabled", async ({ page }) => {
    await expect(page.getByRole("button", { name: /submit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /submit/i })).toBeEnabled();
  });

  test("shows 'pre-arrival form' label in header", async ({ page }) => {
    await expect(page.getByText(/pre-arrival form/i)).toBeVisible();
  });
});

test.describe("Public guest form — already submitted state", () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicFormRoutes(page, { alreadySubmitted: true });
    await page.goto(`/g/${SHARE_TOKEN}`);
  });

  test("shows 'Already submitted' message", async ({ page }) => {
    await expect(page.getByText("Already submitted")).toBeVisible();
  });

  test("shows check circle icon (success state)", async ({ page }) => {
    // CheckCircle2Icon is rendered — verify via the surrounding card content
    await expect(page.getByText("You have already completed this form")).toBeVisible();
  });

  test("shows guest name in already-submitted card", async ({ page }) => {
    await expect(page.getByText(/Hi Ahmed Hassan/)).toBeVisible();
  });

  test("does not show the submit button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /submit/i })).not.toBeVisible();
  });
});

test.describe("Public guest form — not found state", () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicFormRoutes(page, { notFound: true });
    await page.goto(`/g/${SHARE_TOKEN}`);
  });

  test("shows 'Form not found' message", async ({ page }) => {
    await expect(page.getByText("Form not found")).toBeVisible();
  });

  test("shows 'invalid or expired' hint", async ({ page }) => {
    await expect(page.getByText(/invalid or expired/i)).toBeVisible();
  });

  test("does not show Submit button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /submit/i })).not.toBeVisible();
  });
});
