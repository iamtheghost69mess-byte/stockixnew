import postgres from "postgres";
import * as schema from "./schema.js";
export { allocateTenantPort, TenantPortExhaustedError } from "./allocate-tenant-port.js";
export { schema };
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
/** Create a Drizzle client using the `postgres` (postgres.js) driver. */
export declare function createDb(connectionString: string): import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{}>;
};
//# sourceMappingURL=index.d.ts.map