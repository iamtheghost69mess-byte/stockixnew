import { createRequire } from 'node:module';
import path from 'node:path';

const nativeRequire = createRequire(__filename);

type MigrationEntry = { file: string; directory: string };

/**
 * Knex migration source that loads .js files via Node createRequire.
 * Required when the API runs from the webpack bundle — default knex require()
 * can fail with "Cannot find module" for on-disk migration files.
 */
export class NativeFsMigrations {
  private readonly migrationPaths: string[];

  constructor(
    migrationDirectories: string | string[],
    private readonly sortDirsSeparately = false,
    private readonly loadExtensions: string[] = ['.js'],
  ) {
    this.migrationPaths = Array.isArray(migrationDirectories)
      ? migrationDirectories
      : [migrationDirectories];
  }

  getMigrations(_loadExtensions?: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FsMigrations } = require('knex/lib/migrations/migrate/sources/fs-migrations');
    const delegate = new FsMigrations(
      this.migrationPaths,
      this.sortDirsSeparately,
      this.loadExtensions,
    );
    return delegate.getMigrations(this.loadExtensions);
  }

  getMigrationName(migration: MigrationEntry): string {
    return migration.file;
  }

  getMigration(migration: MigrationEntry) {
    const absoluteDir = path.resolve(process.cwd(), migration.directory);
    const migrationPath = path.join(absoluteDir, migration.file);
    return Promise.resolve(nativeRequire(migrationPath));
  }
}
