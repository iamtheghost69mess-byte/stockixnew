import { tenantProvisionEvents } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

export type ProvisionTracer = {
  event: (
    phase: string,
    message: string,
    opts?: { level?: "info" | "warn" | "error"; meta?: Record<string, unknown> },
  ) => Promise<void>;
};

type TraceContext = () => {
  slug: string;
  tenantId?: string;
  deploymentId?: string;
};

export function createProvisionTracer(
  db: PostgresJsDatabase<typeof dbSchema>,
  correlationId: string,
  getContext: TraceContext,
  log: (m: string) => void,
): ProvisionTracer {
  return {
    async event(phase, message, opts) {
      const level = opts?.level ?? "info";
      const meta = opts?.meta ?? null;
      const ctx = getContext();
      log(`[${phase}] ${message}`);
      await db.insert(tenantProvisionEvents).values({
        correlationId,
        slug: ctx.slug,
        tenantId: ctx.tenantId ?? null,
        deploymentId: ctx.deploymentId ?? null,
        phase,
        level,
        message,
        meta,
      });
    },
  };
}
