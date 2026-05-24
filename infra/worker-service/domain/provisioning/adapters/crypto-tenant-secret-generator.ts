import { createHmac, randomBytes } from "node:crypto";

import { apiConfig } from "@repo/config";

import type { ITenantSecretGenerator } from "../contracts.js";

export class CryptoTenantSecretGenerator implements ITenantSecretGenerator {
  persistSecret(plaintext: string): string {
    // Returns plaintext intentionally: stockix-finance reads these values as raw
    // process.env strings (DB passwords, JWT secrets, etc.) and has no decryption
    // capability, so returning ciphertext would break MySQL connections.
    // The same secrets ARE encrypted (AES-256-GCM) when stored in the
    // tenant_deployments DB columns via encryptDeploymentSecret().
    // At-rest protection for .env files is enforced via filesystem permissions
    // (file: 0o600, directory: 0o700).
    // TODO: return encrypted value once stockix-finance supports decryption.
    return plaintext;
  }
  randomHex(bytes = 32): string {
    return randomBytes(bytes).toString("hex");
  }
  bootstrapAdminPassword(tenantKey: string): string {
    const key = tenantKey.trim();
    if (key.length === 0) {
      throw new Error("bootstrapAdminPassword requires non-empty tenantKey");
    }
    const secretHex = apiConfig.deploymentSecretKey;
    const hmacKey = Buffer.from(secretHex, "hex");
    return createHmac("sha256", hmacKey).update(`bootstrap:${key}`, "utf8").digest("base64url");
  }
}
