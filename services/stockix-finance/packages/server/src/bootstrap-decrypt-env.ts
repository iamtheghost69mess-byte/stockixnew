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

decryptEncryptedEnvVars(SENSITIVE_ENV_KEYS, process.env.DEPLOYMENT_SECRET_KEY);
