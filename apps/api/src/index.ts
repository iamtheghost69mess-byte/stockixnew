import { createHash, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { apiConfig } from "@repo/config";
import {
  createDb,
} from "@repo/db";
import { ROLES } from "@repo/shared/roles";
import { ROLE_RANK, type Role } from "@repo/shared/roles";

import {
  adminAuditLog,
  apiIdempotencyKeys,
  owners,
  tenantConfig,
  tenantDeployments,
  tenantLifecycleJobs,
  tenants,
  tenantProvisionEvents,
} from "@repo/db/schema";
import { asc, eq, and, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { logAudit } from "./audit.js";

import {
  createProvisionTracer,
  type ProvisionEventPayload,
} from "./provision-trace.js";
import { buildAuthRoutes } from "./routes/auth/index.js";
import { insertTenantJob, listTenantJobs } from "./services/tenant-jobs.js";
import { validateOwnerSession } from "./services/auth/session-validation.js";
import { verifySessionToken } from "./services/auth/tokens.js";

const databaseUrl = apiConfig.databaseUrl;
const db = databaseUrl ? createDb(databaseUrl) : null;

function rowToProvisionPayload(
  row: typeof tenantProvisionEvents.$inferSelect,
): ProvisionEventPayload {
  return {
    id: row.id,
    correlationId: row.correlationId,
    slug: row.slug ?? null,
    tenantId: row.tenantId ?? null,
    deploymentId: row.deploymentId ?? null,
    phase: row.phase,
    level: row.level,
    message: row.message,
    meta: row.meta ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadProvisionEventsJson(correlationId: string) {
  if (!db) return [];
  const rows = await db
    .select({
      id: tenantProvisionEvents.id,
      phase: tenantProvisionEvents.phase,
      level: tenantProvisionEvents.level,
      message: tenantProvisionEvents.message,
      meta: tenantProvisionEvents.meta,
      createdAt: tenantProvisionEvents.createdAt,
    })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(
      asc(tenantProvisionEvents.createdAt),
      asc(tenantProvisionEvents.id),
    )
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    level: r.level,
    message: r.message,
    meta: r.meta ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

const app = new Hono<ApiEnv>();
const platformApiSecret = apiConfig.platformApiSecret;
apiConfig.validateRequiredEnv();

async function emitMetric(name: string, value: number, tags: Record<string, string | number>) {
  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiConfig.metricsAuthToken ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` } : {}),
    },
    body: JSON.stringify({
      source: "api",
      name,
      value,
      tags,
      ts: new Date().toISOString(),
    }),
  }).catch(() => undefined);
}

function readCookie(req: Request, name: string): string {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  const pair = segments.find((segment) => segment.startsWith(`${name}=`));
  if (!pair) return "";
  return decodeURIComponent(pair.slice(name.length + 1));
}

if (db) {
  app.route("/auth", buildAuthRoutes(db));
}

function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lowered = message.toLowerCase();
  return (
    lowered.includes("too many clients") ||
    lowered.includes("connection terminated") ||
    lowered.includes("timeout") ||
    lowered.includes("econnreset") ||
    lowered.includes("remaining connection slots are reserved")
  );
}

app.onError((err, c) => {
  console.error("[api]", err);
  if (isTransientDbError(err)) {
    return c.json(
      { error: "service_unavailable", message: "Database temporarily unavailable. Retry shortly." },
      503,
    );
  }
  return c.json({ error: "internal_error", message: "An unexpected error occurred." }, 500);
});

const rootDomain = apiConfig.rootDomain;
const corsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(rootDomain
    ? [`https://${rootDomain}`, `http://${rootDomain}`, `https://www.${rootDomain}`]
    : []),
  ...apiConfig.corsOrigins,
];

app.use(
  "/*",
  cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
);

app.use("/*", async (c, next) => {
  const requestId = c.req.header("x-request-id")
    ?? c.req.header("x-correlation-id")
    ?? randomUUID();
  c.set("requestId", requestId);
  c.set("requestStartMs", Date.now());
  c.header("x-request-id", requestId);
  const startedAt = Date.now();
  await next();
  const latencyMs = Date.now() - startedAt;
  console.log(
    JSON.stringify({
      level: "info",
      type: "http_request",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latencyMs,
    }),
  );
  await emitMetric("api.request.latency_ms", latencyMs, {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
  });
});

app.use("/*", async (c, next) => {
  if (c.req.path === "/health") {
    await next();
    return;
  }
  if (!platformApiSecret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const auth = c.req.header("Authorization") ?? "";
  if (auth !== `Bearer ${platformApiSecret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  if (path === "/health" || path.startsWith("/auth")) {
    await next();
    return;
  }
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const headerToken = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const cookieToken = readCookie(c.req.raw, "stockix-session");
  const token = headerToken || cookieToken;
  if (!token) return c.json({ error: "unauthorized_actor" }, 401);

  const session = await verifySessionToken(token);
  if (!session) return c.json({ error: "unauthorized_actor" }, 401);
  const sessionCheck = await validateOwnerSession(db, {
    ownerId: session.sub,
    role: session.role,
    sessionVersion: session.sessionVersion,
  });
  if (!sessionCheck.success) {
    return c.json({ error: "forbidden_actor" }, 403);
  }
  c.set("actorId", session.sub);
  c.set("actorRole", session.role);
  await next();
});

const IDEMPOTENCY_TTL_HOURS = 24;
app.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  const isPrivilegedWrite =
    ["POST", "PATCH", "DELETE"].includes(method) &&
    (path.startsWith("/owners") || path.startsWith("/tenants"));
  if (!isPrivilegedWrite) return next();
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const actorId = c.get("actorId") as string | undefined;
  if (!actorId) {
    return c.json({ error: "unauthorized_actor" }, 401);
  }
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey) {
    return c.json(
      { error: "idempotency_key_required", message: "Missing Idempotency-Key header" },
      400,
    );
  }

  const requestBody = await c.req.raw.clone().text();
  const requestHash = createHash("sha256")
    .update(`${method}:${path}:${requestBody}`)
    .digest("hex");

  await db
    .delete(apiIdempotencyKeys)
    .where(sql`${apiIdempotencyKeys.expiresAt} < now()`)
    .catch(() => undefined);

  const existingRows = await db
    .select({
      id: apiIdempotencyKeys.id,
      requestHash: apiIdempotencyKeys.requestHash,
      statusCode: apiIdempotencyKeys.statusCode,
      responseBody: apiIdempotencyKeys.responseBody,
    })
    .from(apiIdempotencyKeys)
    .where(and(eq(apiIdempotencyKeys.actorId, actorId), eq(apiIdempotencyKeys.key, idempotencyKey)))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return c.json(
        {
          error: "idempotency_key_conflict",
          message: "Idempotency-Key was already used with a different request payload",
        },
        409,
      );
    }
    const body =
      existing.responseBody && typeof existing.responseBody === "object"
        ? existing.responseBody
        : { ok: true };
    return c.body(JSON.stringify(body), existing.statusCode as never, {
      "content-type": "application/json",
    });
  }

  await next();

  let responseText = "";
  try {
    responseText = await c.res.clone().text();
  } catch {
    responseText = "";
  }
  let parsedResponse: Record<string, unknown> = {};
  try {
    parsedResponse = responseText
      ? (JSON.parse(responseText) as Record<string, unknown>)
      : {};
  } catch {
    parsedResponse = { raw: responseText };
  }

  await db
    .insert(apiIdempotencyKeys)
    .values({
      key: idempotencyKey,
      actorId,
      method,
      path,
      requestHash,
      statusCode: c.res.status,
      responseBody: parsedResponse,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
    })
    .catch(() => undefined);
});

function requiredApiRole(pathname: string, method: string): Role | null {
  if (pathname === "/health") return null;
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/owners")) {
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  if (pathname.startsWith("/tenants")) {
    if (pathname.includes("/provision")) return "support_agent";
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  return "read_only";
}

app.use("/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  const minRole = requiredApiRole(path, method);
  if (!minRole) return next();
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

  const actorId = c.get("actorId") as string | undefined;
  if (!actorId) return c.json({ error: "unauthorized_actor" }, 401);

  const rows = await db
    .select({
      id: owners.id,
      role: owners.role,
      status: owners.status,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.id, actorId))
    .limit(1);
  const actor = rows[0];
  if (!actor || actor.status !== "active") {
    return c.json({ error: "forbidden_actor" }, 403);
  }
  if (!(actor.role in ROLE_RANK)) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  const actorRank = ROLE_RANK[actor.role as Role];
  if (actorRank < ROLE_RANK[minRole]) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  await next();
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/internal/jobs/claim", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
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

app.post("/internal/jobs/:jobId/complete", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const jobId = c.req.param("jobId");
  const body = await c.req.json().catch(() => ({}));
  const workerId = String((body as { workerId?: unknown }).workerId ?? "").trim();
  const [currentJob] = await db
    .select({
      id: tenantLifecycleJobs.id,
      type: tenantLifecycleJobs.type,
      tenantId: tenantLifecycleJobs.tenantId,
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

app.post("/internal/jobs/:jobId/fail", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
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

app.get("/internal/jobs/dead", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const rows = await db
    .select()
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.status, "dead"))
    .orderBy(asc(tenantLifecycleJobs.updatedAt))
    .limit(100);
  return c.json({ jobs: rows });
});

app.post("/internal/jobs/:jobId/requeue", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
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

app.get("/owners", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const rows = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      createdAt: owners.createdAt,
    })
    .from(owners);
  return c.json({ owners: rows });
});

const ownerBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
});
const ownerRoleSchema = z.enum(ROLES);

async function countSuperAdmins() {
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(owners)
    .where(
      and(
        eq(owners.role, "super_admin"),
        eq(owners.status, "active"),
        isNotNull(owners.passwordHash),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

function isActivatedSuperAdmin(owner: {
  role: string;
  status?: string | null;
  hasPassword?: boolean;
}): boolean {
  return (
    owner.role === "super_admin" &&
    owner.status === "active" &&
    Boolean(owner.hasPassword)
  );
}

app.post("/owners", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  let body: z.infer<typeof ownerBody>;
  try {
    body = ownerBody.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
  }
  const [row] = await db
    .insert(owners)
    .values({ email: body.email, name: body.name })
    .onConflictDoNothing()
    .returning({ id: owners.id, email: owners.email, name: owners.name, createdAt: owners.createdAt });
  if (!row) return c.json({ error: "email_already_exists" }, 409);
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "owner.invite",
    targetOwnerId: row.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json({ owner: row }, 201);
});

const inviteBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: ownerRoleSchema,
});

app.post("/owners/invite", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  let body: z.infer<typeof inviteBody>;
  try {
    body = inviteBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      {
        error: "invalid_body",
        detail: e instanceof z.ZodError ? e.flatten() : String(e),
      },
      400,
    );
  }
  const existing = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.email, body.email))
    .limit(1);
  if (existing.length > 0) return c.json({ error: "email_already_exists" }, 409);

  const inviteToken = randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [owner] = await db
    .insert(owners)
    .values({
      email: body.email,
      name: body.name,
      role: body.role,
      inviteToken,
      inviteTokenExpiresAt,
      invitedById: (c.get("actorId") as string | undefined) ?? null,
    })
    .returning({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
    });
  if (!owner) return c.json({ error: "failed_to_create_invite" }, 500);
  const dashboardUrl = apiConfig.dashboardUrl?.replace(/\/+$/, "");
  const inviteUrl = `${dashboardUrl ?? "http://localhost:3000"}/accept-invite?token=${inviteToken}`;
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "owner.invite",
    targetOwnerId: owner.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { role: owner.role, email: owner.email },
  });
  return c.json({ inviteToken, inviteUrl, owner }, 201);
});

app.delete("/owners/:ownerId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("ownerId"));
  if (!parsed.success) return c.json({ error: "ownerId must be a UUID" }, 400);
  try {
    const target = await db
      .select({
        id: owners.id,
        role: owners.role,
        status: owners.status,
        hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      })
      .from(owners)
      .where(eq(owners.id, parsed.data))
      .limit(1);
    const targetOwner = target[0];
    if (!targetOwner) return c.json({ error: "not_found" }, 404);
    if (isActivatedSuperAdmin(targetOwner)) {
      const superAdminCount = await countSuperAdmins();
      if (superAdminCount <= 1) {
        return c.json(
          {
            error: "last_super_admin",
            message: "Cannot delete the last Super Admin account.",
          },
          409,
        );
      }
    }

    await db
      .delete(adminAuditLog)
      .where(eq(adminAuditLog.targetOwnerId, parsed.data));

    const [deleted] = await db
      .delete(owners)
      .where(eq(owners.id, parsed.data))
      .returning({ id: owners.id, email: owners.email });
    if (!deleted) return c.json({ error: "not_found" }, 404);
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "owner.delete",
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { deletedOwnerId: deleted.id, email: deleted.email },
    });
    return c.json({ deleted: true, id: deleted.id, email: deleted.email });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return c.json({ error: "owner_has_tenants", detail: "Reassign or delete the owner's tenants first." }, 409);
    }
    throw e;
  }
});

const ownerPatchBody = z
  .object({
    role: ownerRoleSchema.optional(),
    name: z.string().min(1).max(120).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .strip();

app.patch("/owners/:ownerId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("ownerId"));
  if (!parsed.success) return c.json({ error: "ownerId must be a UUID" }, 400);

  const existingRows = await db
    .select({
      id: owners.id,
      role: owners.role,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      sessionVersion: owners.sessionVersion,
      name: owners.name,
      email: owners.email,
      createdAt: owners.createdAt,
    })
    .from(owners)
    .where(eq(owners.id, parsed.data))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return c.json({ error: "not_found" }, 404);

  let body: z.infer<typeof ownerPatchBody>;
  try {
    body = ownerPatchBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      {
        error: "invalid_body",
        detail: e instanceof z.ZodError ? e.flatten() : String(e),
      },
      400,
    );
  }

  if (Object.keys(body).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  const actorId = (c.get("actorId") as string | undefined) ?? "";
  if (body.role && actorId === parsed.data) {
    return c.json({ error: "cannot_change_own_role" }, 403);
  }
  if (body.status && body.status !== "active" && actorId === parsed.data) {
    return c.json({ error: "cannot_suspend_self" }, 403);
  }

  if (body.role && existing.role === "super_admin" && body.role !== "super_admin") {
    const existingIsActivatedSuperAdmin = isActivatedSuperAdmin({
      role: existing.role,
      status: existing.status,
      hasPassword: existing.hasPassword,
    });
    if (existingIsActivatedSuperAdmin) {
      const superAdminCount = await countSuperAdmins();
      if (superAdminCount <= 1) {
        return c.json(
          {
            error: "last_super_admin",
            message: "Cannot demote the last Super Admin account.",
          },
          409,
        );
      }
    }
  }

  const updateData: {
    role?: (typeof ROLES)[number];
    name?: string;
    status?: "active" | "suspended";
    sessionVersion?: number;
  } = {};
  if (body.role) updateData.role = body.role;
  if (body.name) updateData.name = body.name;
  if (body.status) updateData.status = body.status;
  if (body.role || body.status) {
    updateData.sessionVersion = (existing.sessionVersion ?? 1) + 1;
  }

  const [updated] = await db
    .update(owners)
    .set(updateData)
    .where(eq(owners.id, parsed.data))
    .returning({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      createdAt: owners.createdAt,
    });

  if (!updated) return c.json({ error: "not_found" }, 404);

  const auditIp = c.req.header("x-forwarded-for") ?? null;
  const auditUa = c.req.header("user-agent") ?? null;
  if (body.role && body.role !== existing.role) {
    await logAudit(db, {
      actorId,
      action: "owner.role_changed",
      targetOwnerId: updated.id,
      ipAddress: auditIp,
      userAgent: auditUa,
      metadata: { from: existing.role, to: body.role },
    });
  }
  if (body.status && body.status !== existing.status) {
    await logAudit(db, {
      actorId,
      action: "owner.status_changed",
      targetOwnerId: updated.id,
      ipAddress: auditIp,
      userAgent: auditUa,
      metadata: { from: existing.status, to: body.status },
    });
  }
  if (body.name && body.name !== existing.name) {
    await logAudit(db, {
      actorId,
      action: "owner.profile_updated",
      targetOwnerId: updated.id,
      ipAddress: auditIp,
      userAgent: auditUa,
      metadata: { field: "name" },
    });
  }

  return c.json({ updated: true, owner: updated });
});

app.get("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const rows = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      adminEmail: tenants.adminEmail,
      deploymentStatus: tenantDeployments.status,
      internalPort: tenantDeployments.internalPort,
      composeProject: tenantDeployments.composeProjectName,
      lastError: tenantDeployments.lastError,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id));

  return c.json({ tenants: rows });
});

app.delete("/tenants/:tenantId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const tenantId = c.req.param("tenantId");
  const parsed = z.string().uuid().safeParse(tenantId);
  if (!parsed.success) {
    return c.json({ error: "tenantId must be a UUID" }, 400);
  }
  const removeVolumes = c.req.query("volumes") === "1" || c.req.query("volumes") === "true";
  const existing = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, parsed.data))
    .limit(1);
  const target = existing[0];
  if (!target) return c.json({ error: "tenant_not_found" }, 404);
  const job = await insertTenantJob(db, {
    type: "tenant.deprovision",
    tenantId: parsed.data,
    payload: { tenantId: parsed.data, removeVolumes },
  });
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.delete",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { deletedTenantId: parsed.data, slug: target.slug, mode: "queued" },
  });
  return c.json({
    accepted: true,
    deleted: true,
    slug: target.slug,
    jobId: job?.id ?? null,
    message: "Tenant deprovision queued for infra worker execution.",
  }, 202);
});

const provisionBody = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase DNS-like"),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1),
  admin_last_name: z.string().min(1),
});

app.post("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  let body: z.infer<typeof provisionBody>;
  try {
    body = provisionBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  const ownerOk = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.id, body.owner_id))
    .limit(1);
  if (ownerOk.length === 0) {
    return c.json({ error: "owner_id does not exist" }, 400);
  }

  const slugTaken = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, body.slug))
    .limit(1);
  if (slugTaken.length > 0) {
    return c.json(
      { error: `Tenant slug already exists: ${body.slug}` },
      409,
    );
  }

  const correlationId = randomUUID();
  const log = (m: string) => {
    console.log(JSON.stringify({ level: "info", correlationId, message: m }));
  };

  const acceptTrace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: body.slug }),
    log,
  );
  await acceptTrace.event(
    "api",
    "HTTP 202 — provisioning accepted; background worker will start",
  );

  const job = await insertTenantJob(db, {
    type: "tenant.provision",
    correlationId,
    payload: {
      slug: body.slug,
      name: body.name,
      ownerId: body.owner_id,
      adminEmail: body.admin_email,
      adminFirstName: body.admin_first_name,
      adminLastName: body.admin_last_name,
    },
  });

  return c.json(
    {
      accepted: true,
      jobId: job?.id ?? null,
      correlationId,
      admin_email: body.admin_email,
      poll: `/tenants/provision-status/${correlationId}`,
      stream: `/tenants/provision-stream/${correlationId}`,
      message:
        "Provisioning queued for infra worker execution. Poll provision-status until status is complete or failed.",
      note:
        "Save oneTimeAdminPassword from the status response when complete — it is not stored in Stockix.",
    },
    202,
  );
});

app.get("/tenants/provision-status/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const jobs = await listTenantJobs(db, correlationId);
  const lastJob = jobs[jobs.length - 1] ?? null;
  const events = await loadProvisionEventsJson(correlationId);

  if (!lastJob) {
    if (events.length === 0) {
      return c.json(
        {
          error: "unknown_or_expired_job",
          message:
            "No job for this id (expired ~15m after completion, or the API process restarted).",
        },
        404,
      );
    }
    const last = events[events.length - 1]!;
    if (last.phase === "complete") {
      return c.json({
        status: "complete",
        correlationId,
        events,
        oneTimeAdminPassword: null,
        note:
          "In-memory job expired — one-time password was only in the earlier status response. Check Stockix reset flows or reprovision. Trace is still available in `events`.",
      });
    }
    if (last.phase === "failed") {
      return c.json({
        status: "failed",
        correlationId,
        error: last.message,
        cause:
          last.meta && typeof last.meta === "object" && "cause" in last.meta
            ? String((last.meta as { cause?: unknown }).cause)
            : undefined,
        events,
      });
    }
    return c.json({
      status: "running",
      correlationId,
      message:
        "No lifecycle job record found; see `events` for persisted trace state.",
      events,
    });
  }

  if (lastJob.status === "pending" || lastJob.status === "running" || lastJob.status === "failed") {
    return c.json({ status: lastJob.status === "pending" ? "queued" : lastJob.status, correlationId, jobId: lastJob.id, events });
  }

  if (lastJob.status === "completed") {
    const completeEvent = [...events].reverse().find((event) => event.phase === "complete");
    const eventMeta =
      completeEvent?.meta && typeof completeEvent.meta === "object"
        ? (completeEvent.meta as Record<string, unknown>)
        : {};
    return c.json({
      status: "complete",
      correlationId,
      jobId: lastJob.id,
      tenantId: typeof eventMeta.tenantId === "string" ? eventMeta.tenantId : null,
      deploymentId: typeof eventMeta.deploymentId === "string" ? eventMeta.deploymentId : null,
      composeProjectName:
        typeof eventMeta.composeProjectName === "string" ? eventMeta.composeProjectName : null,
      internalPort: typeof eventMeta.internalPort === "number" ? eventMeta.internalPort : null,
      baseUrl: typeof eventMeta.baseUrl === "string" ? eventMeta.baseUrl : null,
      oneTimeAdminPassword:
        typeof eventMeta.oneTimeAdminPassword === "string" ? eventMeta.oneTimeAdminPassword : null,
      events,
      note:
        "Stockix login API field is `crediential` (typo) if you call /api/auth/login.",
    });
  }

  return c.json({
    status: lastJob.status === "dead" ? "failed" : lastJob.status,
    correlationId,
    jobId: lastJob.id,
    error: lastJob.lastError,
    cause: lastJob.lastError,
    events,
  });
});

app.get("/tenants/provision-stream/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const jobs = await listTenantJobs(db, correlationId);
  const anyRow = await db
    .select({ id: tenantProvisionEvents.id })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .limit(1);

  if (jobs.length === 0 && anyRow.length === 0) {
    return c.json(
      {
        error: "unknown_or_expired_job",
        message:
          "No in-memory job and no provision trace for this correlation id.",
      },
      404,
    );
  }

  return streamSSE(c, async (stream) => {
    const sent = new Set<string>();
    const forward = async (payload: ProvisionEventPayload) => {
      if (sent.has(payload.id)) return;
      sent.add(payload.id);
      await stream.writeSSE({
        event: "provision",
        data: JSON.stringify(payload),
      });
    };
    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });

    while (!closed) {
      const rows = await db
        .select()
        .from(tenantProvisionEvents)
        .where(eq(tenantProvisionEvents.correlationId, correlationId))
        .orderBy(asc(tenantProvisionEvents.createdAt), asc(tenantProvisionEvents.id));

      for (const row of rows) {
        await forward(rowToProvisionPayload(row));
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  });
});

app.get("/tenants/:tenantId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      adminEmail: tenants.adminEmail,
      adminFirstName: tenants.adminFirstName,
      adminLastName: tenants.adminLastName,
      ownerId: tenants.ownerId,
      createdAt: tenants.createdAt,
      deploymentStatus: tenantDeployments.status,
      composeProjectName: tenantDeployments.composeProjectName,
      internalPort: tenantDeployments.internalPort,
      deploymentLastError: tenantDeployments.lastError,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
      deploymentCreatedAt: tenantDeployments.createdAt,
      deploymentUpdatedAt: tenantDeployments.updatedAt,
      appName: tenantConfig.appName,
      logoUrl: tenantConfig.logoUrl,
      primaryColor: tenantConfig.primaryColor,
      branding: tenantConfig.branding,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .leftJoin(tenantConfig, eq(tenantConfig.tenantId, tenants.id))
    .where(eq(tenants.id, parsed.data))
    .limit(1);

  const row = rows[0];
  if (!row) return c.json({ error: "tenant_not_found" }, 404);

  return c.json({
    tenant: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      adminEmail: row.adminEmail,
      adminFirstName: row.adminFirstName,
      adminLastName: row.adminLastName,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      deployment:
        row.deploymentStatus === null
          ? null
          : {
              status: row.deploymentStatus,
              composeProjectName: row.composeProjectName,
              internalPort: row.internalPort,
              lastError: row.deploymentLastError,
              registrationCompletedAt: row.registrationCompletedAt
                ? row.registrationCompletedAt.toISOString()
                : null,
              createdAt: row.deploymentCreatedAt?.toISOString(),
              updatedAt: row.deploymentUpdatedAt?.toISOString(),
            },
      config:
        row.appName === null &&
        row.logoUrl === null &&
        row.primaryColor === null &&
        row.branding === null
          ? null
          : {
              appName: row.appName,
              logoUrl: row.logoUrl,
              primaryColor: row.primaryColor,
              branding: row.branding ?? null,
            },
    },
  });
});

const tenantPatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    adminEmail: z.string().email().optional(),
    adminFirstName: z.string().min(1).max(100).optional(),
    adminLastName: z.string().min(1).max(100).optional(),
  })
  .strip();

app.patch("/tenants/:tenantId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  let body: z.infer<typeof tenantPatchBody>;
  try {
    body = tenantPatchBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      {
        error: "invalid_body",
        detail: e instanceof z.ZodError ? e.flatten() : String(e),
      },
      400,
    );
  }

  if (Object.keys(body).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  const [updated] = await db
    .update(tenants)
    .set(body)
    .where(eq(tenants.id, parsed.data))
    .returning();

  if (!updated) return c.json({ error: "tenant_not_found" }, 404);

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.update",
    targetTenantId: updated.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  const deployment = await db
    .select({
      status: tenantDeployments.status,
      composeProjectName: tenantDeployments.composeProjectName,
      internalPort: tenantDeployments.internalPort,
      lastError: tenantDeployments.lastError,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
      createdAt: tenantDeployments.createdAt,
      updatedAt: tenantDeployments.updatedAt,
    })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, updated.id))
    .limit(1);

  const config = await db
    .select({
      appName: tenantConfig.appName,
      logoUrl: tenantConfig.logoUrl,
      primaryColor: tenantConfig.primaryColor,
      branding: tenantConfig.branding,
    })
    .from(tenantConfig)
    .where(eq(tenantConfig.tenantId, updated.id))
    .limit(1);

  return c.json({
    tenant: {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      status: updated.status,
      adminEmail: updated.adminEmail,
      adminFirstName: updated.adminFirstName,
      adminLastName: updated.adminLastName,
      ownerId: updated.ownerId,
      createdAt: updated.createdAt.toISOString(),
      deployment: deployment[0]
        ? {
            ...deployment[0],
            registrationCompletedAt: deployment[0].registrationCompletedAt
              ? deployment[0].registrationCompletedAt.toISOString()
              : null,
            createdAt: deployment[0].createdAt.toISOString(),
            updatedAt: deployment[0].updatedAt.toISOString(),
          }
        : null,
      config: config[0] ? { ...config[0], branding: config[0].branding ?? null } : null,
    },
  });
});

async function loadTenantForLifecycle(tenantId: string) {
  if (!db) return null;
  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      tenantStatus: tenants.status,
      deploymentStatus: tenantDeployments.status,
      composeProjectName: tenantDeployments.composeProjectName,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

app.post("/tenants/:tenantId/suspend", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const row = await loadTenantForLifecycle(parsed.data);
  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus !== "active") return c.json({ error: "tenant_not_active" }, 409);
  const job = await insertTenantJob(db, {
    type: "tenant.lifecycle",
    tenantId: parsed.data,
    payload: { tenantId: parsed.data, slug: row.slug, command: "stop", status: "suspended" },
  });

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.suspend",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    accepted: true,
    suspended: true,
    slug: row.slug,
    composeProject: row.composeProjectName,
    jobId: job?.id ?? null,
  }, 202);
});

app.post("/tenants/:tenantId/reactivate", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const row = await loadTenantForLifecycle(parsed.data);
  if (!row) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus !== "suspended") {
    return c.json({ error: "tenant_not_suspended" }, 409);
  }
  const job = await insertTenantJob(db, {
    type: "tenant.lifecycle",
    tenantId: parsed.data,
    payload: { tenantId: parsed.data, slug: row.slug, command: "start", status: "active" },
  });

  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "tenant.reactivate",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    accepted: true,
    reactivated: true,
    slug: row.slug,
    composeProject: row.composeProjectName,
    jobId: job?.id ?? null,
  }, 202);
});

app.get("/tenants/:tenantId/events", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);
  const correlationId = c.req.query("correlationId");
  const whereClause = correlationId
    ? and(
        eq(tenantProvisionEvents.tenantId, parsed.data),
        eq(tenantProvisionEvents.correlationId, correlationId),
      )
    : eq(tenantProvisionEvents.tenantId, parsed.data);
  const rows = await db
    .select({
      id: tenantProvisionEvents.id,
      phase: tenantProvisionEvents.phase,
      level: tenantProvisionEvents.level,
      message: tenantProvisionEvents.message,
      meta: tenantProvisionEvents.meta,
      createdAt: tenantProvisionEvents.createdAt,
    })
    .from(tenantProvisionEvents)
    .where(whereClause)
    .orderBy(asc(tenantProvisionEvents.createdAt), asc(tenantProvisionEvents.id));

  return c.json({
    events: rows.map((row) => ({
      ...row,
      meta: row.meta ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

const port = apiConfig.port;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
