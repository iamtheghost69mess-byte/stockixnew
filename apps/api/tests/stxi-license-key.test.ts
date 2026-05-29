import { describe, expect, it } from "vitest";
import {
  generateStxiLicenseKey,
  isLegacyStkxKey,
  validateStxiLicenseKey,
} from "@repo/shared/stxi-license-key";

const SECRET = "test-secret";
const TENANT = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LOCATION = "507f1f77bcf86cd799439011";

describe("stxi-license-key", () => {
  it("generates and validates STXI keys", () => {
    const key = generateStxiLicenseKey({
      tenantId: TENANT,
      locationId: LOCATION,
      secret: SECRET,
    });
    expect(key.startsWith("STXI-")).toBe(true);
    expect(
      validateStxiLicenseKey(key, {
        tenantId: TENANT,
        locationId: LOCATION,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("detects legacy STKX keys", () => {
    expect(isLegacyStkxKey("STKX-ABCD-EFGH-IJKL")).toBe(true);
  });
});
