import { CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Knex from 'knex';
import {
  buildSystemKnexOptionsFromConfig,
  buildTenantKnexOptionsFromConfig,
} from '@/database/finance-knex-options';

@Injectable()
export abstract class BaseCommand extends CommandRunner {
  constructor(protected readonly configService: ConfigService) {
    super();
  }

  protected initSystemKnex(): Knex {
    return Knex(
      buildSystemKnexOptionsFromConfig(this.configService, {
        pool: { min: 0, max: 7 },
        migrations: {
          directory: this.configService.get('systemDatabase.migrationDir'),
          loadExtensions: ['.js'],
        },
        seeds: {
          directory: this.configService.get('systemDatabase.seedsDir'),
        },
      }),
    );
  }

  protected initTenantKnex(organizationId: string = ''): Knex {
    const prefix = this.configService.get<string>('tenantDatabase.dbNamePrefix') ?? '';
    const database = `${prefix}${organizationId}`;
    return Knex(
      buildTenantKnexOptionsFromConfig(this.configService, database, {
        pool: { min: 0, max: 5 },
        migrations: {
          directory:
            this.configService.get('tenantDatabase.migrationsDir') ||
            './src/database/migrations',
          loadExtensions: ['.js'],
        },
        seeds: {
          directory:
            this.configService.get('tenantDatabase.seedsDir') ||
            './src/database/seeds/core',
        },
      }),
    );
  }

  protected getAllSystemTenants(knex: Knex) {
    return knex('tenants');
  }

  protected getAllInitializedTenants(knex: Knex) {
    return knex('tenants').whereNotNull('initializedAt');
  }

  protected exit(text: unknown): never {
    if (text instanceof Error) {
      console.error(`Error: ${text.message}\n${text.stack}`);
    } else {
      console.error(`Error: ${text}`);
    }
    process.exit(1);
  }

  protected success(text: string): never {
    console.log(text);
    process.exit(0);
  }

  protected log(text: string): void {
    console.log(text);
  }
}
