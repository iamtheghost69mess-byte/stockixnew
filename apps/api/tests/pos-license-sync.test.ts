import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const posProxyJson = vi.fn();

vi.mock("../src/pos-proxy.js", () => ({
  posProxyJson: (...args: unknown[]) => posProxyJson(...args),
}));

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
    vi.resetModules();
    const { suspendPosOrgForLicense } = await import("../src/pos-license-sync.js");
    await suspendPosOrgForLicense(buildDb(["accounting", "pos"], posOrgId), tenantId, "license_revoked");
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/suspend`,
      "POST",
      { reason: "license_revoked" },
    );
  });

  it("skips when pos module is not licensed", async () => {
    vi.resetModules();
    const { suspendPosOrgForLicense } = await import("../src/pos-license-sync.js");
    await suspendPosOrgForLicense(buildDb(["accounting"], posOrgId), tenantId, "license_expired");
    expect(posProxyJson).not.toHaveBeenCalled();
  });

  it("skips when pos organization is not linked", async () => {
    vi.resetModules();
    const { suspendPosOrgForLicense } = await import("../src/pos-license-sync.js");
    await suspendPosOrgForLicense(buildDb(["pos"], null), tenantId, "license_expired");
    expect(posProxyJson).not.toHaveBeenCalled();
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
    vi.resetModules();
    const { syncPosOrgLicenseWindow } = await import("../src/pos-license-sync.js");
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
    vi.resetModules();
    const { reactivatePosOrgForLicense } = await import("../src/pos-license-sync.js");
    await reactivatePosOrgForLicense(buildDb(["pos"], posOrgId), tenantId);
    expect(posProxyJson).toHaveBeenCalledWith(
      `/organizations/${encodeURIComponent(posOrgId)}/lifecycle`,
      "PATCH",
      { lifecycle: "active", lifecycleReasonCode: "license_reactivated" },
    );
  });
});

describe("resolveLicenseWindowDates", () => {
  it("uses far-future end for perpetual licenses", async () => {
    vi.resetModules();
    const { resolveLicenseWindowDates } = await import("../src/pos-license-sync.js");
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
    vi.resetModules();
    const { resolveLicenseWindowDates } = await import("../src/pos-license-sync.js");
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
