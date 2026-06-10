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

export const TenancyDatabaseProxyProvider = ClsModule.forFeatureAsync({
  provide: TENANCY_DB_CONNECTION,
  global: true,
  strict: true,
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
