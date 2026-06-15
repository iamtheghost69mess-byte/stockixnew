import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_SECRET = "super-secret-key-for-tests-only-32chars!!";

vi.mock("@repo/config", () => ({
  apiConfig: {
    authTokenSecret: VALID_SECRET,
    licenseSigningSecret: "test-license-signing-secret-32chars",
  },
}));

function setSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.SESSION_SECRET;
  } else {
    process.env.AUTH_TOKEN_SECRET = value;
  }
}

describe("stockix product token", () => {
  beforeEach(() => {
    setSecret(VALID_SECRET);
    vi.resetModules();
  });

  afterEach(() => {
    setSecret(VALID_SECRET);
    vi.resetModules();
  });

  it("parseTenantModules defaults to accounting", async () => {
    const { parseTenantModules } = await import(
      "../src/services/auth/stockix-product-token.js"
    );
    expect(parseTenantModules(undefined)).toEqual(["accounting"]);
    expect(parseTenantModules('["pos","accounting"]')).toEqual(["pos", "accounting"]);
  });

  it("signProductToken includes modules from input", async () => {
    const { signProductToken, verifyProductToken } = await import(
      "../src/services/auth/stockix-product-token.js"
    );
    const token = await signProductToken(
      {} as never,
      {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "660e8400-e29b-41d4-a716-446655440001",
        roles: ["admin"],
        planSlug: "starter",
        modules: ["pos", "accounting"],
      },
    );
    const payload = await verifyProductToken(token);
    expect(payload.modules).toEqual(["pos", "accounting"]);
    expect(payload.tenantId).toBe("660e8400-e29b-41d4-a716-446655440001");
  });
});
