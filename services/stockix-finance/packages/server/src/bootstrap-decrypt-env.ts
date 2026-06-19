import { decryptEncryptedEnvVars } from '@repo/shared/deployment-secrets';

const SENSITIVE_ENV_KEYS = [
  'DB_PASSWORD',
  'DB_ROOT_PASSWORD',
  'SYSTEM_DB_PASSWORD',
  'TENANT_DB_PASSWORD',
  // APP_JWT_SECRET must be listed before JWT_SECRET: jwt.ts prefers APP_JWT_SECRET
  // and it must be decrypted or the server signs tokens with the raw encrypted string.
  'APP_JWT_SECRET',
  'JWT_SECRET',
  'MAIL_PASSWORD',
  'AGENDASH_AUTH_PASSWORD',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

// The worker writes DEPLOYMENT_SECRET_KEY as sha256(raw).hex into the tenant .env
// (apiConfig.deploymentSecretKey in packages/config). Use it directly — no re-derivation.
decryptEncryptedEnvVars(SENSITIVE_ENV_KEYS, process.env.DEPLOYMENT_SECRET_KEY?.trim());
