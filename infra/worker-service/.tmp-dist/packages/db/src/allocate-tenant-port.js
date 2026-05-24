import { sql } from "drizzle-orm";
export class TenantPortExhaustedError extends Error {
    constructor(maxPort) {
        super(`No tenant ports left (sequence exceeded MAX_TENANT_PORT=${maxPort}). Raise the sequence MAXVALUE or MAX_TENANT_PORT.`);
        this.name = "TenantPortExhaustedError";
    }
}
/**
 * Atomically allocates the next host-published HTTP port for a tenant nginx gateway.
 * Backed by Postgres sequence `tenant_port_seq` (see migrations); no host port scanning.
 */
export async function allocateTenantPort(db, maxPort) {
    const rows = await db.execute(sql `SELECT nextval('tenant_port_seq')::int AS "port"`);
    const row = rows[0];
    const port = row?.port;
    if (typeof port !== "number" || !Number.isFinite(port) || port > maxPort) {
        throw new TenantPortExhaustedError(maxPort);
    }
    return port;
}
