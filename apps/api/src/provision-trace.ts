import { tenantProvisionEvents } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";

import { emitProvisionEvent } from "./provision-bus.js";

export type ProvisionEventPayload = {
  id: string;
  correlationId: string;
  slug: string | null;
  tenantId: string | null;
  deploymentId: string | null;
  phase: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type ProvisionTracer = {
  event: (
    phase: string,
    message: string,
    opts?: {
      level?: "info" | "warn" | "error";
      meta?: Record<string, unknown>;
    },
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
      const [row] = await db
        .insert(tenantProvisionEvents)
        .values({
          correlationId,
          slug: ctx.slug,
          tenantId: ctx.tenantId ?? null,
          deploymentId: ctx.deploymentId ?? null,
          phase,
          level,
          message,
          meta,
        })
        .returning({
          id: tenantProvisionEvents.id,
          createdAt: tenantProvisionEvents.createdAt,
        });

      if (!row) return;

      const payload: ProvisionEventPayload = {
        id: row.id,
        correlationId,
        slug: ctx.slug,
        tenantId: ctx.tenantId ?? null,
        deploymentId: ctx.deploymentId ?? null,
        phase,
        level,
        message,
        meta,
        createdAt: row.createdAt.toISOString(),
      };
      emitProvisionEvent(payload);
    },
  };
}
