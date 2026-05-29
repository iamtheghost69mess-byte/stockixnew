import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const posProxyJson = vi.fn();

vi.mock("../src/pos-proxy.js", () => ({
  posProxyJson: (...args: unknown[]) => posProxyJson(...args),
}));

const {
  suspendPosOrgForLicense,
  syncPosOrgLicenseWindow,
  reactivatePosOrgForLicense,
  syncPosOrgLicenseMetadata,
  resolveLicenseWindowDates,
} = await import("../src/pos-license-sync.js");

describe("suspendPosOrgForLicense", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const posOrgId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    posProxyJson.mockReset();
  });

  function buildDb(modules: string[], posOrganizationId: string | null) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  modules: JSON.stringify(modules),
                  posOrganizationId,
                },
              ]),
            })),
          })),
        })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>;
  }

  it("calls POS suspend when tenant has pos module and org id", async () => {
    posProxyJson.mockResolvedValueOnce({ status: 200, data: { success: true } });
    const result = await suspendPosOrgForLicense(
      buildDb(["accounting", "pos"], posOrgId),
      tenantId,
      "license_revoked",
    );
    expect(result).toEqual({ ok: true });
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/suspend`,
      "POST",
      { reason: "license_revoked" },
    );
  });

  it("skips when pos module is not licensed", async () => {
    await suspendPosOrgForLicense(buildDb(["accounting"], posOrgId), tenantId, "license_expired");
    expect(posProxyJson).not.toHaveBeenCalled();
  });

  it("skips when pos organization is not linked", async () => {
    const result = await suspendPosOrgForLicense(
      buildDb(["pos"], null),
      tenantId,
      "license_expired",
    );
    expect(result).toEqual({ ok: true });
    expect(posProxyJson).not.toHaveBeenCalled();
  });

  it("returns error when POS suspend proxy fails", async () => {
    posProxyJson.mockResolvedValueOnce({ status: 502, data: { message: "bad gateway" } });
    const result = await suspendPosOrgForLicense(
      buildDb(["pos"], posOrgId),
      tenantId,
      "license_suspended",
    );
    expect(result).toEqual({ ok: false, error: "bad gateway" });
  });
});

describe("syncPosOrgLicenseWindow", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const posOrgId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    posProxyJson.mockReset();
  });

  function buildDb(modules: string[], posOrganizationId: string | null) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  modules: JSON.stringify(modules),
                  posOrganizationId,
                },
              ]),
            })),
          })),
        })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>;
  }

  it("patches POS org license window when pos is licensed", async () => {
    posProxyJson.mockResolvedValueOnce({ status: 200, data: { success: true } });
    const startsAt = new Date("2026-01-01T00:00:00.000Z");
    const endsAt = new Date("2027-01-01T00:00:00.000Z");
    await syncPosOrgLicenseWindow(
      buildDb(["accounting", "pos"], posOrgId),
      tenantId,
      { startsAt, endsAt },
    );
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/license`,
      "PATCH",
      {
        licenseStartsAt: startsAt.toISOString(),
        licenseEndsAt: endsAt.toISOString(),
      },
    );
  });
});

describe("reactivatePosOrgForLicense", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const posOrgId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    posProxyJson.mockReset();
  });

  function buildDb(modules: string[], posOrganizationId: string | null) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  modules: JSON.stringify(modules),
                  posOrganizationId,
                },
              ]),
            })),
          })),
        })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>;
  }

  it("patches POS org lifecycle to active", async () => {
    posProxyJson.mockResolvedValueOnce({ status: 200, data: { success: true } });
    await reactivatePosOrgForLicense(buildDb(["pos"], posOrgId), tenantId);
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/lifecycle`,
      "PATCH",
      { lifecycle: "active", lifecycleReasonCode: "license_reactivated" },
    );
  });
});

describe("syncPosOrgLicenseMetadata", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const posOrgId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    posProxyJson.mockReset();
  });

  function buildDb(modules: string[], posOrganizationId: string | null) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  modules: JSON.stringify(modules),
                  posOrganizationId,
                },
              ]),
            })),
          })),
        })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>;
  }

  it("patches license key metadata to POS org", async () => {
    posProxyJson.mockResolvedValueOnce({ status: 200, data: { success: true } });
    const result = await syncPosOrgLicenseMetadata(
      buildDb(["pos"], posOrgId),
      tenantId,
      {
        licenseKey: "STXI-TEST-LICENSE-KEY-0001", // gitleaks:allow
        stockixTenantId: tenantId,
        licenseKeyFormat: "stxi",
        scopedLocationId: "507f1f77bcf86cd799439012",
      },
    );
    expect(result).toEqual({ ok: true });
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/license`,
      "PATCH",
      expect.objectContaining({
        licenseKey: "STXI-TEST-LICENSE-KEY-0001", // gitleaks:allow
        stockixTenantId: tenantId,
        licenseKeyFormat: "stxi",
        scopedLocationId: "507f1f77bcf86cd799439012",
      }),
    );
  });
});

describe("resolveLicenseWindowDates", () => {
  it("uses far-future end for perpetual licenses", async () => {
    const startsAt = new Date("2026-01-01T00:00:00.000Z");
    const { startsAt: outStart, endsAt } = resolveLicenseWindowDates({
      isPerpetual: true,
      expiresAt: null,
      validFrom: startsAt,
      activatedAt: null,
    });
    expect(outStart).toEqual(startsAt);
    expect(endsAt.getUTCFullYear()).toBe(2126);
  });

  it("uses expiresAt for dated licenses", async () => {
    const expiresAt = new Date("2027-06-01T00:00:00.000Z");
    const { endsAt } = resolveLicenseWindowDates({
      isPerpetual: false,
      expiresAt,
      validFrom: null,
      activatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(endsAt).toEqual(expiresAt);
  });
});
