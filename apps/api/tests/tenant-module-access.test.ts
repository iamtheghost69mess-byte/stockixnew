import { describe, expect, it } from "vitest";

import { tenantHasLicensedModule } from "../src/lib/tenant-module-access.js";

describe("tenantHasLicensedModule", () => {
  it("allows when tenant and license include the module", () => {
    expect(
      tenantHasLicensedModule('["accounting","pos"]', ["accounting", "pos"], "pos"),
    ).toEqual({ ok: true });
  });

  it("rejects when tenant lacks the module", () => {
    const result = tenantHasLicensedModule('["accounting"]', ["accounting", "pos"], "pos");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("pos");
    }
  });

  it("rejects when license lacks the module", () => {
    const result = tenantHasLicensedModule('["accounting","pos"]', ["accounting"], "pos");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("license");
    }
  });

  it("allows tenant module when no license modules are provided", () => {
    expect(tenantHasLicensedModule('["pos"]', null, "pos")).toEqual({ ok: true });
  });
});
