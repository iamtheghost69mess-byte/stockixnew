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
  /** Parent Stockix tenant when provisioning a child org stack (events visible on parent). */
  parentTenantId?: string | null;
};

const PROVISION_META_SCRUB_KEYS = new Set([
  "oneTimeAdminPassword",
  "posDefaultCredentials",
  "pin",
  "fullCredentials",
  "plainPin",
]);

function scrubProvisionMeta(
  meta: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!PROVISION_META_SCRUB_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export function createProvisionTracer(
  db: PostgresJsDatabase<typeof dbSchema>,
  correlationId: string,
  getContext: TraceContext,
  log: (m: string) => void,
): ProvisionTracer {
  return {
    async event(phase, message, opts) {
      const level = opts?.level ?? "info";
      // Scrub oneTimeAdminPassword from meta before persisting to the DB (CRIT-02).
      const rawMeta = opts?.meta ?? null;
      const meta = scrubProvisionMeta(rawMeta);
      const ctx = getContext();
      log(`[${phase}] ${message}`);
      await db.insert(tenantProvisionEvents).values({
        correlationId,
        slug: ctx.slug,
        tenantId: ctx.tenantId ?? null,
        parentTenantId: ctx.parentTenantId ?? null,
        deploymentId: ctx.deploymentId ?? null,
        phase,
        level,
        message,
        meta,
      });
    },
  };
}
