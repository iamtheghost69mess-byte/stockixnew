"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoTenantSecretGenerator = void 0;
const node_crypto_1 = require("node:crypto");
class CryptoTenantSecretGenerator {
    persistSecret(plaintext) {
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
    randomHex(bytes = 32) {
        return (0, node_crypto_1.randomBytes)(bytes).toString("hex");
    }
    bootstrapAdminPassword() {
        const s = (0, node_crypto_1.randomBytes)(18).toString("base64url");
        return s.length >= 12 ? s.slice(0, 24) : `${s}Aa1!extra`;
    }
}
exports.CryptoTenantSecretGenerator = CryptoTenantSecretGenerator;
