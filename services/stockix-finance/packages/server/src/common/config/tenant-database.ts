import { existsSync } from 'fs';
import * as path from 'path';
import { registerAs } from '@nestjs/config';

/** Webpack build lands under build/common/config; dev uses src/common/config. */
function resolveTenantDatabaseSubdir(subdir: string): string {
  const candidates = [
    path.join(__dirname, '../../database/tenant', subdir),
    path.join(__dirname, '../../../src/database/tenant', subdir),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

export default registerAs('tenantDatabase', () => ({
  client: 'mysql2',
  host: process.env.TENANT_DB_HOST || process.env.DB_HOST,
  port: process.env.TENANT_DB_PORT || process.env.DB_PORT || 6033,
  user: process.env.TENANT_DB_USER || process.env.DB_USER,
  password: process.env.TENANT_DB_PASSWORD || process.env.DB_PASSWORD,
  dbNamePrefix:
    process.env.TENANT_DB_NAME_PREFIX
    || process.env.TENANT_DB_NAME_PERFIX
    || 'stockix_tenant_',
  migrationsDir: resolveTenantDatabaseSubdir('migrations'),
  seedsDir: resolveTenantDatabaseSubdir('seeds/core'),
}));
