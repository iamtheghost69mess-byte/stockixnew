import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
export type ProvisionTracer = {
    event: (phase: string, message: string, opts?: {
        level?: "info" | "warn" | "error";
        meta?: Record<string, unknown>;
    }) => Promise<void>;
};
type TraceContext = () => {
    slug: string;
    tenantId?: string;
    deploymentId?: string;
};
export declare function createProvisionTracer(db: PostgresJsDatabase<typeof dbSchema>, correlationId: string, getContext: TraceContext, log: (m: string) => void): ProvisionTracer;
export {};
//# sourceMappingURL=provision-trace.d.ts.map