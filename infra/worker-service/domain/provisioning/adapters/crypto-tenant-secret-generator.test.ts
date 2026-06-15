import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import { apiConfig } from "@repo/config";
import { decryptDeploymentSecret } from "@repo/shared/deployment-secrets";
import { CryptoTenantSecretGenerator } from "./crypto-tenant-secret-generator.js";

describe("CryptoTenantSecretGenerator", () => {
  beforeAll(() => {
    if (!process.env.DEPLOYMENT_SECRET_KEY) {
      process.env.DEPLOYMENT_SECRET_KEY = randomBytes(32).toString("hex");
    }
  });

  it("persistSecret returns enc:v1 ciphertext", () => {
    const gen = new CryptoTenantSecretGenerator();
    const enc = gen.persistSecret("test-secret-value");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    const plain = decryptDeploymentSecret(enc, apiConfig.deploymentSecretKey);
    expect(plain).toBe("test-secret-value");
  });
});
