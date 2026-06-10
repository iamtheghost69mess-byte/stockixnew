import knex from 'knex';
import LRUCache from 'lru-cache';
import { Global, Module } from '@nestjs/common';
import { knexSnakeCaseMappers } from 'objection';
import { ClsModule, ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
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
    const database = `${prefix}${organizationId}`;
    const cachedInstance = lruCache.get(database);

    if (cachedInstance) {
      return cachedInstance;
    }
    const knexInstance = knex({
      client: configService.get('tenantDatabase.client'),
      connection: {
        host: configService.get('tenantDatabase.host'),
        user: configService.get('tenantDatabase.user'),
        password: configService.get('tenantDatabase.password'),
        database,
        charset: 'utf8',
      },
      migrations: {
        // Providing only migrationSource — no FS options (directory, loadExtensions).
        // Knex resets migrationSource to FsMigrations if any FS-related option is present.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        migrationSource: new NativeMigrationSource(
          configService.get('tenantDatabase.migrationsDir'),
        ) as any,
      },
      seeds: {
        directory: configService.get('tenantDatabase.seedsDir'),
      },
      pool: { min: 0, max: 7 },
      ...knexSnakeCaseMappers({ upperCase: true }),
    });
    // Patch the seed runner to bypass webpack's synthetic require (webpackEmptyContext).
    // Knex 0.95.x's Seeder._waterfallBatch calls require(filepath) at runtime via
    // importFile(), which webpack can't resolve for dynamic paths. We replace the method
    // on the instance with one that uses nativeRequire.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seeder = (knexInstance as any).seed;
    seeder._validateSeedStructure = async (filepath: string) => filepath;
    seeder._waterfallBatch = async (seeds: string[]) => {
      const log: string[] = [];
      for (const seedPath of seeds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = nativeRequire(seedPath);
        const seedFn =
          typeof mod?.seed === 'function'
            ? mod.seed
            : mod?.default?.seed;
        if (typeof seedFn !== 'function') {
          throw new Error(
            `Invalid seed file: ${seedPath} must have a seed function`,
          );
        }
        await seedFn(knexInstance);
        log.push(seedPath);
      }
      return [log];
    };

    lruCache.set(database, knexInstance);

    return knexInstance;
  },
});

@Global()
@Module({
  imports: [TenancyDatabaseProxyProvider],
  providers: [UnitOfWork],
  exports: [UnitOfWork],
})
export class TenancyDatabaseModule {}
