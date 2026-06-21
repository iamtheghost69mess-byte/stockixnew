import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeOrgProvisionRuntime } from "./org-provision-runtime.js";

vi.mock("../domain/provisioning/combined-org-pos-provision.js", () => ({
  provisionCombinedPosForOrganization: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@repo/platform-worker-shared", () => ({
  syncFinanceLicenseForStockixTenant: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../domain/provisioning/adapters/activate-finance-warehouses.js", () => ({
  activateFinanceWarehouses: vi.fn().mockResolvedValue(undefined),
}));

const mockDb = {} as any;

describe("executeOrgProvisionRuntime", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      const urlStr = url.toString();
      
      if (urlStr.includes("/api/internal/provision-user")) {
        return { ok: true, text: async () => JSON.stringify({ data: { organizationId: "org-123", tenantId: 42 } }) };
      }
      if (urlStr.includes("/api/auth/sign-in")) {
        return { ok: true, text: async () => JSON.stringify({ data: { accessToken: "tok", organizationId: "org-123", tenantId: 42 } }) };
      }
      if (urlStr.includes("/api/auth/switch-tenant")) {
        return { ok: true, text: async () => JSON.stringify({ data: { accessToken: "tok-new", organizationId: "org-456" } }) };
      }
      if (urlStr.includes("/api/organization/current")) {
        return { ok: true, json: async () => ({ id: 42 }) };
      }
      if (urlStr.includes("/api/internal/tenants/42/set-parent")) {
        return { ok: true, text: async () => "{}" };
      }
      if (urlStr.includes("/api/organization/build")) {
        return { ok: true, text: async () => JSON.stringify({ data: { message: "Built", organizationId: "org-456" } }) };
      }
      if (urlStr.includes("/api/internal/attach-user-to-tenant")) {
        return { ok: true, text: async () => "{}" };
      }
      if (urlStr.includes("/api/internal/organizations/")) {
        return { ok: true, text: async () => "{}" };
      }
      if (urlStr.includes("/api/internal/tenants/") && urlStr.includes("/copy-from/")) {
        return { ok: true, text: async () => "{}" };
      }
      if (urlStr.includes("/api/settings/organization")) {
        return { ok: true, text: async () => JSON.stringify({ data: { baseCurrency: "USD" } }) };
      }

      return { ok: true, text: async () => "{}" };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("provisions a sub-organization correctly", async () => {
    const log = vi.fn();

    await executeOrgProvisionRuntime(
      mockDb,
      {
        organizationId: "ctrl-org-uuid",
        organizationSlug: "sub-org",
        isPrimary: false,
        adminEmail: "admin@example.com",
        adminFirstName: "Admin",
        adminLastName: "User",
        orgName: "Sub Org",
        mainTenantInternalBaseUrl: "http://finance",
        parentTenantSlug: "main-org",
        stockixTenantId: "stockix-tenant-uuid",
        correlationId: "corr-123",
      },
      log
    );

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Registering new Finance org"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Syncing Finance license"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Building organization database"));
    
    const fetchMock = global.fetch as any;
    const fetchUrls = fetchMock.mock.calls.map((call: any) => call[0].toString());
    
    // It should copy from the parent tenant
    expect(fetchUrls.some((u: string) => u.includes("/copy-from/42"))).toBe(true);
    // It should NOT skip combined POS provision
    const { provisionCombinedPosForOrganization } = await import("../domain/provisioning/combined-org-pos-provision.js");
    expect(provisionCombinedPosForOrganization).toHaveBeenCalled();
  });

  it("skips POS provisioning for primary organization", async () => {
    const log = vi.fn();

    await executeOrgProvisionRuntime(
      mockDb,
      {
        organizationId: "ctrl-org-uuid",
        organizationSlug: "primary-org",
        isPrimary: true, // Primary org!
        adminEmail: "admin@example.com",
        adminFirstName: "Admin",
        adminLastName: "User",
        orgName: "Primary Org",
        mainTenantInternalBaseUrl: "http://finance",
        parentTenantSlug: "primary-org",
        stockixTenantId: "stockix-tenant-uuid",
        correlationId: "corr-123",
      },
      log
    );

    const { provisionCombinedPosForOrganization } = await import("../domain/provisioning/combined-org-pos-provision.js");
    expect(provisionCombinedPosForOrganization).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Skipping combined POS provision"));
  });
});
