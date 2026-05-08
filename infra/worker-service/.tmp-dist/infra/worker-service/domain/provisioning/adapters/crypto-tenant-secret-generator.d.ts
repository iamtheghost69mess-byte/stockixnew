import type { ITenantSecretGenerator } from "../contracts.js";
export declare class CryptoTenantSecretGenerator implements ITenantSecretGenerator {
    persistSecret(plaintext: string): string;
    randomHex(bytes?: number): string;
    bootstrapAdminPassword(): string;
}
//# sourceMappingURL=crypto-tenant-secret-generator.d.ts.map