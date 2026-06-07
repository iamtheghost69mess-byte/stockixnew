/**
 * Keep in sync with ../src/database/finance-knex-options.ts
 * Used by run-system-migrate.mjs (migration Docker image — no webpack bundle).
 */
import { knexSnakeCaseMappers } from "objection";

export const FINANCE_MYSQL_DEFAULT_PORT = 6033;
export const FINANCE_MYSQL_CLIENT = "mysql2";

/** @param {string | number | undefined | null} value @param {number} [fallback] */
export function parseMysqlPort(value, fallback = FINANCE_MYSQL_DEFAULT_PORT) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const port = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

/**
 * @param {{
 *   host?: string | null;
 *   port?: string | number | null;
 *   user?: string | null;
 *   password?: string | null;
 *   database: string;
 *   charset?: string | null;
 *   pool?: import('knex').Knex.PoolConfig;
 * }} input
 */
export function buildFinanceMysqlKnexOptions(input) {
  return {
    client: FINANCE_MYSQL_CLIENT,
    connection: {
      host: input.host ?? undefined,
      port: parseMysqlPort(input.port),
      user: input.user ?? undefined,
      password: input.password ?? undefined,
      database: input.database,
      charset: input.charset?.trim() || "utf8",
    },
    ...(input.pool ? { pool: input.pool } : {}),
    ...knexSnakeCaseMappers({ upperCase: true }),
  };
}
