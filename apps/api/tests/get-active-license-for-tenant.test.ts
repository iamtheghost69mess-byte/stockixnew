import { describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import {
  getActiveLicenseForTenant,
  getLicenseExpiry,
  isLicenseLimitsConsistentWithPlan,
  type TenantLicenseRow,
} from "../src/license-utils.js";

function makeLicense(overrides: Partial<TenantLicenseRow>): TenantLicenseRow {
  const now = new Date();
  return {
    id: "lic-11111111-1111-1111-1111-111111111111",
    licenseKey: "STKX-AAAA-BBBB-CCCC",
    product: "platform",
    planSlug: "starter",
    tenantId: "tenant-11111111-1111-1111-1111-111111111111",
    status: "active",
    activatedAt: now,
    validFrom: null,
    expiresAt: new Date(now.getTime() + 86_400_000 * 30),
    isPerpetual: false,
    maxActivations: 1,
    maxOrganizations: 5,
    activationCount: 0,
    gracePeriodDays: 7,
    notes: null,
    createdById: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createSelectLimitMock(
  perpetual: TenantLicenseRow[],
  active: TenantLicenseRow[],
  expired: TenantLicenseRow[],
): ReturnType<typeof vi.fn> {
  const steps = [perpetual, active, expired];
  let step = 0;
  return vi.fn(async () => {
    const rows = steps[step] ?? [];
    step += 1;
    return rows;
  });
}

function createMockDb(
  perpetual: TenantLicenseRow[],
  active: TenantLicenseRow[],
  expired: TenantLicenseRow[],
) {
  const limit = createSelectLimitMock(perpetual, active, expired);
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({ limit })),
      })),
    })),
  }));
  return { select } as unknown as PostgresJsDatabase<typeof schema>;
}

describe("getActiveLicenseForTenant", () => {
  it("returns perpetual license over dated one", async () => {
    const perpetual = makeLicense({
      id: "lic-perpetual",
      isPerpetual: true,
      planSlug: "enterprise",
    });
    const dated = makeLicense({
      id: "lic-dated",
      isPerpetual: false,
      expiresAt: new Date(Date.now() + 86_400_000 * 60),
    });
    const db = createMockDb([perpetual], [dated], []);

    const result = await getActiveLicenseForTenant(db, perpetual.tenantId!);

    expect(result?.id).toBe("lic-perpetual");
    expect(result?.isPerpetual).toBe(true);
  });

  it("returns latest expiry when multiple active dated licenses", async () => {
    const earlier = makeLicense({
      id: "lic-sooner",
      isPerpetual: false,
      expiresAt: new Date(Date.now() + 86_400_000 * 10),
    });
    const later = makeLicense({
      id: "lic-later",
      isPerpetual: false,
      expiresAt: new Date(Date.now() + 86_400_000 * 60),
    });
    const db = createMockDb([], [later], []);

    const result = await getActiveLicenseForTenant(db, later.tenantId!);

    expect(result?.id).toBe("lic-later");
  });

  it("returns expired license as fallback when no active", async () => {
    const expired = makeLicense({
      id: "lic-expired",
      status: "expired",
      isPerpetual: false,
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    const db = createMockDb([], [], [expired]);

    const result = await getActiveLicenseForTenant(db, expired.tenantId!);

    expect(result?.id).toBe("lic-expired");
    expect(result?.status).toBe("expired");
  });

  it("returns null when tenant has no licenses", async () => {
    const db = createMockDb([], [], []);

    const result = await getActiveLicenseForTenant(
      db,
      "tenant-11111111-1111-1111-1111-111111111111",
    );

    expect(result).toBeNull();
  });

  it("does not return revoked license", async () => {
    const revoked = makeLicense({
      id: "lic-revoked",
      status: "revoked",
    });
    const db = createMockDb([], [], []);

    const result = await getActiveLicenseForTenant(db, revoked.tenantId!);

    expect(result).toBeNull();
  });
});

describe("isLicenseLimitsConsistentWithPlan", () => {
  it("returns true when license limits match plan", async () => {
    const license = makeLicense({ maxOrganizations: 10, maxActivations: 5 });
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ maxOrganizations: 10, maxActivations: 5 }]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    }));
    const db = { select } as unknown as PostgresJsDatabase<typeof schema>;

    const result = await isLicenseLimitsConsistentWithPlan(db, license);

    expect(result).toBe(true);
  });

  it("returns false when license limits drift from plan", async () => {
    const license = makeLicense({ maxOrganizations: 8, maxActivations: 5 });
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ maxOrganizations: 10, maxActivations: 5 }]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    }));
    const db = { select } as unknown as PostgresJsDatabase<typeof schema>;

    const result = await isLicenseLimitsConsistentWithPlan(db, license);

    expect(result).toBe(false);
  });
});

describe("getLicenseExpiry", () => {
  it("returns expiresAt for active time-limited license", async () => {
    const expiresAt = new Date("2030-06-01T00:00:00.000Z");
    const license = makeLicense({ expiresAt, isPerpetual: false });
    const db = createMockDb([], [license], []);

    const result = await getLicenseExpiry(db, license.tenantId!);
    expect(result?.toISOString()).toBe(expiresAt.toISOString());
  });

  it("returns far-future date for perpetual license", async () => {
    const license = makeLicense({ isPerpetual: true, expiresAt: null });
    const db = createMockDb([license], [], []);

    const result = await getLicenseExpiry(db, license.tenantId!);
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBeGreaterThan(new Date().getUTCFullYear() + 50);
  });
});
