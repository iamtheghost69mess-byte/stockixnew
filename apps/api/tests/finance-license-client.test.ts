import { describe, expect, it } from "vitest";
import { syncFinanceLicenseForStockixTenant } from "../src/finance-license.client.js";

describe("finance-license.client", () => {
  it("uses a no-op default logger when log is omitted", () => {
    expect(syncFinanceLicenseForStockixTenant.length).toBeLessThanOrEqual(3);
    expect(syncFinanceLicenseForStockixTenant.toString()).toMatch(
      /log\s*=\s*\(\)\s*=>\s*\{\}/,
    );
  });
});
