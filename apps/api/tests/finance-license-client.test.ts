import { describe, expect, it } from "vitest";
import {
  buildFinanceLicenseLimitFields,
  FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS,
  mapStockixLicenseStatus,
  resolveFinanceLicenseLimitFields,
  syncFinanceLicenseForStockixTenant,
} from "../src/finance-license.client.js";

describe("finance-license.client", () => {
  it("uses a no-op default logger when log is omitted", () => {
    expect(syncFinanceLicenseForStockixTenant.length).toBeLessThanOrEqual(3);
    expect(syncFinanceLicenseForStockixTenant.toString()).toMatch(
      /log\s*=\s*\(\)\s*=>\s*\{\}/,
    );
  });
});

describe("Finance sync payload — field semantics", () => {
  it("sends maxActivations as separate field from maxUsers", () => {
    const payload = buildFinanceLicenseLimitFields({
      maxActivations: 3,
      maxOrganizations: 5,
    });

    expect(payload.maxActivations).toBe(3);
    expect(payload.maxUsers).not.toBe(3);
    expect(payload.maxUsers).toBe(FINANCE_LICENSE_SYNC_DEFAULT_MAX_USERS);
  });

  it("maxOrganizations syncs correctly", () => {
    const payload = buildFinanceLicenseLimitFields({
      maxOrganizations: 5,
      maxActivations: 3,
    });
    expect(payload.maxOrganizations).toBe(5);
  });

  it("uses plan limits when license is null", () => {
    const payload = buildFinanceLicenseLimitFields(null, {
      maxOrganizations: 3,
      maxActivations: 2,
      maxUsers: 50,
    });
    expect(payload.maxOrganizations).toBe(3);
    expect(payload.maxActivations).toBe(2);
    expect(payload.maxUsers).toBe(50);
  });

  it("upgrades sentinel license limit 1 from plan maxOrganizations 3", () => {
    const payload = resolveFinanceLicenseLimitFields(
      { maxOrganizations: 1, maxActivations: 1 },
      { maxOrganizations: 3, maxActivations: 5, maxUsers: 10 },
    );
    expect(payload.maxOrganizations).toBe(3);
    expect(payload.maxActivations).toBe(5);
  });
});

describe("mapStockixLicenseStatus — revoked", () => {
  const baseLicense = {
    isPerpetual: false,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    gracePeriodDays: 7,
  };

  it("maps revoked license to revoked (not suspended)", () => {
    const result = mapStockixLicenseStatus(
      { ...baseLicense, status: "revoked" },
      "active",
    );
    expect(result).toBe("revoked");
    expect(result).not.toBe("suspended");
  });

  it("maps suspended tenant to suspended regardless of license", () => {
    const result = mapStockixLicenseStatus(
      { ...baseLicense, status: "active", isPerpetual: true },
      "suspended",
    );
    expect(result).toBe("suspended");
  });
});
