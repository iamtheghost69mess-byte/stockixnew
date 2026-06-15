import { describe, expect, it } from "vitest";

import { tenantProvisionLockId } from "./provision-lock.js";

describe("tenantProvisionLockId", () => {
  it("returns a stable 32-bit lock id for the same tenant", () => {
    const tenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(tenantProvisionLockId(tenantId)).toBe(tenantProvisionLockId(tenantId));
  });

  it("returns different lock ids for different tenants", () => {
    const a = tenantProvisionLockId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const b = tenantProvisionLockId("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });
});
