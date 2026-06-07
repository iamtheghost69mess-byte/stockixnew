import type { ConfigService } from '@nestjs/config';
import type { Knex } from 'knex';
import { knexSnakeCaseMappers } from 'objection';

export const FINANCE_MYSQL_DEFAULT_PORT = 6033;
export const FINANCE_MYSQL_CLIENT = 'mysql2' as const;

/** Parse ProxySQL / MySQL port from env or config (default 6033). */
export function parseMysqlPort(
  value: string | number | undefined | null,
  fallback = FINANCE_MYSQL_DEFAULT_PORT,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const port = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

export type FinanceMysqlConnectionInput = {
  host?: string | null;
  port?: string | number | null;
  user?: string | null;
  password?: string | null;
  database: string;
  charset?: string | null;
};

export type FinanceMysqlKnexOptionsInput = FinanceMysqlConnectionInput & {
  pool?: Knex.PoolConfig;
};

/** Shared mysql2 + uppercase identifier mappers — must match migration runner. */
export function buildFinanceMysqlKnexOptions(
  input: FinanceMysqlKnexOptionsInput,
): Knex.Config {
  return {
    client: FINANCE_MYSQL_CLIENT,
    connection: {
      host: input.host ?? undefined,
      port: parseMysqlPort(input.port),
      user: input.user ?? undefined,
      password: input.password ?? undefined,
      database: input.database,
      charset: input.charset?.trim() || 'utf8',
    },
    ...(input.pool ? { pool: input.pool } : {}),
    ...knexSnakeCaseMappers({ upperCase: true }),
  };
}

type KnexExtras = {
  migrations?: Knex.MigratorConfig;
  seeds?: Knex.SeederConfig;
  pool?: Knex.PoolConfig;
};

export function buildSystemKnexOptionsFromConfig(
  configService: ConfigService,
  extras: KnexExtras = {},
): Knex.Config {
  const base = buildFinanceMysqlKnexOptions({
    host: configService.get<string>('systemDatabase.host'),
    port: configService.get<string | number>('systemDatabase.port'),
    user: configService.get<string>('systemDatabase.user'),
    password: configService.get<string>('systemDatabase.password'),
    database: configService.get<string>('systemDatabase.databaseName') ?? '',
    charset: 'utf8',
    pool: extras.pool,
  });

  return {
    ...base,
    ...(extras.migrations ? { migrations: extras.migrations } : {}),
    ...(extras.seeds ? { seeds: extras.seeds } : {}),
  };
}

export function buildTenantKnexOptionsFromConfig(
  configService: ConfigService,
  databaseName: string,
  extras: KnexExtras = {},
): Knex.Config {
  const base = buildFinanceMysqlKnexOptions({
    host: configService.get<string>('tenantDatabase.host'),
    port: configService.get<string | number>('tenantDatabase.port'),
    user: configService.get<string>('tenantDatabase.user'),
    password: configService.get<string>('tenantDatabase.password'),
    database: databaseName,
    charset: 'utf8',
    pool: extras.pool,
  });

  return {
    ...base,
    ...(extras.migrations ? { migrations: extras.migrations } : {}),
    ...(extras.seeds ? { seeds: extras.seeds } : {}),
  };
}
