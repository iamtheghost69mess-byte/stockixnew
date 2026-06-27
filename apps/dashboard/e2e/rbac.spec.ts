import { test, expect } from "@playwright/test";

test.describe("RBAC UI Integration", () => {
  test.beforeEach(async ({ page }) => {
    // Mock me to return super_admin with * permissions
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "owner-1", email: "admin@localhost.test", role: "super_admin", permissions: ["*"] }),
      });
    });
  });

  test("Platform roles page rendering, create, and edit", async ({ page }) => {
    let rolesMock = [
      { id: "role-1", name: "Super Admin", slug: "super_admin", isSystem: true, permissions: ["*"] },
      { id: "role-2", name: "Read Only", slug: "read_only", isSystem: true, permissions: ["tenants.read"] },
    ];

    await page.route("**/api/admin/roles", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const newRole = { id: "role-3", ...body, isSystem: false };
        rolesMock.push(newRole);
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ role: newRole }) });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ roles: rolesMock, allPermissions: ["*", "tenants.read", "tenants.write", "roles.manage"] }),
        });
      }
    });

    await page.route("**/api/admin/roles/*", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        const id = route.request().url().split("/").pop();
        const role = rolesMock.find(r => r.id === id);
        if (role && body.permissions) {
          role.permissions = body.permissions;
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ role }) });
      }
    });

    await page.goto("/settings/roles");

    // Verify list
    await expect(page.getByText("Platform roles")).toBeVisible();
    await expect(page.getByText("Super Admin (super_admin)")).toBeVisible();
    await expect(page.getByText("Read Only (read_only)")).toBeVisible();

    // Create custom role
    await page.getByLabel("Name").fill("Finance Manager");
    await page.getByLabel("Slug").fill("finance_manager");
    await page.getByRole("button", { name: "Create role" }).click();
    
    // Check that toast shows and it appears in list
    await expect(page.getByText("Role created")).toBeVisible();
    await expect(page.getByText("Finance Manager (finance_manager)")).toBeVisible();

    // Edit permissions on Read Only role
    // Using a parent locator that contains "Read Only"
    const readOnlyCard = page.locator("div.rounded-xl", { hasText: /^Read Only/ }).first();
    const writeCheckboxLabel = readOnlyCard.locator("label", { hasText: "tenants.write" });
    await writeCheckboxLabel.click();
    await readOnlyCard.getByRole("button", { name: "Save permissions" }).click();
    await expect(page.getByText("Updated Read Only")).toBeVisible();
  });
});
