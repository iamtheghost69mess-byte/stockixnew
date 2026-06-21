import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export { allocateTenantPort, TenantPortExhaustedError } from "./allocate-tenant-port.js";
export { assertTenantPortAvailable } from "./assert-tenant-port-available.js";
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
  // Pool tuning: set DB_POOL_MAX to (postgres max_connections - reserved) / number_of_api_replicas
  // Default 20 is safe for single-replica on shared EC2 with Postgres default max_connections=100
  const client = postgres(connectionString, {
    max: readPoolInt("DB_POOL_MAX", 20),
    idle_timeout: readPoolInt("DB_IDLE_TIMEOUT_SECONDS", 20),
    connect_timeout: readPoolInt("DB_CONNECT_TIMEOUT_SECONDS", 10),
    max_lifetime: readPoolInt("DB_MAX_LIFETIME_SECONDS", 1800),
    prepare: false,
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}
