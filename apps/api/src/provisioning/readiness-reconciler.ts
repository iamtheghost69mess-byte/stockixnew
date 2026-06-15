import type { createDb } from "@repo/db";
import { tenantLifecycleJobs } from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";

import { appendProvisionEventSafe } from "../lib/provision-events.js";
import {
  PROVISION_STUCK_AFTER_MS,
  RECONCILE_INTERVAL_MS,
} from "../lib/provision-timing.js";
import { logger } from "../lib/logger.js";
import {
  getTenantReadiness,
  invalidateTenantReadinessCache,
} from "./readiness-engine.js";

type Db = NonNullable<ReturnType<typeof createDb>>;

const READINESS_OBSERVE_COOLDOWN_MS = 45_000;

let readinessReconcilerInterval: ReturnType<typeof setInterval> | null = null;

export function stopReadinessReconciler(): void {
  if (readinessReconcilerInterval) {
    clearInterval(readinessReconcilerInterval);
    readinessReconcilerInterval = null;
    logger.info("Readiness reconciler stopped");
  }
}

export function startReadinessReconciler(db: Db | null): void {
  if (!db) return;
  if (readinessReconcilerInterval) return;
  let running = false;
  const lastObservedAt = new Map<string, number>();
  const lastSignature = new Map<string, string>();
  const tick = async () => {
    if (!db || running) return;
    running = true;
    try {
      const rows = await db
        .select({
          id: tenantLifecycleJobs.id,
          correlationId: tenantLifecycleJobs.correlationId,
          completedAt: tenantLifecycleJobs.completedAt,
          payload: tenantLifecycleJobs.payload,
        })
        .from(tenantLifecycleJobs)
        .where(
          and(
            eq(tenantLifecycleJobs.type, "tenant.provision"),
            eq(tenantLifecycleJobs.status, "completed"),
          ),
        )
        .orderBy(desc(tenantLifecycleJobs.completedAt))
        .limit(100);

      for (const row of rows) {
        const correlationId = row.correlationId;
        if (!correlationId) continue;
        const now = Date.now();
        const previous = lastObservedAt.get(correlationId) ?? 0;
        if (now - previous < READINESS_OBSERVE_COOLDOWN_MS) continue;
        lastObservedAt.set(correlationId, now);
        invalidateTenantReadinessCache(correlationId);
        const readiness = await getTenantReadiness(db, correlationId);
        const slug =
          row.payload && typeof row.payload.slug === "string" ? String(row.payload.slug) : null;
        const signature = `${readiness.status}:${readiness.reasons.join("|")}`;
        if (lastSignature.get(correlationId) === signature) {
          continue;
        }
        lastSignature.set(correlationId, signature);
        if (readiness.status === "READY") {
          await appendProvisionEventSafe(db, {
            correlationId,
            slug,
            phase: "readiness.observed",
            level: "info",
            message: "Readiness observed as READY",
            meta: { checks: readiness.checks, status: readiness.status },
          });
        } else {
          await appendProvisionEventSafe(db, {
            correlationId,
            slug,
            phase: "readiness.observed",
            level: readiness.status === "DEGRADED" ? "warn" : "error",
            message: "Readiness observed as non-ready",
            meta: { checks: readiness.checks, status: readiness.status, reasons: readiness.reasons },
          });
          const completedAtMs = row.completedAt ? row.completedAt.getTime() : null;
          if (completedAtMs && Date.now() - completedAtMs >= PROVISION_STUCK_AFTER_MS) {
            await appendProvisionEventSafe(db, {
              correlationId,
              slug,
              phase:
                readiness.status === "DEGRADED"
                  ? "readiness.degraded_detected"
                  : "readiness.inconsistent",
              level: "error",
              message: "Completed provisioning is still not converged to ready",
              meta: { ageMs: Date.now() - completedAtMs, readiness },
            });
          }
        }
      }
    } catch (error) {
      logger.error("reconciler readiness tick failed", error);
    } finally {
      running = false;
    }
  };
  readinessReconcilerInterval = setInterval(() => {
    void tick();
  }, RECONCILE_INTERVAL_MS);
  void tick();
}
