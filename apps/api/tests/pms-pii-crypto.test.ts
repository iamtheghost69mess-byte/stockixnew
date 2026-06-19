/**
 * PMS PII field encryption tests — AES-256-GCM round-trips, null handling,
 * backward-compat plaintext passthrough, and encryptGuestPii/decryptGuestPii helpers.
 *
 * These tests import the actual pii-crypto implementation directly (no mocks needed
 * since the module only uses node:crypto and process.env).
 */
import { describe, it, expect, afterEach } from "vitest";

const VALID_KEY = "b".repeat(64); // 32 bytes of 0xBB
const ORIGINAL_KEY = process.env.PMS_FIELD_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.PMS_FIELD_ENCRYPTION_KEY;
  } else {
    process.env.PMS_FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
  // Reset module registry so each test gets a fresh getKey() binding
  // (process.env changes only affect re-imported modules)
});

// ── encryptPmsField / decryptPmsField ─────────────────────────────────────────

describe("encryptPmsField", () => {
  it("returns null for null input", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(encryptPmsField(null)).toBeNull();
  });

  it("returns null for undefined input", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(encryptPmsField(undefined)).toBeNull();
  });

  it("returns plaintext unchanged when no key is set", async () => {
    delete process.env.PMS_FIELD_ENCRYPTION_KEY;
    const { encryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(encryptPmsField("EG1234567")).toBe("EG1234567");
  });

  it("produces enc:v1: prefix when key is configured", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(encryptPmsField("EG1234567")).toMatch(/^enc:v1:/);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    const c1 = encryptPmsField("EG1234567");
    const c2 = encryptPmsField("EG1234567");
    expect(c1).not.toBe(c2);
  });
});

describe("decryptPmsField", () => {
  it("returns null for null input", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { decryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(decryptPmsField(null)).toBeNull();
  });

  it("returns plaintext unchanged when value has no enc:v1: prefix (legacy row)", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { decryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(decryptPmsField("EG1234567")).toBe("EG1234567");
  });

  it("round-trips: encrypt then decrypt recovers original plaintext", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptPmsField, decryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    const original = "A12345678 — المملكة العربية السعودية";
    const encrypted = encryptPmsField(original)!;
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptPmsField(encrypted)).toBe(original);
  });

  it("throws when key is absent but value has enc:v1: prefix", async () => {
    // First encrypt with key present
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    const encrypted = encryptPmsField("passport123")!;

    // Then attempt to decrypt without key
    delete process.env.PMS_FIELD_ENCRYPTION_KEY;
    const { decryptPmsField } = await import("../../../services/pms/src/lib/pii-crypto.js");
    expect(() => decryptPmsField(encrypted)).toThrow("PMS_FIELD_ENCRYPTION_KEY");
  });
});

// ── encryptGuestPii / decryptGuestPii ─────────────────────────────────────────

describe("encryptGuestPii + decryptGuestPii", () => {
  it("encrypts all PII fields and leaves non-PII fields untouched", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptGuestPii } = await import("../../../services/pms/src/lib/pii-crypto.js");

    const input = {
      name: "John Doe",             // not PII — should stay as-is
      email: "john@example.com",    // not PII — should stay as-is
      nationality: "US",
      dateOfBirth: "1985-06-15",
      idNumber: "A1234567",
      passportNumber: "P9876543",
      passportExpiry: "2030-01-01",
      issuedBy: "US State Dept",
      visaNumber: "V001",
      visaFrom: "2024-01-01",
      visaTo: "2024-12-31",
    };

    const result = encryptGuestPii(input);

    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john@example.com");
    expect(result.nationality).toMatch(/^enc:v1:/);
    expect(result.dateOfBirth).toMatch(/^enc:v1:/);
    expect(result.idNumber).toMatch(/^enc:v1:/);
    expect(result.passportNumber).toMatch(/^enc:v1:/);
    expect(result.passportExpiry).toMatch(/^enc:v1:/);
    expect(result.issuedBy).toMatch(/^enc:v1:/);
    expect(result.visaNumber).toMatch(/^enc:v1:/);
    expect(result.visaFrom).toMatch(/^enc:v1:/);
    expect(result.visaTo).toMatch(/^enc:v1:/);
  });

  it("full round-trip through encryptGuestPii → decryptGuestPii", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptGuestPii, decryptGuestPii } = await import("../../../services/pms/src/lib/pii-crypto.js");

    const original = {
      nationality: "FR",
      dateOfBirth: "1990-03-22",
      idNumber: "B9876543",
      passportNumber: "PF123456",
      passportExpiry: "2028-03-22",
      issuedBy: "Préfecture de Paris",
      visaNumber: null,
      visaFrom: null,
      visaTo: null,
    };

    const encrypted = encryptGuestPii(original);
    const decrypted = decryptGuestPii(encrypted);

    expect(decrypted.nationality).toBe("FR");
    expect(decrypted.dateOfBirth).toBe("1990-03-22");
    expect(decrypted.idNumber).toBe("B9876543");
    expect(decrypted.passportNumber).toBe("PF123456");
    expect(decrypted.passportExpiry).toBe("2028-03-22");
    expect(decrypted.issuedBy).toBe("Préfecture de Paris");
    expect(decrypted.visaNumber).toBeNull();
    expect(decrypted.visaFrom).toBeNull();
    expect(decrypted.visaTo).toBeNull();
  });

  it("decryptGuestPii passes through plaintext PII fields (legacy rows without key)", async () => {
    delete process.env.PMS_FIELD_ENCRYPTION_KEY;
    const { decryptGuestPii } = await import("../../../services/pms/src/lib/pii-crypto.js");

    const legacyRow = {
      nationality: "DE",
      passportNumber: "C1234567",
      idNumber: null,
    };

    const result = decryptGuestPii(legacyRow);
    expect(result.nationality).toBe("DE");
    expect(result.passportNumber).toBe("C1234567");
    expect(result.idNumber).toBeNull();
  });

  it("handles partial guest objects (only present fields are processed)", async () => {
    process.env.PMS_FIELD_ENCRYPTION_KEY = VALID_KEY;
    const { encryptGuestPii, decryptGuestPii } = await import("../../../services/pms/src/lib/pii-crypto.js");

    const partial = { passportNumber: "ONLY_THIS" };
    const enc = encryptGuestPii(partial);
    expect(enc.passportNumber).toMatch(/^enc:v1:/);
    // Fields not present in the object are not added
    expect("nationality" in enc).toBe(false);

    const dec = decryptGuestPii(enc);
    expect(dec.passportNumber).toBe("ONLY_THIS");
  });
});
