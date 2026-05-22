import { describe, expect, it } from "vitest";
import {
  mapStockixLicenseStatus,
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
