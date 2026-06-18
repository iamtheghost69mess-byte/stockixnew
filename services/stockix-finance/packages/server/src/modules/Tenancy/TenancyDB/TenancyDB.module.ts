import knex, { Knex } from 'knex';
import LRUCache from 'lru-cache';
import { Global, Module } from '@nestjs/common';
import { ClsModule, ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { buildTenantKnexOptionsFromConfig } from '@/database/finance-knex-options';
import { NativeFsMigrations } from '@/database/native-fs-migrations';
import { sanitizeDatabaseName } from '@/utils/sanitize-database-name';
import { TENANCY_DB_CONNECTION } from './TenancyDB.constants';
import { UnitOfWork } from './UnitOfWork.service';

const lruCache = new LRUCache();

// webpack replaces require() with a synthetic module system that only contains
// statically-analyzed modules. When Knex calls importFile(absolutePath) at runtime
// for each migration file, webpack throws webpackEmptyContext. We bypass this by
// using Node's native createRequire, which webpack cannot intercept because
// require('module') passes through to Node's built-in module loader.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NativeModule = require('module');
// Seed/migration files use a .ts extension but are plain CommonJS JS with no TypeScript
// syntax. Register .ts on the real Node module loader (Module._extensions) so nativeRequire
// can load them — webpack's synthetic require.extensions is not the same object.
if (!NativeModule._extensions['.ts']) {
  NativeModule._extensions['.ts'] = NativeModule._extensions['.js'];
}
const nativeRequire: NodeRequire = NativeModule.createRequire(__filename);

class NativeMigrationSource {
  constructor(private readonly migrationsDir: string) {}

  async getMigrations(_loadExtensions: string[]): Promise<string[]> {
    return fs
      .readdirSync(this.migrationsDir)
      .filter((f) => ['.js', '.ts'].includes(path.extname(f)))
      .sort();
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getMigration(migration: string): Promise<any> {
    return nativeRequire(path.join(this.migrationsDir, migration));
  }
}

export const TenancyDatabaseProxyProvider = ClsModule.forFeatureAsync({
  provide: TENANCY_DB_CONNECTION,
  global: true,
  inject: [ConfigService, ClsService],
  useFactory: async (configService: ConfigService, cls: ClsService) => () => {
    const organizationId = cls.get('organizationId');
    const prefix =
      configService.get<string>('tenantDatabase.dbNamePrefix') ??
      'stockix_tenant_';
    const database = sanitizeDatabaseName(`${prefix}${organizationId}`);
    const cachedInstance = lruCache.get(database);

    if (cachedInstance) {
      return cachedInstance;
    }
    const migrationsDir = configService.get<string>('tenantDatabase.migrationsDir');
    const knexInstance = knex({
      ...(buildTenantKnexOptionsFromConfig(configService, database, {
        pool: { min: 0, max: 7 },
        migrations: {
          migrationSource: new NativeFsMigrations(migrationsDir, false, ['.js']) as any,
        },
        seeds: {
          directory: configService.get('tenantDatabase.seedsDir'),
        },
      }) as Knex.Config),
      userParams: {
        organizationId,
        tenantId: cls.get('tenantId'),
      },
    } as Knex.Config);
    lruCache.set(database, knexInstance);

    return knexInstance;
  },
  type: 'function',
} as any);

@Global()
@Module({
  imports: [TenancyDatabaseProxyProvider],
  providers: [UnitOfWork],
  exports: [UnitOfWork],
})
export class TenancyDatabaseModule {}
