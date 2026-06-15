import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import type { TenantProvisionServiceDeps } from "../domain/provisioning/tenant-provision-service.js";
import type { ProvisionInput, ProvisionResult } from "../domain/provisioning/types.js";
export declare function executeProvisionRuntime(deps: TenantProvisionServiceDeps, db: PostgresJsDatabase<typeof dbSchema>, input: ProvisionInput, log: (m: string) => void, correlationId: string, assertNotCancelled?: () => Promise<void>): Promise<ProvisionResult>;
//# sourceMappingURL=provision-runtime.d.ts.map