import { randomBytes } from "node:crypto";

import type { ITenantSecretGenerator } from "../contracts.js";

/** Plaintext persistence today; replace with envelope/KMS before high-traffic production. */
export class CryptoTenantSecretGenerator implements ITenantSecretGenerator {
  persistSecret(plaintext: string): string {
    return plaintext;
  }

  randomHex(bytes = 32): string {
    return randomBytes(bytes).toString("hex");
  }

  bootstrapAdminPassword(): string {
    const s = randomBytes(18).toString("base64url");
    return s.length >= 12 ? s.slice(0, 24) : `${s}Aa1!extra`;
  }
}
