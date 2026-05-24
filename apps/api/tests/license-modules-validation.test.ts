import { describe, expect, it } from "vitest";
import { validateLicenseModulesForTenant } from "../src/license-utils.js";

describe("validateLicenseModulesForTenant", () => {
  it("accepts when license modules are subset of tenant modules", () => {
    const result = validateLicenseModulesForTenant(
      '["accounting","pos"]',
      ["accounting"],
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects when license includes module not on tenant", () => {
    const result = validateLicenseModulesForTenant('["accounting"]', ["accounting", "pos"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("pos");
    }
  });

  it("defaults tenant to accounting when modules JSON is invalid", () => {
    const result = validateLicenseModulesForTenant("not-json", ["pos"]);
    expect(result.ok).toBe(false);
  });
});
