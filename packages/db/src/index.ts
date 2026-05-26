import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export { allocateTenantPort, TenantPortExhaustedError } from "./allocate-tenant-port.js";
export { allocateOrganizationNumber } from "./organization-number.js";
export { schema };
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

function readPoolInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Create a Drizzle client using the `postgres` (postgres.js) driver. */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: readPoolInt("DB_POOL_MAX", 10),
    idle_timeout: readPoolInt("DB_IDLE_TIMEOUT_SECONDS", 20),
    connect_timeout: readPoolInt("DB_CONNECT_TIMEOUT_SECONDS", 10),
    max_lifetime: readPoolInt("DB_MAX_LIFETIME_SECONDS", 1800),
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}
