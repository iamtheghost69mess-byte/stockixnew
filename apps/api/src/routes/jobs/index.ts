import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { tenantDeployments, tenantLifecycleJobs, tenants } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

// In-memory store for one-time admin passwords produced during tenant provisioning.
// Passwords are intentionally never written to the database (CRIT-02).
// They are held here for at most 15 minutes after job completion and served once
// via GET /tenants/provision-status/:correlationId.
export const PROVISION_PASSWORD_TTL_MS = 15 * 60 * 1000;
export const provisionPasswordCache = new Map<string, { password: string; expiresAt: number }>();

export function buildJobsRouter(db: Db) {
  const router = new Hono<ApiEnv>();

  router.post("/claim", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
    if (!workerId) {
      return c.json({ error: "worker_id_required" }, 400);
    }
    const staleLeaseMs = 5 * 60 * 1000;
    const staleBefore = new Date(Date.now() - staleLeaseMs);
    const claimed = await db.transaction(async (tx) => {
      await tx
        .update(tenantLifecycleJobs)
        .set({
          status: "pending",
          claimedAt: null,
          claimedBy: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantLifecycleJobs.status, "running"),
            sql`${tenantLifecycleJobs.attempts} < ${tenantLifecycleJobs.maxAttempts}`,
            sql`${tenantLifecycleJobs.claimedAt} IS NOT NULL`,
            sql`${tenantLifecycleJobs.claimedAt} < ${staleBefore}`,
          ),
        );

      const [pending] = await tx
        .select({ id: tenantLifecycleJobs.id })
        .from(tenantLifecycleJobs)
        .where(
          and(
            eq(tenantLifecycleJobs.status, "pending"),
            sql`${tenantLifecycleJobs.attempts} < ${tenantLifecycleJobs.maxAttempts}`,
            sql`${tenantLifecycleJobs.runAt} <= now()`,
          ),
        )
        .orderBy(sql`${tenantLifecycleJobs.priority} DESC`, asc(tenantLifecycleJobs.createdAt))
        .limit(1);
      if (!pending?.id) return null;

      const [updated] = await tx
        .update(tenantLifecycleJobs)
        .set({
          status: "running",
          claimedAt: new Date(),
          claimedBy: workerId,
          updatedAt: new Date(),
        })
        .where(and(eq(tenantLifecycleJobs.id, pending.id), eq(tenantLifecycleJobs.status, "pending")))
        .returning();
      return updated ?? null;
    });
    return c.json({ job: claimed });
  });

  router.post("/:jobId/complete", async (c) => {
    const jobId = c.req.param("jobId");
    const body = await c.req.json().catch(() => ({}));
    const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
    // oneTimeAdminPassword is passed by the worker for tenant.provision jobs.
    // It is stored only in memory (never in the DB) — CRIT-02.
    const oneTimeAdminPassword =
      typeof (body as { oneTimeAdminPassword?: unknown }).oneTimeAdminPassword === "string"
        ? (body as { oneTimeAdminPassword: string }).oneTimeAdminPassword
        : undefined;
    const [currentJob] = await db
      .select({
        id: tenantLifecycleJobs.id,
        type: tenantLifecycleJobs.type,
        tenantId: tenantLifecycleJobs.tenantId,
        correlationId: tenantLifecycleJobs.correlationId,
        payload: tenantLifecycleJobs.payload,
        claimedBy: tenantLifecycleJobs.claimedBy,
      })
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.id, jobId))
      .limit(1);
    if (!currentJob) return c.json({ error: "job_not_found" }, 404);
    if (workerId && currentJob.claimedBy && currentJob.claimedBy !== workerId) {
      return c.json({ error: "job_claim_mismatch" }, 409);
    }
    const [updated] = await db
      .update(tenantLifecycleJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        lastError: null,
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, jobId), eq(tenantLifecycleJobs.status, "running")))
      .returning();
    if (!updated) return c.json({ error: "job_not_running" }, 409);
    // Store the one-time admin password in memory for 15 minutes (CRIT-02).
    // It is keyed by correlationId so the provision-status endpoint can retrieve it.
    if (currentJob?.type === "tenant.provision" && currentJob.correlationId && oneTimeAdminPassword) {
      provisionPasswordCache.set(currentJob.correlationId, {
        password: oneTimeAdminPassword,
        expiresAt: Date.now() + PROVISION_PASSWORD_TTL_MS,
      });
    }
    if (
      currentJob?.type === "tenant.lifecycle"
      && currentJob.tenantId
      && typeof (currentJob.payload as { status?: unknown }).status === "string"
    ) {
      const nextStatus = (currentJob.payload as { status: string }).status;
      await db.update(tenants).set({ status: nextStatus }).where(eq(tenants.id, currentJob.tenantId));
      await db
        .update(tenantDeployments)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(tenantDeployments.tenantId, currentJob.tenantId));
    }
    return c.json({ ok: true, job: updated ?? null });
  });

  router.post("/:jobId/fail", async (c) => {
    const jobId = c.req.param("jobId");
    const body = await c.req.json().catch(() => ({}));
    const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
    const errorMessage = String((body as { error?: unknown }).error ?? "job_failed").slice(0, 4000);
    const [updated] = await db.transaction(async (tx) => {
      const [job] = await tx
        .select({
          id: tenantLifecycleJobs.id,
          status: tenantLifecycleJobs.status,
          attempts: tenantLifecycleJobs.attempts,
          maxAttempts: tenantLifecycleJobs.maxAttempts,
          claimedBy: tenantLifecycleJobs.claimedBy,
        })
        .from(tenantLifecycleJobs)
        .where(eq(tenantLifecycleJobs.id, jobId))
        .limit(1);
      if (!job) return [];
      if (workerId && job.claimedBy && job.claimedBy !== workerId) {
        return [];
      }
      const nextAttempts = (job.attempts ?? 0) + 1;
      const maxAttempts = job.maxAttempts ?? 5;
      const exhausted = nextAttempts >= maxAttempts;
      const retryDelayMs = Math.min(60_000, 2 ** Math.max(0, nextAttempts - 1) * 1000);
      const [next] = await tx
        .update(tenantLifecycleJobs)
        .set({
          status: exhausted ? "dead" : "pending",
          attempts: nextAttempts,
          lastError: errorMessage,
          runAt: exhausted ? new Date() : new Date(Date.now() + retryDelayMs),
          claimedAt: null,
          claimedBy: null,
          updatedAt: new Date(),
        })
        .where(and(eq(tenantLifecycleJobs.id, jobId), eq(tenantLifecycleJobs.status, "running")))
        .returning();
      return next ? [next] : [];
    });
    return c.json({ ok: true, job: updated ?? null });
  });

  router.get("/dead", async (c) => {
    const rows = await db
      .select()
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.status, "dead"))
      .orderBy(asc(tenantLifecycleJobs.updatedAt))
      .limit(100);
    return c.json({ jobs: rows });
  });

  router.post("/:jobId/requeue", async (c) => {
    const jobId = c.req.param("jobId");
    const [updated] = await db
      .update(tenantLifecycleJobs)
      .set({
        status: "pending",
        lastError: null,
        runAt: new Date(),
        claimedAt: null,
        claimedBy: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantLifecycleJobs.id, jobId), eq(tenantLifecycleJobs.status, "dead")))
      .returning();
    if (!updated) return c.json({ error: "dead_job_not_found" }, 404);
    return c.json({ ok: true, job: updated });
  });

  return router;
}
