import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import type { IDockerComposeRunner, IStockixFinanceBootstrap, ITenantEdgePublisher, ITenantSecretGenerator } from "./contracts.js";
import type { ProvisionInput, ProvisionResult } from "./types.js";
export type TenantProvisionServiceDeps = {
    docker: IDockerComposeRunner;
    secrets: ITenantSecretGenerator;
    finance: IStockixFinanceBootstrap;
    edge: ITenantEdgePublisher;
};
export declare class TenantProvisionService {
    private readonly deps;
    constructor(deps: TenantProvisionServiceDeps);
    provision(db: PostgresJsDatabase<typeof dbSchema>, input: ProvisionInput, log: (m: string) => void, correlationId: string, assertNotCancelled?: () => Promise<void>): Promise<ProvisionResult>;
}
//# sourceMappingURL=tenant-provision-service.d.ts.map