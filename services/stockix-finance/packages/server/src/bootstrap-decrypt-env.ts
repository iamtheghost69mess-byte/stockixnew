import { createHash } from 'node:crypto';
import { decryptEncryptedEnvVars } from './lib/deployment-secrets';

const SENSITIVE_ENV_KEYS = [
  'DB_PASSWORD',
  'DB_ROOT_PASSWORD',
  'SYSTEM_DB_PASSWORD',
  'TENANT_DB_PASSWORD',
  'JWT_SECRET',
  'MAIL_PASSWORD',
  'AGENDASH_AUTH_PASSWORD',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

// The control-plane API derives the AES key as sha256(DEPLOYMENT_SECRET_KEY).hex
// (see packages/config/src/index.ts apiConfig.deploymentSecretKey).
// Apply the same derivation here so decryption uses the identical 32-byte key.
function deriveKey(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return createHash('sha256').update(trimmed).digest('hex');
}

decryptEncryptedEnvVars(SENSITIVE_ENV_KEYS, deriveKey(process.env.DEPLOYMENT_SECRET_KEY));
