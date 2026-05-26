import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptDeploymentSecret,
  encryptDeploymentSecret,
  isEncryptedDeploymentSecret,
} from "@repo/shared/deployment-secrets";

const TEST_KEY = randomBytes(32).toString("hex");

describe("@repo/shared/deployment-secrets", () => {
  it("round-trips encrypt and decrypt", () => {
    const plain = "super-secret-password-123";
    const enc = encryptDeploymentSecret(plain, TEST_KEY);
    expect(isEncryptedDeploymentSecret(enc)).toBe(true);
    expect(decryptDeploymentSecret(enc, TEST_KEY)).toBe(plain);
  });

  it("returns null for invalid ciphertext", () => {
    expect(decryptDeploymentSecret("not-encrypted", TEST_KEY)).toBeNull();
    expect(decryptDeploymentSecret("enc:v1:bad", TEST_KEY)).toBeNull();
  });
});
