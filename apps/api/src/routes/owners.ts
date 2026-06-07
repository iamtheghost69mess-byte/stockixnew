import { apiConfig } from "@repo/config";
import type { createDb } from "@repo/db";
import {
  adminAuditLog,
  apiKeys,
  organizations,
  owners,
  platformRoles,
  tenantDeployments,
  tenants,
} from "@repo/db/schema";
import { ROLES } from "@repo/shared/roles";
import { and, desc, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../audit.js";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { deliverOwnerInviteEmail } from "../services/invites/owner-invite-delivery.js";
import { generateOwnerInviteToken } from "../services/invites/invite-token.js";
import { resendOwnerInvite } from "../services/invites/invites.js";
import { isOwnerInviteMailQueueEnabled } from "../jobs/owner-invite-mail-queue.js";
type Db = ReturnType<typeof createDb>;

/**
 * Idempotency: POST/PATCH/DELETE require `Idempotency-Key` (middleware/idempotency.ts).
 * GET routes are naturally idempotent. `/internal/*` and webhooks are out of scope.
 */
export function registerOwnerRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
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
      roleName: platformRoles.name,
      status: owners.status,
      hasPassword: sql<boolean>`${owners.passwordHash} IS NOT NULL`,
      mfaEnabled: owners.mfaEnabled,
      createdAt: owners.createdAt,
      inviteTokenExpiresAt: owners.inviteTokenExpiresAt,
    })
    .from(owners)
    .leftJoin(platformRoles, eq(owners.roleId, platformRoles.id));
  return c.json({
    owners: rows.map((r) => ({
      ...r,
      roleName: r.roleName ?? r.role.replace(/_/g, " "),
      createdAt: r.createdAt.toISOString(),
      inviteTokenExpiresAt: r.inviteTokenExpiresAt?.toISOString() ?? null,
    })),
  });
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
    action: "owner.create",
    targetOwnerId: row.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json({ owner: row }, 201);
});

const inviteBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: ownerRoleSchema.optional(),
  roleId: z.string().uuid().optional(),
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
  if (!body.roleId && !body.role) {
    return c.json({ error: "role_or_roleId_required" }, 400);
  }
  const existing = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.email, body.email))
    .limit(1);
  if (existing.length > 0) return c.json({ error: "email_already_exists" }, 409);

  let roleSlug = body.role ?? "read_only";
  let roleId: string | null = body.roleId ?? null;
  if (roleId) {
    const [pr] = await db
      .select({ id: platformRoles.id, slug: platformRoles.slug })
      .from(platformRoles)
      .where(eq(platformRoles.id, roleId))
      .limit(1);
    if (!pr) return c.json({ error: "invalid_role_id" }, 400);
    const parsedSlug = ownerRoleSchema.safeParse(pr.slug);
    if (!parsedSlug.success) return c.json({ error: "invalid_role_slug" }, 400);
    roleSlug = parsedSlug.data;
    roleId = pr.id;
  } else {
    const [pr] = await db
      .select({ id: platformRoles.id })
      .from(platformRoles)
      .where(eq(platformRoles.slug, roleSlug))
      .limit(1);
    roleId = pr?.id ?? null;
  }

  const { raw: inviteRawToken, hash: inviteTokenHash } = generateOwnerInviteToken();
  const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [owner] = await db
    .insert(owners)
    .values({
      email: body.email,
      name: body.name,
      role: roleSlug,
      roleId,
      inviteToken: null,
      inviteTokenHash,
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
  const dashUrl = apiConfig.dashboardUrl;
  if (!dashUrl && apiConfig.nodeEnv === "production") {
    throw new Error("DASHBOARD_URL must be set in production — cannot generate invite URL");
  }
  const inviteUrl = `${(dashUrl ?? "http://localhost:3000").replace(/\/+$/, "")}/accept-invite?token=${inviteRawToken}`;
  await logAudit(db, {
    actorId: (c.get("actorId") as string | undefined) ?? "",
    action: "owner.invite",
    targetOwnerId: owner.id,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { role: owner.role, email: owner.email },
  });
  const actorId = (c.get("actorId") as string | undefined) ?? null;
  const delivery = await deliverOwnerInviteEmail(db, {
    ownerId: owner.id,
    to: owner.email,
    name: owner.name,
    role: owner.role,
    inviteUrl,
    actorId,
    source: "invite",
  });

  if (delivery.mode === "queued") {
    return c.json(
      {
        owner,
        emailSent: false,
        emailQueued: true,
        mailConfigured: delivery.mailConfigured,
      },
      201,
    );
  }

  const emailSent = delivery.emailSent;
  if (!emailSent && !isOwnerInviteMailQueueEnabled()) {
    logger.error("owners invite email not sent", undefined, { email: owner.email });
    await logAudit(db, {
      actorId: actorId ?? "",
      action: "invite.email_failed",
      targetOwnerId: owner.id,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { email: owner.email, reason: "inline_send_failed" },
    });
  }
  return c.json(
    {
      owner,
      emailSent,
      mailConfigured: delivery.mailConfigured,
    },
    201,
  );
});

app.post("/owners/:ownerId/resend-invite", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  const parsed = z.string().uuid().safeParse(c.req.param("ownerId"));
  if (!parsed.success) return c.json({ error: "ownerId must be a UUID" }, 400);

  const actorId = (c.get("actorId") as string | undefined) ?? null;
  const result = await resendOwnerInvite(db, parsed.data, actorId);
  if (!result.success) {
    return c.json(
      { error: result.error },
      (result.status ?? 400) as 400 | 404,
    );
  }

  await logAudit(db, {
    actorId: actorId ?? "",
    action: "owner.invite_resend",
    targetOwnerId: parsed.data,
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: {
      email: result.data.owner.email,
      emailSent: result.data.emailSent,
      emailQueued: result.data.emailQueued ?? false,
    },
  });

  if (
    !result.data.emailSent &&
    !result.data.emailQueued &&
    !isOwnerInviteMailQueueEnabled()
  ) {
    await logAudit(db, {
      actorId: actorId ?? "",
      action: "invite.email_failed",
      targetOwnerId: parsed.data,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { email: result.data.owner.email, reason: "resend_failed" },
    });
  }

  return c.json(result.data, 200);
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

}
