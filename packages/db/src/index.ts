import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export { allocateTenantPort, TenantPortExhaustedError } from "./allocate-tenant-port.js";
export {
  getTenantJobById,
  insertTenantJob,
  listTenantJobs,
  updateTenantJob,
} from "./tenant-jobs.js";
export { schema };
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** Create a Drizzle client using the `postgres` (postgres.js) driver. */
export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
