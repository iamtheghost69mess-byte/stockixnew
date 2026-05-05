import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execa } from "execa";

import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import { createDb } from "@repo/db";
import { ROLES } from "@repo/shared/roles";
import { ROLE_RANK, type Role } from "@repo/shared/roles";

const apiDir = path.join(fileURLToPath(new URL("..", import.meta.url)));
const monorepoRoot = path.join(apiDir, "..", "..");
// Use override so values from .env win over empty or stale DATABASE_URL in the shell
// (dotenv does not override existing env vars by default).
loadEnv({ path: path.join(monorepoRoot, ".env"), override: true });
loadEnv({ path: path.join(apiDir, ".env"), override: true });
loadEnv({ path: path.join(apiDir, ".env.local"), override: true });
import {
  adminAuditLog,
  apiIdempotencyKeys,
  owners,
  tenantConfig,
  tenantDeployments,
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
  getProvisionJob,
  setProvisionJob,
} from "./provision-jobs.js";
import { subscribeProvision } from "./provision-bus.js";
import { deprovisionTenant, provisionTenant } from "./provisioner.js";
import {
  createProvisionTracer,
  type ProvisionEventPayload,
} from "./provision-trace.js";

const databaseUrl = process.env.DATABASE_URL;
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

const app = new Hono();
const platformApiSecret = process.env.PLATFORM_API_SECRET;

app.onError((err, c) => {
  console.error("[api]", err);
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: "internal_error", message }, 500);
});

const rootDomain = process.env.ROOT_DOMAIN?.trim();
const corsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(rootDomain
    ? [`https://${rootDomain}`, `http://${rootDomain}`, `https://www.${rootDomain}`]
    : []),
  ...(process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

app.use(
  "/*",
  cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Actor-Id", "Idempotency-Key"],
  }),
);

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

const IDEMPOTENCY_TTL_HOURS = 24;
app.use("/*", async (c, next) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  const isPrivilegedWrite =
    ["POST", "PATCH", "DELETE"].includes(method) &&
    (path.startsWith("/owners") || path.startsWith("/tenants"));
  if (!isPrivilegedWrite) return next();

  const actorId = c.req.header("X-Actor-Id") ?? "";
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

  const actorId = c.req.header("X-Actor-Id") ?? "";
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
    actorId: c.req.header("X-Actor-Id") ?? "",
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
      invitedById: c.req.header("X-Actor-Id") ?? null,
    })
    .returning({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
    });
  if (!owner) return c.json({ error: "failed_to_create_invite" }, 500);
  const dashboardUrl = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
  const inviteUrl = `${dashboardUrl ?? "http://localhost:3000"}/accept-invite?token=${inviteToken}`;
  await logAudit(db, {
    actorId: c.req.header("X-Actor-Id") ?? "",
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
      .select({ id: owners.id, role: owners.role })
      .from(owners)
      .where(eq(owners.id, parsed.data))
      .limit(1);
    const targetOwner = target[0];
    if (!targetOwner) return c.json({ error: "not_found" }, 404);
    if (targetOwner.role === "super_admin") {
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
      actorId: c.req.header("X-Actor-Id") ?? "",
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

  const actorId = c.req.header("X-Actor-Id") ?? "";
  if (body.role && actorId === parsed.data) {
    return c.json({ error: "cannot_change_own_role" }, 403);
  }
  if (body.status && body.status !== "active" && actorId === parsed.data) {
    return c.json({ error: "cannot_suspend_self" }, 403);
  }

  if (body.role && existing.role === "super_admin" && body.role !== "super_admin") {
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
  const removeVolumes =
    c.req.query("volumes") === "1" || c.req.query("volumes") === "true";
  const result = await deprovisionTenant(db, parsed.data, {
    removeVolumes,
    log: (m) => console.log(`[deprovision] ${m}`),
  });
  if (!result.ok) {
    return c.json({ error: result.message }, 404);
  }
  await logAudit(db, {
    actorId: c.req.header("X-Actor-Id") ?? "",
    action: "tenant.delete",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { deletedTenantId: parsed.data, slug: result.slug },
  });
  return c.json({
    deleted: true,
    slug: result.slug,
    composeProject: result.composeProject,
    docker: result.docker,
  });
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

  setProvisionJob(correlationId, { status: "queued" });

  void (async () => {
    setProvisionJob(correlationId, { status: "running" });
    try {
      const result = await provisionTenant(
        db,
        {
          slug: body.slug,
          name: body.name,
          ownerId: body.owner_id,
          adminEmail: body.admin_email,
          adminFirstName: body.admin_first_name,
          adminLastName: body.admin_last_name,
        },
        log,
        correlationId,
      );

      if (!result.ok) {
        setProvisionJob(correlationId, {
          status: "failed",
          message: result.message,
          cause: result.cause,
          correlationId,
        });
        return;
      }

      setProvisionJob(correlationId, { status: "succeeded", result });
      await logAudit(db, {
        actorId: c.req.header("X-Actor-Id") ?? "",
        action: "tenant.create",
        targetTenantId: result.tenantId,
        ipAddress: c.req.header("x-forwarded-for") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      setProvisionJob(correlationId, {
        status: "failed",
        message,
        cause: String(err),
        correlationId,
      });
    }
  })().catch((e) => {
    console.error(JSON.stringify({ level: "error", correlationId, message: String(e) }));
  });

  return c.json(
    {
      accepted: true,
      correlationId,
      admin_email: body.admin_email,
      poll: `/tenants/provision-status/${correlationId}`,
      stream: `/tenants/provision-stream/${correlationId}`,
      message:
        "Provisioning started in the background. First Docker run can take many minutes (image pulls, MySQL, migrations). Poll provision-status until status is complete or failed.",
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
  const job = getProvisionJob(correlationId);
  const events = await loadProvisionEventsJson(correlationId);

  if (!job) {
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
        "In-memory job missing (API restart?) — live updates may be stale; see `events` for the persisted trace.",
      events,
    });
  }

  if (job.status === "queued" || job.status === "running") {
    return c.json({ status: job.status, correlationId, events });
  }

  if (job.status === "succeeded") {
    const r = job.result;
    return c.json({
      status: "complete",
      correlationId,
      tenantId: r.tenantId,
      deploymentId: r.deploymentId,
      composeProjectName: r.composeProjectName,
      internalPort: r.internalPort,
      baseUrl: r.baseUrl,
      oneTimeAdminPassword: r.oneTimeAdminPassword,
      events,
      note:
        "Stockix login API field is `crediential` (typo) if you call /api/auth/login.",
    });
  }

  return c.json({
    status: "failed",
    correlationId,
    error: job.message,
    cause: job.cause,
    events,
  });
});

app.get("/tenants/provision-stream/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const job = getProvisionJob(correlationId);
  const anyRow = await db
    .select({ id: tenantProvisionEvents.id })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .limit(1);

  if (!job && anyRow.length === 0) {
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

    const unsub = subscribeProvision(correlationId, (p) => {
      void forward(p);
    });

    const rows = await db
      .select()
      .from(tenantProvisionEvents)
      .where(eq(tenantProvisionEvents.correlationId, correlationId))
      .orderBy(
        asc(tenantProvisionEvents.createdAt),
        asc(tenantProvisionEvents.id),
      );

    for (const row of rows) {
      await forward(rowToProvisionPayload(row));
    }

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        unsub();
        resolve();
      });
    });
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
    actorId: c.req.header("X-Actor-Id") ?? "",
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
  if (!row || !row.composeProjectName) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus !== "active") return c.json({ error: "tenant_not_active" }, 409);

  try {
    await execa("docker", ["compose", "-p", row.composeProjectName, "stop"], {
      timeout: 60_000,
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? String((error as Error & { stderr?: string }).message ?? "") +
          String((error as Error & { stderr?: string }).stderr ?? "")
        : String(error);
    return c.json({ error: "docker_stop_failed", detail }, 500);
  }

  await db.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, parsed.data));
  await db
    .update(tenantDeployments)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, parsed.data));

  await logAudit(db, {
    actorId: c.req.header("X-Actor-Id") ?? "",
    action: "tenant.suspend",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({ suspended: true, slug: row.slug, composeProject: row.composeProjectName });
});

app.post("/tenants/:tenantId/reactivate", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("tenantId"));
  if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

  const row = await loadTenantForLifecycle(parsed.data);
  if (!row || !row.composeProjectName) return c.json({ error: "tenant_not_found" }, 404);
  if (row.tenantStatus !== "suspended") {
    return c.json({ error: "tenant_not_suspended" }, 409);
  }

  try {
    await execa("docker", ["compose", "-p", row.composeProjectName, "start"], {
      timeout: 60_000,
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? String((error as Error & { stderr?: string }).message ?? "") +
          String((error as Error & { stderr?: string }).stderr ?? "")
        : String(error);
    return c.json({ error: "docker_start_failed", detail }, 500);
  }

  await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, parsed.data));
  await db
    .update(tenantDeployments)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, parsed.data));

  await logAudit(db, {
    actorId: c.req.header("X-Actor-Id") ?? "",
    action: "tenant.reactivate",
    targetTenantId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    reactivated: true,
    slug: row.slug,
    composeProject: row.composeProjectName,
  });
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

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
