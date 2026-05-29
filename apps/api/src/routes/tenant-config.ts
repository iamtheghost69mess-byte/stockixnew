import { tenantConfig, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { createDb } from "@repo/db";
import { syncTenantBrandingToFinance } from "../finance-branding-sync.js";
import { generatePublicDiscoverySlug } from "../lib/tenant-discovery-slug.js";
type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    requestId: string;
    requestStartMs: number;
    apiKeyId?: string;
  };
};

const tenantConfigBody = z.object({
  appName: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  branding: z.record(z.unknown()).nullable().optional(),
});

export type TenantConfigRow = {
  appName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  branding: Record<string, unknown> | null;
};

export async function ensureDefaultTenantConfig(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  defaults: { appName: string },
): Promise<void> {
  const existing = await db
    .select({ id: tenantConfig.id })
    .from(tenantConfig)
    .where(eq(tenantConfig.tenantId, tenantId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(tenantConfig).values({
    tenantId,
    appName: defaults.appName,
    logoUrl: null,
    primaryColor: "#ca8a04",
    publicDiscoverySlug: generatePublicDiscoverySlug(),
    branding: null,
  });
}

export function registerTenantConfigApi(
  app: Hono<ApiEnv>,
  db: ReturnType<typeof createDb> | null,
): void {
  app.get("/tenants/:tenantId/config", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const tenantId = c.req.param("tenantId");
    const parsed = z.string().uuid().safeParse(tenantId);
    if (!parsed.success) return c.json({ error: "tenantId must be a UUID" }, 400);

    const [tenantRow] = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, parsed.data))
      .limit(1);
    if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

    const [row] = await db
      .select()
      .from(tenantConfig)
      .where(eq(tenantConfig.tenantId, parsed.data))
      .limit(1);

    if (!row) {
      return c.json({
        tenantId: parsed.data,
        appName: tenantRow.name,
        logoUrl: null,
        primaryColor: "#ca8a04",
        branding: null,
      });
    }

    return c.json({
      tenantId: row.tenantId,
      appName: row.appName,
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
      branding: row.branding ?? null,
    });
  });

  app.put("/tenants/:tenantId/config", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const tenantId = c.req.param("tenantId");
    const parsedId = z.string().uuid().safeParse(tenantId);
    if (!parsedId.success) return c.json({ error: "tenantId must be a UUID" }, 400);

    const body = await c.req.json().catch(() => null);
    const parsedBody = tenantConfigBody.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        { error: "VALIDATION_ERROR", detail: parsedBody.error.flatten() },
        400,
      );
    }

    const [tenantRow] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, parsedId.data))
      .limit(1);
    if (!tenantRow) return c.json({ error: "tenant_not_found" }, 404);

    const patch = parsedBody.data;
    const [existing] = await db
      .select({ id: tenantConfig.id })
      .from(tenantConfig)
      .where(eq(tenantConfig.tenantId, parsedId.data))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(tenantConfig)
        .set({
          ...(patch.appName !== undefined ? { appName: patch.appName } : {}),
          ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl } : {}),
          ...(patch.primaryColor !== undefined ? { primaryColor: patch.primaryColor } : {}),
          ...(patch.branding !== undefined ? { branding: patch.branding } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenantConfig.tenantId, parsedId.data))
        .returning();

      if (!updated) {
        return c.json({ error: "tenant_config_update_failed" }, 500);
      }

      const response = {
        tenantId: updated.tenantId,
        appName: updated.appName,
        logoUrl: updated.logoUrl,
        primaryColor: updated.primaryColor,
        branding: updated.branding ?? null,
      };
      void syncTenantBrandingToFinance(db, {
        stockixTenantId: parsedId.data,
        appName: response.appName,
        logoUrl: response.logoUrl,
        primaryColor: response.primaryColor,
      });
      return c.json(response);
    }

    const [inserted] = await db
      .insert(tenantConfig)
      .values({
        tenantId: parsedId.data,
        appName: patch.appName ?? null,
        logoUrl: patch.logoUrl ?? null,
        primaryColor: patch.primaryColor ?? "#ca8a04",
        branding: patch.branding ?? null,
      })
      .returning();

    if (!inserted) {
      return c.json({ error: "tenant_config_insert_failed" }, 500);
    }

    const response = {
      tenantId: inserted.tenantId,
      appName: inserted.appName,
      logoUrl: inserted.logoUrl,
      primaryColor: inserted.primaryColor,
      branding: inserted.branding ?? null,
    };
    void syncTenantBrandingToFinance(db, {
      stockixTenantId: parsedId.data,
      appName: response.appName,
      logoUrl: response.logoUrl,
      primaryColor: response.primaryColor,
    });
    return c.json(response);
  });
}
