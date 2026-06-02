import { createHash, randomBytes } from "node:crypto";
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

  it("control-plane → finance server key derivation contract", () => {
    // Control-plane: raw env var → sha256 → derivedKey (apiConfig.deploymentSecretKey)
    // Worker writes derivedKey into tenant .env as DEPLOYMENT_SECRET_KEY
    // Finance server reads derivedKey directly — no re-hashing (bootstrap-decrypt-env.ts)
    const rawEnvKey = randomBytes(32).toString("hex");
    const derivedKey = createHash("sha256").update(rawEnvKey).digest("hex");

    const encrypted = encryptDeploymentSecret("tenant-db-password", derivedKey);

    expect(decryptDeploymentSecret(encrypted, derivedKey)).toBe("tenant-db-password");

    // Regression guard: double-hashing (the old bug) must produce the wrong key
    const doubleHashed = createHash("sha256").update(derivedKey).digest("hex");
    expect(decryptDeploymentSecret(encrypted, doubleHashed)).toBeNull();
  });
});
