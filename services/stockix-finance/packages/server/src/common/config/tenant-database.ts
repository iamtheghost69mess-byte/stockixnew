import * as path from 'path';
import { registerAs } from '@nestjs/config';

export default registerAs('tenantDatabase', () => ({
  client: 'mysql',
  host: process.env.TENANT_DB_HOST || process.env.DB_HOST,
  port: process.env.TENANT_DB_PORT || process.env.DB_PORT || 3306,
  user: process.env.TENANT_DB_USER || process.env.DB_USER,
  password: process.env.TENANT_DB_PASSWORD || process.env.DB_PASSWORD,
  dbNamePrefix: process.env.TENANT_DB_NAME_PERFIX || 'stockix_tenant_',
  // Use global.__root_dir (set in before.ts) so the path resolves correctly
  // whether running from source (ts-node) or from the webpack bundle (/build/).
  migrationsDir: path.join((global as any).__root_dir || path.join(__dirname, '..'), 'src/database/tenant/migrations'),
  seedsDir: path.join((global as any).__root_dir || path.join(__dirname, '..'), 'src/database/tenant/seeds/core'),
}));
