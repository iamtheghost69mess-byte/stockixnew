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
    // Knex 0.95.x exposes `seed` as a getter (`get() { return new Seeder(this); }`),
    // so patching the returned instance is useless — every access creates a fresh Seeder.
    // We redefine the getter on the instance itself via Object.defineProperty so that
    // every new Seeder is immediately patched to use nativeRequire instead of webpack's
    // synthetic require() (webpackEmptyContext) in _waterfallBatch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SeederCtor = ((knexInstance as any).seed as any).constructor;
    Object.defineProperty(knexInstance, 'seed', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: function (): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const seeder: any = new SeederCtor(knexInstance);
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
        return seeder;
      },
      configurable: true,
    });

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
