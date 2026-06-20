import type { createDb } from "@repo/db";
import { apiKeys } from "@repo/db/schema";
import { ALL_PERMISSIONS, hasPermission } from "@repo/shared/permissions";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../audit.js";
import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { generateApiKeyMaterial } from "../services/api-keys.js";

type Db = ReturnType<typeof createDb>;

const apiKeyCreateBody = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(z.string()).optional(),
});

/**
 * Idempotency: POST/PATCH/DELETE require `Idempotency-Key` (middleware/idempotency.ts).
 * GET `/api-keys` is naturally idempotent.
 */
export function registerApiKeyRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db | null): void {
  app.get("/api-keys", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  if (c.get("apiKeyId")) {
    return c.json(
      { error: "forbidden", message: "API keys cannot be listed using an API key." },
      403,
    );
  }
  const actorId = String(c.get("actorId") ?? "");
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.ownerId, actorId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return c.json({
    keys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

app.post("/api-keys", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  if (c.get("apiKeyId")) {
    return c.json(
      { error: "forbidden", message: "API keys cannot be created using an API key." },
      403,
    );
  }
  const actorId = String(c.get("actorId") ?? "");
  let body: z.infer<typeof apiKeyCreateBody>;
  try {
    body = apiKeyCreateBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  // Validate that requested permissions are a subset of the actor's permissions
  let scopedPermissions: string[] | null = null;
  if (body.permissions && body.permissions.length > 0) {
    const actorPerms: readonly string[] = c.get("actorPermissions") ?? [];
    const allowed = new Set<string>(ALL_PERMISSIONS);
    if (hasPermission(actorPerms, "*")) allowed.add("*");
    const invalid = body.permissions.filter((p) => !allowed.has(p));
    if (invalid.length > 0) {
      return c.json({ error: "invalid_permissions", detail: `Unknown permissions: ${invalid.join(", ")}` }, 400);
    }
    const exceeds = body.permissions.filter((p) => !hasPermission(actorPerms, p));
    if (exceeds.length > 0) {
      return c.json({ error: "forbidden", detail: "Cannot grant permissions you do not have" }, 403);
    }
    scopedPermissions = body.permissions;
  }

  const { rawKey, keyPrefix, keyHash } = generateApiKeyMaterial();
  const now = new Date();
  const [inserted] = await db
    .insert(apiKeys)
    .values({
      ownerId: actorId,
      name: body.name.trim(),
      keyPrefix,
      keyHash,
      permissions: scopedPermissions,
      updatedAt: now,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
    });
  if (!inserted) {
    return c.json({ error: "api_key_create_failed" }, 500);
  }
  await logAudit(db, {
    actorId,
    action: "api_key.created",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { keyId: inserted.id, name: inserted.name },
  });
  return c.json(
    {
      id: inserted.id,
      name: inserted.name,
      keyPrefix: inserted.keyPrefix,
      createdAt: inserted.createdAt.toISOString(),
      rawKey,
    },
    201,
  );
});

app.delete("/api-keys/:keyId", async (c) => {
  if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
  if (c.get("apiKeyId")) {
    return c.json(
      { error: "forbidden", message: "API keys cannot be revoked using an API key." },
      403,
    );
  }
  const parsedId = z.string().uuid().safeParse(c.req.param("keyId"));
  if (!parsedId.success) {
    return c.json({ error: "keyId must be a UUID" }, 400);
  }
  const actorId = String(c.get("actorId") ?? "");
  const now = new Date();
  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(apiKeys.id, parsedId.data),
        eq(apiKeys.ownerId, actorId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!updated) {
    return c.json({ error: "api_key_not_found" }, 404);
  }
  await logAudit(db, {
    actorId,
    action: "api_key.revoked",
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: { keyId: updated.id },
  });
  return c.json({ ok: true });
});

}
