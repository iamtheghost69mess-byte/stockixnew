import { createHmac, randomBytes } from "node:crypto";

import { apiConfig } from "@repo/config";
import { encryptDeploymentSecret } from "@repo/shared/deployment-secrets";

import type { ITenantSecretGenerator } from "../contracts.js";

export class CryptoTenantSecretGenerator implements ITenantSecretGenerator {
  persistSecret(plaintext: string): string {
    return encryptDeploymentSecret(plaintext, apiConfig.deploymentSecretKey);
  }
  randomHex(bytes = 32): string {
    return randomBytes(bytes).toString("hex");
  }
  bootstrapAdminPassword(tenantKey: string): string {
    const key = tenantKey.trim();
    if (key.length === 0) {
      throw new Error("bootstrapAdminPassword requires non-empty tenantKey");
    }
    return randomBytes(24).toString("base64url");
  }
}
