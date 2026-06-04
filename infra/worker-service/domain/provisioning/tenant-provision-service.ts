import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { executeProvisionRuntime } from "../../src/provision-runtime.js";
import type {
  IDockerComposeRunner,
  IStockixFinanceBootstrap,
  ITenantEdgePublisher,
  ITenantSecretGenerator,
} from "./contracts.js";
import type { ProvisionInput, ProvisionResult } from "./types.js";

export type TenantProvisionServiceDeps = {
  docker: IDockerComposeRunner;
  secrets: ITenantSecretGenerator;
  finance: IStockixFinanceBootstrap;
  edge: ITenantEdgePublisher;
};

export class TenantProvisionService {
  constructor(private readonly deps: TenantProvisionServiceDeps) {}

  async provision(
    db: PostgresJsDatabase<typeof dbSchema>,
    input: ProvisionInput,
    log: (m: string) => void,
    correlationId: string,
    assertNotCancelled?: () => Promise<void>,
    lifecycleJobId?: string,
  ): Promise<ProvisionResult> {
    return executeProvisionRuntime(
      this.deps,
      db,
      input,
      log,
      correlationId,
      assertNotCancelled,
      lifecycleJobId,
    );
  }
}
