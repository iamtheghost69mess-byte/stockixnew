import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema.js";
export declare class TenantPortExhaustedError extends Error {
    constructor(maxPort: number);
}
/**
 * Atomically allocates the next host-published HTTP port for a tenant nginx gateway.
 * Backed by Postgres sequence `tenant_port_seq` (see migrations); no host port scanning.
 */
export declare function allocateTenantPort(db: PostgresJsDatabase<typeof schema>, maxPort: number): Promise<number>;
//# sourceMappingURL=allocate-tenant-port.d.ts.map