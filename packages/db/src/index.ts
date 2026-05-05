import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export { allocateTenantPort, TenantPortExhaustedError } from "./allocate-tenant-port";
export { schema };
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** Create a Drizzle client using the `postgres` (postgres.js) driver. */
export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
