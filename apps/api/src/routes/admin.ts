import { randomUUID } from "node:crypto";
import { apiConfig } from "@repo/config";
import type { createDb } from "@repo/db";
import {
  adminAuditLog,
  apiKeys,
  deadLetterJobs,
  organizations,
  owners,
  platformRoles,
  tenantDeployments,
  tenants,
} from "@repo/db/schema";
import { insertTenantJob } from "../services/tenant-jobs.js";
import { ROLES } from "@repo/shared/roles";
import { and, desc, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../audit.js";
import { handleAuditLogList } from "./audit-log.js";
import { handleEmailLogsList } from "./email-logs.js";
import {
  handlePlatformRoleCreate,
  handlePlatformRoleDelete,
  handlePlatformRolePatch,
  handlePlatformRolesList,
} from "./platform-roles.js";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { getControlPlaneRedisClient } from "../lib/redis.js";
import { deliverOwnerInviteEmail } from "../services/invites/owner-invite-delivery.js";
import { resendOwnerInvite } from "../services/invites/invites.js";
import { isOwnerInviteMailQueueEnabled } from "../jobs/owner-invite-mail-queue.js";
import { generateApiKeyMaterial } from "../services/api-keys.js";

type Db = ReturnType<typeof createDb>;

/**
 * Idempotency: POST/PATCH/DELETE require `Idempotency-Key` (middleware/idempotency.ts).
 * GET routes (audit log, email logs, orphan-check) are naturally idempotent.
 */
export function registerAdminRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
app.get("/admin/orphan-check", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  const orphans = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(
      and(
        notExists(
          db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.slug, tenants.slug)),
        ),
        notExists(
          db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.tenantId, tenants.id)),
        ),
        notExists(
          db
            .select({ id: tenantDeployments.id })
            .from(tenantDeployments)
            .where(eq(tenantDeployments.tenantId, tenants.id)),
        ),
      ),
    );

  const count = orphans.length;
  return c.json({
    orphans: orphans.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    count,
    message:
      count === 0
        ? "No orphaned child tenant rows detected."
        : `${count} potential orphan(s) found. Review before cleanup.`,
  });
});

app.get("/audit-log", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  return handleAuditLogList(c, db);
});

app.get("/admin/email-logs", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  return handleEmailLogsList(c, db);
});

app.get("/admin/roles", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  return handlePlatformRolesList(c, db);
});

app.post("/admin/roles", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  return handlePlatformRoleCreate(c, db);
});

app.patch("/admin/roles/:roleId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("roleId"));
  if (!parsed.success) return c.json({ error: "roleId must be a UUID" }, 400);
  return handlePlatformRolePatch(c, db, parsed.data);
});

app.delete("/admin/roles/:roleId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("roleId"));
  if (!parsed.success) return c.json({ error: "roleId must be a UUID" }, 400);
  return handlePlatformRoleDelete(c, db, parsed.data);
});

const apiKeyCreateBody = z.object({
  name: z.string().min(1).max(255),
});

// ── Dead-Letter Job Management ───────────────────────────────────────────────
app.get("/admin/dead-letter-jobs", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const rows = await db
    .select()
    .from(deadLetterJobs)
    .orderBy(desc(deadLetterJobs.failedAt))
    .limit(limit);
  return c.json({ jobs: rows });
});

app.post("/admin/dead-letter-jobs/:id/retry", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "id must be a UUID" }, 400);
  }
  const [dlJob] = await db
    .select()
    .from(deadLetterJobs)
    .where(eq(deadLetterJobs.id, id))
    .limit(1);
  if (!dlJob) return c.json({ error: "not_found" }, 404);

  const requeued = await insertTenantJob(db, {
    type: dlJob.type as Parameters<typeof insertTenantJob>[1]["type"],
    tenantId: dlJob.tenantId ?? undefined,
    correlationId: dlJob.correlationId ?? undefined,
    payload: dlJob.payload,
    maxAttempts: dlJob.maxAttempts,
  });
  return c.json({ ok: true, jobId: requeued?.id });
});

// ─── Feature flags management (super_admin only) ──────────────────────────────

const featureFlagKey = (tenantId: string) => `feature_flags:${tenantId}`;

app.get("/admin/tenants/:tenantId/feature-flags", async (c) => {
  const tenantId = c.req.param("tenantId");
  const parsed = z.string().uuid().safeParse(tenantId);
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const role = c.get("actorRole");
  if (role !== "super_admin") return c.json({ error: "forbidden" }, 403);

  const redis = getControlPlaneRedisClient();
  if (!redis) return c.json({ flags: {} });

  const raw = await redis.hgetall(featureFlagKey(parsed.data));
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    flags[k] = v === "true";
  }
  return c.json({ flags });
});

const featureFlagBody = z.object({
  key: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.-]+$/),
  value: z.boolean(),
});

app.post("/admin/tenants/:tenantId/feature-flags", async (c) => {
  const tenantId = c.req.param("tenantId");
  const parsed = z.string().uuid().safeParse(tenantId);
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const role = c.get("actorRole");
  if (role !== "super_admin") return c.json({ error: "forbidden" }, 403);

  let body: z.infer<typeof featureFlagBody>;
  try {
    body = featureFlagBody.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
  }

  const redis = getControlPlaneRedisClient();
  if (!redis) return c.json({ error: "redis_unavailable", message: "CONTROL_PLANE_REDIS_URL is not configured" }, 503);

  await redis.hset(featureFlagKey(parsed.data), body.key, String(body.value));
  return c.json({ ok: true, key: body.key, value: body.value });
});

app.delete("/admin/tenants/:tenantId/feature-flags/:key", async (c) => {
  const tenantId = c.req.param("tenantId");
  const key = c.req.param("key");
  const parsedId = z.string().uuid().safeParse(tenantId);
  if (!parsedId.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  if (!key || key.length < 1) return c.json({ error: "key is required" }, 400);

  const role = c.get("actorRole");
  if (role !== "super_admin") return c.json({ error: "forbidden" }, 403);

  const redis = getControlPlaneRedisClient();
  if (!redis) return c.json({ error: "redis_unavailable", message: "CONTROL_PLANE_REDIS_URL is not configured" }, 503);

  const deleted = await redis.hdel(featureFlagKey(parsedId.data), key);
  return c.json({ ok: true, deleted });
});

}
