import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import type { DeprovisionOptions, DeprovisionResult, ProvisionInput, ProvisionResult } from "./provisioning/types.js";
export declare function provisionTenant(db: PostgresJsDatabase<typeof dbSchema>, input: ProvisionInput, log: (m: string) => void, correlationId: string, assertNotCancelled?: () => Promise<void>): Promise<ProvisionResult>;
export declare function deprovisionTenant(db: PostgresJsDatabase<typeof dbSchema>, tenantId: string, options?: DeprovisionOptions): Promise<DeprovisionResult>;
//# sourceMappingURL=provisioner.d.ts.map