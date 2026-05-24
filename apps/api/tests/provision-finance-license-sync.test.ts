import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
  syncFinanceLicenseForStockixTenant,
} from "../src/finance-license.client.js";

vi.mock("../src/license-utils.js", () => ({
  getActiveLicenseForTenant: vi.fn(async () => ({
    id: "lic-provision-1",
    planSlug: "growth",
    status: "active",
    isPerpetual: true,
    validFrom: new Date("2026-01-01"),
    expiresAt: null,
    gracePeriodDays: 7,
    maxOrganizations: 3,
    maxActivations: 2,
    tenantId: "tenant-provision-1",
  })),
  getPlanLimits: vi.fn(async () => ({
    maxOrganizations: 3,
    maxActivations: 2,
    maxUsers: 25,
  })),
  insertLicenseHistory: vi.fn(async () => undefined),
  isLicenseLimitsConsistentWithPlan: vi.fn(async () => true),
}));

describe("provision finance license sync", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("syncs plan maxOrganizations 3 to Finance after provision", async () => {
    let postedBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      postedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ internalPort: 4100 }]),
          })),
        })),
      })),
    } as never;

    await syncFinanceLicenseForStockixTenant(
      db,
      {
        stockixTenantId: "tenant-provision-1",
        financeTenantId: 42,
        internalBaseUrl: "http://127.0.0.1:4100",
      },
      () => {},
    );

    expect(postedBody?.tenantId).toBe(42);
    expect(postedBody?.planSlug).toBe("growth");
    expect(postedBody?.maxOrganizations).toBe(3);
    expect(postedBody?.maxActivations).toBe(2);
    expect(postedBody?.maxUsers).toBe(25);
  });
});
