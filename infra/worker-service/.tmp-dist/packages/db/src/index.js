import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
export { allocateTenantPort, TenantPortExhaustedError } from "./allocate-tenant-port.js";
export { schema };
/** Create a Drizzle client using the `postgres` (postgres.js) driver. */
export function createDb(connectionString) {
    const client = postgres(connectionString);
    return drizzle(client, { schema });
}
