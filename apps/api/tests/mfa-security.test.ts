/**
 * MFA security unit tests — AES-256-GCM encryption and TOTP replay prevention.
 * These tests import the actual mfa.ts implementations (no mfa.js mock).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Redis mock — must be declared before any imports that use it ──────────────

const redisMock = {
  set: vi.fn<[string, string, string, number, string], Promise<string | null>>(),
};

vi.mock("../src/lib/redis.js", () => ({
  getControlPlaneRedisClient: () => redisMock,
}));

// ── MFA encryption tests ──────────────────────────────────────────────────────

const VALID_KEY_HEX = "a".repeat(64); // 32 bytes of 0xaa

describe("MFA secret encryption (AES-256-GCM)", () => {
  const originalKey = process.env.MFA_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.MFA_ENCRYPTION_KEY;
    } else {
      process.env.MFA_ENCRYPTION_KEY = originalKey;
    }
    vi.resetModules();
  });

  it("returns plaintext unchanged when no encryption key is set", async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    const { encryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    expect(encryptMfaSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("encrypts with enc:v1: prefix when key is configured", async () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_KEY_HEX;
    const { encryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    expect(encryptMfaSecret("JBSWY3DPEHPK3PXP")).toMatch(/^enc:v1:/);
  });

  it("round-trips: encrypt then decrypt recovers original plaintext", async () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_KEY_HEX;
    const { encryptMfaSecret, decryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptMfaSecret(secret);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptMfaSecret(encrypted)).toBe(secret);
  });

  it("each encrypt call produces a unique ciphertext (random IV)", async () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_KEY_HEX;
    const { encryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    const e1 = encryptMfaSecret("JBSWY3DPEHPK3PXP");
    const e2 = encryptMfaSecret("JBSWY3DPEHPK3PXP");
    expect(e1).not.toBe(e2);
  });

  it("decryptMfaSecret returns plaintext value unchanged (legacy compat)", async () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_KEY_HEX;
    const { decryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    expect(decryptMfaSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("decryptMfaSecret throws when key absent but value has enc:v1: prefix", async () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_KEY_HEX;
    const { encryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP");

    vi.resetModules();
    delete process.env.MFA_ENCRYPTION_KEY;
    const { decryptMfaSecret } = await import("../src/services/mfa/mfa.js");
    expect(() => decryptMfaSecret(encrypted)).toThrow("MFA_ENCRYPTION_KEY required");
  });
});

// ── TOTP replay prevention tests ──────────────────────────────────────────────

describe("TOTP replay prevention (assertNoTotpReplay)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns true (allowed) when Redis NX succeeds (first use)", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    const { assertNoTotpReplay } = await import("../src/services/mfa/mfa.js");
    const allowed = await assertNoTotpReplay("owner-1", "123456");
    expect(allowed).toBe(true);
  });

  it("calls Redis SET with key mfa:used:{ownerId}:{code}", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    const { assertNoTotpReplay } = await import("../src/services/mfa/mfa.js");
    await assertNoTotpReplay("abc-123", "999888");
    const args = redisMock.set.mock.calls[0];
    expect(args).toBeDefined();
    expect(args![0]).toBe("mfa:used:abc-123:999888");
  });

  it("sets 90 second TTL on the replay key", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    const { assertNoTotpReplay } = await import("../src/services/mfa/mfa.js");
    await assertNoTotpReplay("owner-1", "123456");
    const args = redisMock.set.mock.calls[0];
    expect(args![3]).toBe(90);
  });

  it("uses NX flag so a second call with the same code is blocked", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    redisMock.set.mockResolvedValueOnce(null); // NX fails — key exists
    const { assertNoTotpReplay } = await import("../src/services/mfa/mfa.js");
    const first = await assertNoTotpReplay("owner-1", "123456");
    const second = await assertNoTotpReplay("owner-1", "123456");
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
