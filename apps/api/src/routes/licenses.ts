import { apiConfig, licenseConfig } from "@repo/config";
import {
  blacklistedFingerprints,
  licenseActivations,
  licenseHistory,
  licenses,
  owners,
  plans,
  tenants,
} from "@repo/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import type { Hono } from "hono";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { z } from "zod";
import { logAudit } from "../audit.js";
import { consumeLicenseActivateKeyLimit } from "../middleware/license-rate-limit.js";
import {
  generateLicenseKey,
  generateLicenseKeyForTenant,
  getActiveLicenseForTenant,
  getPlanLimits,
  insertLicenseHistory,
  isLicenseLimitsConsistentWithPlan,
  licenseHistorySnapshot,
  parseLicenseHistoryJson,
  parseLicenseModulesJson,
  signOfflineToken,
  tenantHasActiveLicense,
  validateLicenseModulesForTenant,
  verifyOfflineToken,
} from "../license-utils.js";
import { buildFinanceLicenseLimitFields } from "../finance-license.client.js";
import { triggerFinanceLicenseSync } from "../license-finance-sync.js";
import { sendLicenseActivatedEmailForTenant } from "../mail/send.js";
import {
  posSyncResultToStatus,
  reactivatePosOrgForLicense,
  suspendPosOrgForLicense,
  syncPosOrgLicenseFromLicense,
  syncPosOrgLicenseWindow,
} from "../pos-license-sync.js";
import { DEFAULT_GRACE_PERIOD_DAYS } from "../license-constants.js";

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

type Db = PostgresJsDatabase<typeof schema>;

function csvEscapeCell(value: string | number | boolean | null | undefined): string {
  const cell = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? null;
}

async function resolveLicenseHistoryActor(
  db: Db,
  c: { get: (k: "actorId") => string },
): Promise<{ actorId?: string; actorEmail?: string | null }> {
  const actorId = c.get("actorId");
  if (!actorId) return {};
  const [owner] = await db
    .select({ email: owners.email })
    .from(owners)
    .where(eq(owners.id, actorId))
    .limit(1);
  return { actorId, actorEmail: owner?.email ?? null };
}

const billingIntervalSchema = z.enum(["monthly", "annually", "one_time", "custom"]);

type PlanDbRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  maxOrganizations: number;
  maxActivations: number;
  maxUsers: number;
  isActive: boolean;
  sortOrder: number;
  priceMonthly: number | null;
  priceAnnually: number | null;
  currency: string | null;
  billingInterval: string | null;
  isPublic: boolean;
  features: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parsePlanFeatures(features: string | null): string[] {
  if (!features) return [];
  try {
    const parsed: unknown = JSON.parse(features);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function formatPlanPrice(cents: number | null, currency: string | null): string | null {
  if (cents == null) return null;
  return `${(cents / 100).toFixed(2)} ${currency ?? "USD"}`;
}

export function serializePlanRow(p: PlanDbRow, activeLicenseCount = 0) {
  const currency = p.currency ?? "USD";
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    maxOrganizations: p.maxOrganizations,
    maxActivations: p.maxActivations,
    maxUsers: p.maxUsers,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    priceMonthly: p.priceMonthly,
    priceAnnually: p.priceAnnually,
    currency: p.currency,
    billingInterval: p.billingInterval,
    isPublic: p.isPublic,
    features: parsePlanFeatures(p.features),
    priceMonthlyDisplay: formatPlanPrice(p.priceMonthly, currency),
    priceAnnuallyDisplay: formatPlanPrice(p.priceAnnually, currency),
    activeLicenseCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function planBillingInsertValues(data: {
  priceMonthly?: number | null;
  priceAnnually?: number | null;
  currency?: string;
  billingInterval?: string | null;
  isPublic?: boolean;
  features?: string[] | null;
}) {
  return {
    priceMonthly: data.priceMonthly ?? null,
    priceAnnually: data.priceAnnually ?? null,
    currency: data.currency ?? "USD",
    billingInterval: data.billingInterval ?? null,
    isPublic: data.isPublic ?? false,
    features: data.features?.length ? JSON.stringify(data.features) : null,
  };
}

/**
 * Idempotency: POST/PATCH/DELETE require `Idempotency-Key` (middleware/idempotency.ts).
 * GET routes and public `/plans` listing are naturally idempotent.
 */
export function registerLicenseApi(app: Hono<ApiEnv>, db: Db | null): void {
  app.get("/plans", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.name));
    const activeCounts = await db
      .select({ planSlug: licenses.planSlug, c: count() })
      .from(licenses)
      .where(eq(licenses.status, "active"))
      .groupBy(licenses.planSlug);
    const activeBySlug = new Map(activeCounts.map((r) => [r.planSlug, Number(r.c ?? 0)]));
    return c.json({
      plans: rows.map((p) =>
        serializePlanRow(p, activeBySlug.get(p.slug) ?? 0),
      ),
    });
  });

  const createPlanBody = z.object({
    name: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().max(500).optional(),
    maxOrganizations: z.number().int().min(-1).max(9999).default(1),
    maxActivations: z.number().int().min(1).max(9999).default(1),
    maxUsers: z.number().int().min(1).default(999),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    priceMonthly: z.number().int().min(0).optional().nullable(),
    priceAnnually: z.number().int().min(0).optional().nullable(),
    currency: z.string().length(3).optional(),
    billingInterval: billingIntervalSchema.optional().nullable(),
    isPublic: z.boolean().default(false),
    features: z.array(z.string()).optional().nullable(),
  });

  app.post("/plans", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const raw = await c.req.json().catch(() => null);
    const parsed = createPlanBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, 400);
    }
    const [existing] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.slug, parsed.data.slug))
      .limit(1);
    if (existing) {
      return c.json({ error: "SLUG_EXISTS", message: "A plan with this slug already exists" }, 409);
    }
    const [created] = await db
      .insert(plans)
      .values({
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description ?? null,
        maxOrganizations: parsed.data.maxOrganizations,
        maxActivations: parsed.data.maxActivations,
        maxUsers: parsed.data.maxUsers,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
        ...planBillingInsertValues(parsed.data),
      })
      .returning();
    if (!created) return c.json({ error: "create_failed" }, 500);
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "plan.created",
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { planSlug: parsed.data.slug },
    });
    return c.json({ plan: serializePlanRow(created) }, 201);
  });

  const patchPlanBody = z
    .object({
      name: z.string().min(2).max(100).optional(),
      description: z.union([z.string().max(500), z.null()]).optional(),
      maxOrganizations: z.number().int().min(-1).max(9999).optional(),
      maxActivations: z.number().int().min(1).max(9999).optional(),
      maxUsers: z.number().int().min(1).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
      priceMonthly: z.number().int().min(0).optional().nullable(),
      priceAnnually: z.number().int().min(0).optional().nullable(),
      currency: z.string().length(3).optional(),
      billingInterval: billingIntervalSchema.optional().nullable(),
      isPublic: z.boolean().optional(),
      features: z.array(z.string()).optional().nullable(),
    })
    .strict();

  app.patch("/plans/:planId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("planId"));
    if (!idParsed.success) return c.json({ error: "invalid_plan_id" }, 400);
    const raw = await c.req.json().catch(() => null);
    const parsed = patchPlanBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, 400);
    }
    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: "no_fields_to_update" }, 400);
    }
    const [existing] = await db.select().from(plans).where(eq(plans.id, idParsed.data)).limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);
    const setVals: {
      updatedAt: Date;
      name?: string;
      description?: string | null;
      maxOrganizations?: number;
      maxActivations?: number;
      maxUsers?: number;
      isActive?: boolean;
      sortOrder?: number;
      priceMonthly?: number | null;
      priceAnnually?: number | null;
      currency?: string;
      billingInterval?: string | null;
      isPublic?: boolean;
      features?: string | null;
    } = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) setVals.name = parsed.data.name;
    if (parsed.data.description !== undefined) setVals.description = parsed.data.description;
    if (parsed.data.maxOrganizations !== undefined) setVals.maxOrganizations = parsed.data.maxOrganizations;
    if (parsed.data.maxActivations !== undefined) setVals.maxActivations = parsed.data.maxActivations;
    if (parsed.data.maxUsers !== undefined) setVals.maxUsers = parsed.data.maxUsers;
    if (parsed.data.isActive !== undefined) setVals.isActive = parsed.data.isActive;
    if (parsed.data.sortOrder !== undefined) setVals.sortOrder = parsed.data.sortOrder;
    if (parsed.data.priceMonthly !== undefined) setVals.priceMonthly = parsed.data.priceMonthly;
    if (parsed.data.priceAnnually !== undefined) setVals.priceAnnually = parsed.data.priceAnnually;
    if (parsed.data.currency !== undefined) setVals.currency = parsed.data.currency;
    if (parsed.data.billingInterval !== undefined) setVals.billingInterval = parsed.data.billingInterval;
    if (parsed.data.isPublic !== undefined) setVals.isPublic = parsed.data.isPublic;
    if (parsed.data.features !== undefined) {
      setVals.features = parsed.data.features?.length
        ? JSON.stringify(parsed.data.features)
        : null;
    }
    const [updated] = await db
      .update(plans)
      .set(setVals)
      .where(eq(plans.id, idParsed.data))
      .returning();
    if (!updated) return c.json({ error: "not_found" }, 404);
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "plan.updated",
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { planId: updated.id, planSlug: updated.slug },
    });
    return c.json({ plan: serializePlanRow(updated) });
  });

  app.delete("/plans/:planId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("planId"));
    if (!idParsed.success) return c.json({ error: "invalid_plan_id" }, 400);
    const [planRow] = await db.select().from(plans).where(eq(plans.id, idParsed.data)).limit(1);
    if (!planRow) return c.json({ error: "not_found" }, 404);
    const [activeN] = await db
      .select({ c: count() })
      .from(licenses)
      .where(and(eq(licenses.planSlug, planRow.slug), eq(licenses.status, "active")));
    if (Number(activeN?.c ?? 0) > 0) {
      return c.json(
        {
          error: "PLAN_IN_USE",
          message: "Cannot deactivate a plan with active licenses",
        },
        409,
      );
    }
    await db
      .update(plans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(plans.id, planRow.id));
    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "plan.deactivated",
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { planSlug: planRow.slug, planId: planRow.id },
    });
    return c.json({ ok: true });
  });

  const generateBody = z
    .object({
      product: z.enum(["platform", "pos_desktop", "bundle"]),
      modules: z
        .array(z.enum(["accounting", "pos", "pms", "chat"]))
        .default(["accounting"]),
      planSlug: z.string().min(1),
      count: z.number().int().min(1).max(100).default(1),
      isPerpetual: z.boolean().default(false),
      expiresAt: z.string().datetime().optional(),
      validFrom: z.string().datetime().optional(),
      maxActivations: z.number().int().min(1).max(50).default(1),
      gracePeriodDays: z.number().int().min(0).max(365).default(DEFAULT_GRACE_PERIOD_DAYS),
      notes: z.string().max(500).optional(),
      tenantId: z.string().uuid().optional(),
      scopedLocationId: z.string().min(1).max(64).optional(),
    })
    .refine((data) => data.isPerpetual || data.expiresAt !== undefined, {
      message: "expiresAt is required when isPerpetual is false",
      path: ["expiresAt"],
    });

  app.post("/licenses/generate", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const raw = await c.req.json().catch(() => null);
    const parsed = generateBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", detail: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    const [planRow] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.slug, body.planSlug), eq(plans.isActive, true)))
      .limit(1);
    if (!planRow) {
      return c.json({ error: "invalid_plan", message: `Plan not found: ${body.planSlug}` }, 400);
    }
    if (body.tenantId) {
      const [t] = await db
        .select({ id: tenants.id, modules: tenants.modules })
        .from(tenants)
        .where(eq(tenants.id, body.tenantId))
        .limit(1);
      if (!t) return c.json({ error: "tenant_not_found" }, 404);
      const moduleCheck = validateLicenseModulesForTenant(t.modules, body.modules);
      if (!moduleCheck.ok) {
        return c.json({ error: "modules_exceed_tenant", message: moduleCheck.message }, 400);
      }
      if (await tenantHasActiveLicense(db, body.tenantId)) {
        return c.json(
          {
            error: "tenant_already_licensed",
            message: "This tenant already has an active license. Revoke or expire it before assigning another.",
          },
          409,
        );
      }
    }
    const actorId = c.get("actorId") as string;
    const expiresAtDate = body.expiresAt ? new Date(body.expiresAt) : null;
    const validFromDate = body.validFrom ? new Date(body.validFrom) : null;
    const now = new Date();
    const planLimits = await getPlanLimits(db, body.planSlug);
    const maxActivationsOverride =
      raw !== null && typeof raw === "object" && "maxActivations" in raw;
    const maxActivations = maxActivationsOverride
      ? body.maxActivations
      : planLimits.maxActivations;

    const created = await db.transaction(async (tx) => {
      const out: (typeof licenses.$inferSelect)[] = [];
      for (let i = 0; i < body.count; i++) {
        const keyMeta =
          body.tenantId && body.scopedLocationId
            ? generateLicenseKeyForTenant({
                tenantId: body.tenantId,
                locationId: body.scopedLocationId,
                signingSecret: apiConfig.licenseSigningSecret,
                modules: body.modules,
              })
            : {
                licenseKey: generateLicenseKey(),
                keyFormat: "stkx" as const,
                scopedLocationId: null,
              };
        let licenseKey = keyMeta.licenseKey;
        for (let attempt = 0; attempt < 3; attempt++) {
          const clash = await tx
            .select({ id: licenses.id })
            .from(licenses)
            .where(eq(licenses.licenseKey, licenseKey))
            .limit(1);
          if (clash.length === 0) break;
          const regen =
            body.tenantId && body.scopedLocationId
              ? generateLicenseKeyForTenant({
                  tenantId: body.tenantId,
                  locationId: body.scopedLocationId,
                  signingSecret: apiConfig.licenseSigningSecret,
                  modules: body.modules,
                })
              : {
                  licenseKey: generateLicenseKey(),
                  keyFormat: "stkx" as const,
                  scopedLocationId: null,
                };
          licenseKey = regen.licenseKey;
        }
        const status = body.tenantId ? "active" : "unassigned";
        const assignNow = Boolean(body.tenantId);
        const effectiveStart = assignNow ? (validFromDate ?? now) : validFromDate;
        const [row] = await tx
          .insert(licenses)
          .values({
            licenseKey,
            keyFormat: keyMeta.keyFormat,
            scopedLocationId: keyMeta.scopedLocationId,
            product: body.product,
            modules: JSON.stringify(body.modules),
            planSlug: body.planSlug,
            tenantId: body.tenantId ?? null,
            status,
            activatedAt: assignNow ? effectiveStart : null,
            validFrom: effectiveStart ?? null,
            expiresAt: body.isPerpetual ? null : expiresAtDate,
            isPerpetual: body.isPerpetual,
            maxOrganizations: planLimits.maxOrganizations,
            maxActivations,
            maxUsers: planLimits.maxUsers,
            activationCount: 0,
            gracePeriodDays: body.gracePeriodDays,
            notes: body.notes ?? null,
            createdById: actorId,
          })
          .returning();
        if (row) out.push(row);
      }
      if (body.tenantId) {
        await tx.update(tenants).set({ planSlug: body.planSlug }).where(eq(tenants.id, body.tenantId!));
      }
      return out;
    });

    await logAudit(db, {
      actorId,
      action: "license.generated",
      targetTenantId: body.tenantId ?? undefined,
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { count: created.length, product: body.product, planSlug: body.planSlug },
    });

    const historyActor = await resolveLicenseHistoryActor(db, c);
    for (const license of created) {
      await insertLicenseHistory(db, {
        licenseId: license.id,
        ...historyActor,
        action: "generated",
        newValues: licenseHistorySnapshot(license),
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
      });
    }

    if (body.tenantId && created[0]) {
      void syncPosOrgLicenseFromLicense(db, body.tenantId, created[0]).catch((err) => {
        console.error(
          "[license] POS license sync failed (non-fatal)",
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    return c.json({
      licenses: created.map((row) => ({
        id: row.id,
        licenseKey: row.licenseKey,
        product: row.product,
        planSlug: row.planSlug,
        status: row.status,
      })),
    }, 201);
  });

  app.get("/licenses/analytics", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [[tot], activeRows, unRows, revRows, expStatusRows, expiringRows, prodRows, planRows] =
      await Promise.all([
        db.select({ c: count() }).from(licenses),
        db.select({ c: count() }).from(licenses).where(eq(licenses.status, "active")),
        db.select({ c: count() }).from(licenses).where(eq(licenses.status, "unassigned")),
        db.select({ c: count() }).from(licenses).where(eq(licenses.status, "revoked")),
        db.select({ c: count() }).from(licenses).where(eq(licenses.status, "expired")),
        db
          .select({ c: count() })
          .from(licenses)
          .where(
            and(
              eq(licenses.status, "active"),
              isNotNull(licenses.expiresAt),
              gte(licenses.expiresAt, now),
              lte(licenses.expiresAt, in30),
            ),
          ),
        db
          .select({ product: licenses.product, c: count() })
          .from(licenses)
          .groupBy(licenses.product),
        db
          .select({ planSlug: licenses.planSlug, c: count() })
          .from(licenses)
          .groupBy(licenses.planSlug),
      ]);

    const byProduct = { platform: 0, pos_desktop: 0, bundle: 0 } as Record<
      "platform" | "pos_desktop" | "bundle",
      number
    >;
    for (const r of prodRows) {
      const p = r.product as keyof typeof byProduct;
      if (p in byProduct) byProduct[p] = Number(r.c);
    }
    const byPlan: Record<string, number> = {};
    for (const r of planRows) {
      byPlan[r.planSlug] = Number(r.c);
    }

    return c.json({
      total: Number(tot?.c ?? 0),
      active: Number(activeRows[0]?.c ?? 0),
      unassigned: Number(unRows[0]?.c ?? 0),
      revoked: Number(revRows[0]?.c ?? 0),
      expired: Number(expStatusRows[0]?.c ?? 0),
      expiringIn30Days: Number(expiringRows[0]?.c ?? 0),
      byProduct,
      byPlan,
    });
  });

  app.get("/licenses/export.csv", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const q = c.req.query();
    const status = q.status?.trim();
    const product = q.product?.trim();
    const planSlug = q.planSlug?.trim();
    const tenantId = q.tenantId?.trim();
    const expiringInDays = q.expiringInDays ? Number(q.expiringInDays) : null;
    const search = q.search?.trim();

    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(licenses.status, status));
    if (product) conditions.push(eq(licenses.product, product));
    if (planSlug) conditions.push(eq(licenses.planSlug, planSlug));
    if (tenantId) conditions.push(eq(licenses.tenantId, tenantId));
    if (expiringInDays !== null && !Number.isNaN(expiringInDays) && expiringInDays > 0) {
      const until = new Date();
      until.setDate(until.getDate() + expiringInDays);
      conditions.push(eq(licenses.status, "active"));
      conditions.push(isNotNull(licenses.expiresAt));
      conditions.push(lte(licenses.expiresAt, until));
      conditions.push(gte(licenses.expiresAt, new Date()));
    }
    const whereClause =
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined;

    let searchClause: ReturnType<typeof or> | undefined;
    if (search) {
      const pat = `%${search}%`;
      searchClause = or(ilike(licenses.licenseKey, pat), ilike(tenants.name, pat));
    }

    const fullWhere =
      whereClause && searchClause
        ? and(whereClause, searchClause)
        : whereClause ?? searchClause;

    const baseQuery = db
      .select({
        licenseKey: licenses.licenseKey,
        product: licenses.product,
        planSlug: licenses.planSlug,
        status: licenses.status,
        tenantSlug: tenants.slug,
        tenantName: tenants.name,
        maxActivations: licenses.maxActivations,
        activationCount: licenses.activationCount,
        isPerpetual: licenses.isPerpetual,
        validFrom: licenses.validFrom,
        expiresAt: licenses.expiresAt,
        gracePeriodDays: licenses.gracePeriodDays,
        notes: licenses.notes,
        createdAt: licenses.createdAt,
      })
      .from(licenses)
      .leftJoin(tenants, eq(tenants.id, licenses.tenantId))
      .orderBy(desc(licenses.createdAt));

    const rows = fullWhere ? await baseQuery.where(fullWhere) : await baseQuery;

    const headers = [
      "License Key",
      "Product",
      "Plan",
      "Status",
      "Tenant Slug",
      "Tenant Name",
      "Max Activations",
      "Activation Count",
      "Is Perpetual",
      "Valid From",
      "Expires At",
      "Grace Period Days",
      "Notes",
      "Created At",
    ];

    const csvRows = rows.map((r) =>
      [
        r.licenseKey,
        r.product,
        r.planSlug,
        r.status,
        r.tenantSlug ?? "",
        r.tenantName ?? "",
        r.maxActivations,
        r.activationCount,
        r.isPerpetual ? "true" : "false",
        r.validFrom?.toISOString() ?? "",
        r.expiresAt?.toISOString() ?? "",
        r.gracePeriodDays,
        r.notes ?? "",
        r.createdAt.toISOString(),
      ].map(csvEscapeCell).join(","),
    );

    const csv = [headers.map(csvEscapeCell).join(","), ...csvRows].join("\n");
    const filename = `licenses-${new Date().toISOString().slice(0, 10)}.csv`;

    return c.text(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
  });

  app.get("/licenses", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const q = c.req.query();
    const status = q.status?.trim();
    const product = q.product?.trim();
    const planSlug = q.planSlug?.trim();
    const tenantId = q.tenantId?.trim();
    const primaryOnly =
      Boolean(tenantId)
      && (q.primary === "1" || q.primary === "true" || q.canonical === "1" || q.canonical === "true");
    const expiringInDays = q.expiringInDays ? Number(q.expiringInDays) : null;
    const search = q.search?.trim();
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20) || 20));
    const offset = (page - 1) * pageSize;

    if (primaryOnly) {
      const lic = await getActiveLicenseForTenant(db, tenantId!);
      if (!lic) {
        return c.json({ licenses: [], total: 0, page: 1, pageSize: 1 });
      }
      const [tenantRow] = await db
        .select({ name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantId!))
        .limit(1);
      return c.json({
        licenses: [
          {
            id: lic.id,
            licenseKey: lic.licenseKey,
            product: lic.product,
            planSlug: lic.planSlug,
            status: lic.status,
            tenantId: lic.tenantId,
            tenantName: tenantRow?.name ?? null,
            tenantSlug: tenantRow?.slug ?? null,
            isPerpetual: lic.isPerpetual,
            activatedAt: lic.activatedAt?.toISOString() ?? null,
            validFrom: lic.validFrom?.toISOString() ?? null,
            expiresAt: lic.expiresAt?.toISOString() ?? null,
            maxActivations: lic.maxActivations,
            activationCount: lic.activationCount,
            gracePeriodDays: lic.gracePeriodDays,
            revokedAt: lic.revokedAt?.toISOString() ?? null,
            revokeReason: lic.revokeReason ?? null,
            notes: lic.notes ?? null,
            createdAt: lic.createdAt.toISOString(),
            modules: parseLicenseModulesJson(lic.modules),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 1,
      });
    }

    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(licenses.status, status));
    if (product) conditions.push(eq(licenses.product, product));
    if (planSlug) conditions.push(eq(licenses.planSlug, planSlug));
    if (tenantId) conditions.push(eq(licenses.tenantId, tenantId));
    if (expiringInDays !== null && !Number.isNaN(expiringInDays) && expiringInDays > 0) {
      const until = new Date();
      until.setDate(until.getDate() + expiringInDays);
      conditions.push(eq(licenses.status, "active"));
      conditions.push(isNotNull(licenses.expiresAt));
      conditions.push(lte(licenses.expiresAt, until));
      conditions.push(gte(licenses.expiresAt, new Date()));
    }
    const whereClause =
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined;

    let searchClause: ReturnType<typeof or> | undefined;
    if (search) {
      const pat = `%${search}%`;
      searchClause = or(ilike(licenses.licenseKey, pat), ilike(tenants.name, pat));
    }

    const fullWhere =
      whereClause && searchClause
        ? and(whereClause, searchClause)
        : whereClause ?? searchClause;

    const countQuery = db
      .select({ c: count() })
      .from(licenses)
      .leftJoin(tenants, eq(tenants.id, licenses.tenantId));
    const dataQuery = db
      .select({
        license: licenses,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(licenses)
      .leftJoin(tenants, eq(tenants.id, licenses.tenantId))
      .orderBy(desc(licenses.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countResult, rows] = await Promise.all([
      fullWhere ? countQuery.where(fullWhere) : countQuery,
      fullWhere ? dataQuery.where(fullWhere) : dataQuery,
    ]);
    const total = Number(countResult[0]?.c ?? 0);

    const list = rows.map((r) => {
      const L = r.license;
      return {
        id: L.id,
        licenseKey: L.licenseKey,
        product: L.product,
        planSlug: L.planSlug,
        status: L.status,
        tenantId: L.tenantId,
        tenantName: r.tenantName ?? null,
        tenantSlug: r.tenantSlug ?? null,
        isPerpetual: L.isPerpetual,
        activatedAt: L.activatedAt?.toISOString() ?? null,
        validFrom: L.validFrom?.toISOString() ?? null,
        expiresAt: L.expiresAt?.toISOString() ?? null,
        maxActivations: L.maxActivations,
        activationCount: L.activationCount,
        gracePeriodDays: L.gracePeriodDays,
        revokedAt: L.revokedAt?.toISOString() ?? null,
        revokeReason: L.revokeReason ?? null,
        notes: L.notes ?? null,
        createdAt: L.createdAt.toISOString(),
        modules: parseLicenseModulesJson(L.modules),
      };
    });

    return c.json({ licenses: list, total, page, pageSize });
  });

  app.post("/licenses/activate", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const bodySchema = z.object({
      licenseKey: z.string(),
      hardwareFingerprint: z.string().min(8).max(256),
      machineName: z.string().max(120).optional(),
    });
    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const keyNorm = body.licenseKey.trim().toUpperCase();
    const fp = body.hardwareFingerprint.trim();

    const keyLimit = await consumeLicenseActivateKeyLimit(keyNorm);
    if (!keyLimit.ok) {
      if ("unavailable" in keyLimit) {
        return c.json(
          { success: false, error: "Rate limiting temporarily unavailable" },
          503,
        );
      }
      c.header("Retry-After", String(keyLimit.retryAfterSec));
      return c.json({ success: false, error: "invalid_license" }, 429);
    }

    const [bl] = await db
      .select({ id: blacklistedFingerprints.id })
      .from(blacklistedFingerprints)
      .where(eq(blacklistedFingerprints.hardwareFingerprint, fp))
      .limit(1);
    if (bl) return c.json({ error: "device_blacklisted" }, 403);

    const [lic] = await db.select().from(licenses).where(eq(licenses.licenseKey, keyNorm)).limit(1);
    if (!lic) return c.json({ success: false, error: "invalid_license" }, 400);
    if (lic.status === "revoked") return c.json({ error: "license_revoked" }, 403);
    if (lic.status === "expired") return c.json({ error: "license_expired" }, 403);
    if (lic.status !== "active") {
      return c.json(
        {
          error: "license_not_active",
          message: "This license is not active and cannot be used for activation.",
        },
        403,
      );
    }
    if (!lic.tenantId) {
      return c.json(
        {
          error: "license_not_assigned",
          message: "This license has not been assigned to an organization.",
        },
        403,
      );
    }
    const effectiveStart = lic.validFrom ?? lic.activatedAt;
    if (effectiveStart && effectiveStart > new Date()) {
      return c.json({ error: "license_not_yet_valid" }, 403);
    }
    if (!lic.isPerpetual && lic.expiresAt && lic.expiresAt < new Date()) {
      return c.json({ error: "license_expired" }, 403);
    }

    const [existing] = await db
      .select()
      .from(licenseActivations)
      .where(and(eq(licenseActivations.licenseId, lic.id), eq(licenseActivations.hardwareFingerprint, fp)))
      .limit(1);

    const ip = clientIp(c);

    if (existing) {
      if (existing.activationStatus === "blacklisted") {
        return c.json({ error: "device_blacklisted" }, 403);
      }
      if (existing.activationStatus === "active") {
        const { token, expiresAt } = await signOfflineToken(
          {
            licenseId: lic.id,
            licenseKey: lic.licenseKey,
            hardwareFingerprint: fp,
            tenantId: lic.tenantId,
            product: lic.product,
            planSlug: lic.planSlug,
            gracePeriodDays: lic.gracePeriodDays,
            licenseExpiresAt: lic.expiresAt?.toISOString() ?? null,
          },
          30,
        );
        await db
          .update(licenseActivations)
          .set({
            offlineToken: token,
            offlineTokenExpiresAt: expiresAt,
            machineName: body.machineName ?? existing.machineName,
            ipAddress: ip ?? existing.ipAddress,
          })
          .where(eq(licenseActivations.id, existing.id));
        return c.json({
          offlineToken: token,
          offlineTokenExpiresAt: expiresAt.toISOString(),
          license: {
            licenseKey: lic.licenseKey,
            product: lic.product,
            planSlug: lic.planSlug,
            gracePeriodDays: lic.gracePeriodDays,
            expiresAt: lic.expiresAt?.toISOString() ?? null,
            isPerpetual: lic.isPerpetual,
          },
        });
      }
      if (existing.activationStatus === "deactivated") {
        const [licNow] = await db.select().from(licenses).where(eq(licenses.id, lic.id)).limit(1);
        if (!licNow) return c.json({ error: "not_found" }, 404);
        if (licNow.activationCount >= licNow.maxActivations) {
          return c.json({ error: "max_activations_reached" }, 403);
        }
        await db
          .update(licenseActivations)
          .set({
            activationStatus: "active",
            deactivatedAt: null,
            deactivatedById: null,
            machineName: body.machineName ?? existing.machineName,
            ipAddress: ip ?? existing.ipAddress,
            activatedAt: new Date(),
          })
          .where(eq(licenseActivations.id, existing.id));
        await db
          .update(licenses)
          .set({
            activationCount: licNow.activationCount + 1,
            updatedAt: new Date(),
          })
          .where(eq(licenses.id, lic.id));
        const refreshed = { ...licNow, activationCount: licNow.activationCount + 1 };
        await insertLicenseHistory(db, {
          licenseId: lic.id,
          action: "activated",
          newValues: {
            hardwareFingerprint: fp,
            machineName: body.machineName ?? null,
            activationCount: refreshed.activationCount,
          },
          ipAddress: ip,
          userAgent: c.req.header("user-agent") ?? null,
        });
        const { token, expiresAt } = await signOfflineToken(
          {
            licenseId: refreshed.id,
            licenseKey: refreshed.licenseKey,
            hardwareFingerprint: fp,
            tenantId: refreshed.tenantId,
            product: refreshed.product,
            planSlug: refreshed.planSlug,
            gracePeriodDays: refreshed.gracePeriodDays,
            licenseExpiresAt: refreshed.expiresAt?.toISOString() ?? null,
          },
          30,
        );
        await db
          .update(licenseActivations)
          .set({ offlineToken: token, offlineTokenExpiresAt: expiresAt })
          .where(eq(licenseActivations.id, existing.id));
        return c.json({
          offlineToken: token,
          offlineTokenExpiresAt: expiresAt.toISOString(),
          license: {
            licenseKey: refreshed.licenseKey,
            product: refreshed.product,
            planSlug: refreshed.planSlug,
            gracePeriodDays: refreshed.gracePeriodDays,
            expiresAt: refreshed.expiresAt?.toISOString() ?? null,
            isPerpetual: refreshed.isPerpetual,
          },
        });
      }
    }

    if (lic.activationCount >= lic.maxActivations) {
      return c.json({ error: "max_activations_reached" }, 403);
    }

    const [act] = await db
      .insert(licenseActivations)
      .values({
        licenseId: lic.id,
        hardwareFingerprint: fp,
        machineName: body.machineName ?? null,
        ipAddress: ip,
        activationStatus: "active",
      })
      .returning({ id: licenseActivations.id });

    await db
      .update(licenses)
      .set({
        activationCount: lic.activationCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(licenses.id, lic.id));

    const nextCount = lic.activationCount + 1;
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      action: "activated",
      newValues: {
        hardwareFingerprint: fp,
        machineName: body.machineName ?? null,
        activationCount: nextCount,
      },
      ipAddress: ip,
      userAgent: c.req.header("user-agent") ?? null,
    });
    const { token, expiresAt } = await signOfflineToken(
      {
        licenseId: lic.id,
        licenseKey: lic.licenseKey,
        hardwareFingerprint: fp,
        tenantId: lic.tenantId,
        product: lic.product,
        planSlug: lic.planSlug,
        gracePeriodDays: lic.gracePeriodDays,
        licenseExpiresAt: lic.expiresAt?.toISOString() ?? null,
      },
      30,
    );
    await db
      .update(licenseActivations)
      .set({ offlineToken: token, offlineTokenExpiresAt: expiresAt })
      .where(eq(licenseActivations.id, act!.id));

    return c.json({
      offlineToken: token,
      offlineTokenExpiresAt: expiresAt.toISOString(),
      license: {
        licenseKey: lic.licenseKey,
        product: lic.product,
        planSlug: lic.planSlug,
        gracePeriodDays: lic.gracePeriodDays,
        expiresAt: lic.expiresAt?.toISOString() ?? null,
        isPerpetual: lic.isPerpetual,
      },
    });
  });

  app.post("/licenses/verify-offline", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const bodySchema = z.object({
      offlineToken: z.string(),
      hardwareFingerprint: z.string(),
    });
    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const keyLimit = await consumeLicenseActivateKeyLimit(body.offlineToken);
    if (!keyLimit.ok) {
      if ("unavailable" in keyLimit) {
        return c.json(
          { success: false, error: "Rate limiting temporarily unavailable" },
          503,
        );
      }
      c.header("Retry-After", String(keyLimit.retryAfterSec));
      return c.json({ success: false, error: "invalid_license" }, 429);
    }
    const payload = await verifyOfflineToken(body.offlineToken);
    if (!payload) return c.json({ error: "invalid_token" }, 401);
    if (payload.hardwareFingerprint !== body.hardwareFingerprint.trim()) {
      return c.json({ error: "fingerprint_mismatch" }, 401);
    }
    const [bl] = await db
      .select({ id: blacklistedFingerprints.id })
      .from(blacklistedFingerprints)
      .where(eq(blacklistedFingerprints.hardwareFingerprint, body.hardwareFingerprint.trim()))
      .limit(1);
    if (bl) return c.json({ error: "device_blacklisted" }, 403);

    const [lic] = await db
      .select()
      .from(licenses)
      .where(eq(licenses.id, payload.licenseId))
      .limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status === "revoked") return c.json({ error: "license_revoked" }, 403);
    if (lic.status === "expired") return c.json({ error: "license_expired" }, 403);
    if (lic.status !== "active") {
      return c.json(
        {
          error: "license_not_active",
          message: "This license is not active and cannot be used for activation.",
        },
        403,
      );
    }
    if (!lic.tenantId) {
      return c.json(
        {
          error: "license_not_assigned",
          message: "This license has not been assigned to an organization.",
        },
        403,
      );
    }
    const effectiveStart = lic.validFrom ?? lic.activatedAt;
    if (effectiveStart && effectiveStart > new Date()) {
      return c.json({ error: "license_not_yet_valid" }, 403);
    }
    if (!lic.isPerpetual && lic.expiresAt && lic.expiresAt < new Date()) {
      return c.json({ error: "license_expired" }, 403);
    }

    return c.json({ valid: true, license: payload });
  });

  app.get("/licenses/sync-audit/:tenantId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantIdParsed = z.string().uuid().safeParse(c.req.param("tenantId"));
    if (!tenantIdParsed.success) {
      return c.json({ error: "invalid_tenant_id" }, 400);
    }
    const tenantId = tenantIdParsed.data;

    const license = await getActiveLicenseForTenant(db, tenantId);
    if (!license) {
      return c.json({ error: "no_license", tenantId }, 404);
    }

    const planLimits = await getPlanLimits(db, license.planSlug);
    const isConsistent = await isLicenseLimitsConsistentWithPlan(db, license);

    return c.json({
      tenantId,
      license: {
        id: license.id,
        planSlug: license.planSlug,
        status: license.status,
        maxOrganizations: license.maxOrganizations,
        maxActivations: license.maxActivations,
        isPerpetual: license.isPerpetual,
        expiresAt: license.expiresAt?.toISOString() ?? null,
      },
      plan: {
        maxOrganizations: planLimits.maxOrganizations,
        maxActivations: planLimits.maxActivations,
      },
      isConsistentWithPlan: isConsistent,
      syncPayloadWouldSend: buildFinanceLicenseLimitFields(license),
    });
  });

  app.get("/licenses/:licenseId/history", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);

    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    const pageSize = Math.min(Math.max(1, Number(c.req.query("pageSize") ?? "50") || 50), 100);
    const offset = (page - 1) * pageSize;

    const [licenseRow] = await db
      .select({ id: licenses.id })
      .from(licenses)
      .where(eq(licenses.id, idParsed.data))
      .limit(1);
    if (!licenseRow) return c.json({ error: "not_found" }, 404);

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(licenseHistory)
        .where(eq(licenseHistory.licenseId, idParsed.data))
        .orderBy(desc(licenseHistory.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ c: count() })
        .from(licenseHistory)
        .where(eq(licenseHistory.licenseId, idParsed.data)),
    ]);

    const total = Number(countRow?.c ?? 0);
    return c.json({
      history: rows.map((h) => ({
        id: h.id,
        licenseId: h.licenseId,
        actorId: h.actorId,
        actorEmail: h.actorEmail,
        action: h.action,
        previousValues: parseLicenseHistoryJson(h.previousValues),
        newValues: parseLicenseHistoryJson(h.newValues),
        notes: h.notes,
        ipAddress: h.ipAddress,
        userAgent: h.userAgent,
        createdAt: h.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0,
      },
    });
  });

  app.get("/licenses/:licenseId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);

    const [row] = await db
      .select({
        lic: licenses,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(licenses)
      .leftJoin(tenants, eq(tenants.id, licenses.tenantId))
      .where(eq(licenses.id, idParsed.data))
      .limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);

    const [creator] = row.lic.createdById
      ? await db.select({ name: owners.name }).from(owners).where(eq(owners.id, row.lic.createdById)).limit(1)
      : [null];
    const [revoker] = row.lic.revokedById
      ? await db.select({ name: owners.name }).from(owners).where(eq(owners.id, row.lic.revokedById)).limit(1)
      : [null];

    const acts = await db
      .select()
      .from(licenseActivations)
      .where(eq(licenseActivations.licenseId, idParsed.data))
      .orderBy(desc(licenseActivations.activatedAt));

    const L = row.lic;
    return c.json({
      license: {
        id: L.id,
        licenseKey: L.licenseKey,
        product: L.product,
        planSlug: L.planSlug,
        status: L.status,
        tenantId: L.tenantId,
        tenantName: row.tenantName ?? null,
        tenantSlug: row.tenantSlug ?? null,
        isPerpetual: L.isPerpetual,
        activatedAt: L.activatedAt?.toISOString() ?? null,
        validFrom: L.validFrom?.toISOString() ?? null,
        expiresAt: L.expiresAt?.toISOString() ?? null,
        maxActivations: L.maxActivations,
        activationCount: L.activationCount,
        gracePeriodDays: L.gracePeriodDays,
        revokedAt: L.revokedAt?.toISOString() ?? null,
        revokeReason: L.revokeReason ?? null,
        notes: L.notes ?? null,
        createdAt: L.createdAt.toISOString(),
        modules: parseLicenseModulesJson(L.modules),
        createdByName: creator?.name ?? null,
        revokedByName: revoker?.name ?? null,
        activations: acts.map((a) => ({
          id: a.id,
          licenseId: a.licenseId,
          hardwareFingerprint: a.hardwareFingerprint,
          machineName: a.machineName,
          ipAddress: a.ipAddress,
          activationStatus: a.activationStatus,
          offlineTokenExpiresAt: a.offlineTokenExpiresAt?.toISOString() ?? null,
          deactivatedAt: a.deactivatedAt?.toISOString() ?? null,
          activatedAt: a.activatedAt.toISOString(),
        })),
      },
    });
  });

  const patchLicenseBody = z.object({ notes: z.string().max(2000).optional() }).strip();

  app.patch("/licenses/:licenseId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);
    let body: z.infer<typeof patchLicenseBody>;
    try {
      body = patchLicenseBody.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    if (Object.keys(body).length === 0) return c.json({ error: "no_fields_to_update" }, 400);
    const [previous] = await db
      .select({ notes: licenses.notes })
      .from(licenses)
      .where(eq(licenses.id, idParsed.data))
      .limit(1);
    if (!previous) return c.json({ error: "not_found" }, 404);
    const [updated] = await db
      .update(licenses)
      .set({ notes: body.notes ?? null, updatedAt: new Date() })
      .where(eq(licenses.id, idParsed.data))
      .returning();
    if (!updated) return c.json({ error: "not_found" }, 404);
    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: idParsed.data,
      ...historyActor,
      action: "notes_updated",
      previousValues: { notes: previous.notes },
      newValues: { notes: updated.notes },
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ ok: true, license: { id: updated.id, notes: updated.notes } });
  });

  const extendBody = z
    .object({
      expiresAt: z.string().datetime().optional(),
      isPerpetual: z.boolean().optional(),
    })
    .strict();

  app.post("/licenses/:licenseId/extend", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);
    let body: z.infer<typeof extendBody>;
    try {
      body = extendBody.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    if (body.expiresAt === undefined && body.isPerpetual === undefined) {
      return c.json({ error: "no_fields_to_update" }, 400);
    }
    const [lic] = await db.select().from(licenses).where(eq(licenses.id, idParsed.data)).limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status === "revoked") {
      return c.json({ error: "cannot_extend_revoked" }, 409);
    }
    const now = new Date();
    const setVals: {
      updatedAt: Date;
      expiresAt?: Date | null;
      isPerpetual?: boolean;
      status?: string;
    } = { updatedAt: now };
    if (body.isPerpetual === true) {
      setVals.isPerpetual = true;
      setVals.expiresAt = null;
      if (lic.status === "expired") setVals.status = "active";
    } else if (body.expiresAt !== undefined) {
      setVals.expiresAt = new Date(body.expiresAt);
      setVals.isPerpetual = body.isPerpetual ?? false;
      if (lic.status === "expired") setVals.status = "active";
    } else if (body.isPerpetual === false) {
      setVals.isPerpetual = false;
    }
    const [updated] = await db.update(licenses).set(setVals).where(eq(licenses.id, lic.id)).returning();
    if (!updated) return c.json({ error: "not_found" }, 404);
    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      ...historyActor,
      action: "extended",
      previousValues: {
        expiresAt: lic.expiresAt?.toISOString() ?? null,
        isPerpetual: lic.isPerpetual,
        status: lic.status,
      },
      newValues: {
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        isPerpetual: updated.isPerpetual,
        status: updated.status,
      },
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    await logAudit(db, {
      actorId: c.get("actorId") as string,
      action: "license.extended",
      targetTenantId: lic.tenantId ?? undefined,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: {
        licenseId: lic.id,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        isPerpetual: updated.isPerpetual,
      },
    });
    void triggerFinanceLicenseSync(db, lic.tenantId).catch((err) => {
      console.error(
        "[license] finance sync failed (non-fatal)",
        err instanceof Error ? err.message : String(err),
      );
    });

    if (lic.tenantId) {
      void syncPosOrgLicenseFromLicense(db, lic.tenantId, updated).catch((err) => {
        console.error(
          "[license] POS license window sync failed (non-fatal)",
          err instanceof Error ? err.message : String(err),
        );
      });
      void reactivatePosOrgForLicense(db, lic.tenantId).catch((err) => {
        console.error(
          "[license] POS reactivate failed (non-fatal)",
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    return c.json({
      license: {
        id: updated.id,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        isPerpetual: updated.isPerpetual,
      },
    });
  });

  const assignBody = z.object({
    tenantId: z.string().uuid(),
    validFrom: z.string().datetime().optional(),
  });

  app.post("/licenses/:licenseId/assign", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);
    let body: z.infer<typeof assignBody>;
    try {
      body = assignBody.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const [lic] = await db.select().from(licenses).where(eq(licenses.id, idParsed.data)).limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status !== "unassigned") {
      return c.json({ error: "license_already_assigned", message: "This license is already assigned." }, 409);
    }
    const [t] = await db
      .select({ id: tenants.id, modules: tenants.modules })
      .from(tenants)
      .where(eq(tenants.id, body.tenantId))
      .limit(1);
    if (!t) return c.json({ error: "tenant_not_found" }, 404);
    const licenseModules = parseLicenseModulesJson(lic.modules);
    const moduleCheck = validateLicenseModulesForTenant(t.modules, licenseModules);
    if (!moduleCheck.ok) {
      return c.json({ error: "modules_exceed_tenant", message: moduleCheck.message }, 400);
    }
    if (await tenantHasActiveLicense(db, body.tenantId)) {
      return c.json(
        {
          error: "tenant_already_licensed",
          message: "This tenant already has an active license. Revoke or expire it before assigning another.",
        },
        409,
      );
    }

    const assignAt = new Date();
    const startAt = body.validFrom ? new Date(body.validFrom) : (lic.validFrom ?? assignAt);
    const planLimits = await getPlanLimits(db, lic.planSlug);
    const assignSet: {
      tenantId: string;
      status: string;
      activatedAt: Date;
      validFrom: Date;
      updatedAt: Date;
      maxOrganizations?: number;
      maxActivations?: number;
      maxUsers?: number;
    } = {
      tenantId: body.tenantId,
      status: "active",
      activatedAt: assignAt,
      validFrom: startAt,
      updatedAt: assignAt,
    };
    if (lic.maxOrganizations === 1) {
      assignSet.maxOrganizations = planLimits.maxOrganizations;
    }
    if (lic.maxActivations === 1) {
      assignSet.maxActivations = planLimits.maxActivations;
    }
    assignSet.maxUsers = lic.maxUsers ?? planLimits.maxUsers;
    const [upd] = await db
      .update(licenses)
      .set(assignSet)
      .where(eq(licenses.id, lic.id))
      .returning();
    if (!upd) return c.json({ error: "assign_failed" }, 500);
    await db.update(tenants).set({ planSlug: lic.planSlug }).where(eq(tenants.id, body.tenantId));

    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      ...historyActor,
      action: "assigned",
      previousValues: {
        status: lic.status,
        tenantId: lic.tenantId,
        maxOrganizations: lic.maxOrganizations,
        maxActivations: lic.maxActivations,
      },
      newValues: {
        status: upd.status,
        tenantId: upd.tenantId,
        maxOrganizations: upd.maxOrganizations,
        maxActivations: upd.maxActivations,
      },
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });

    await logAudit(db, {
      actorId: c.get("actorId") as string,
      action: "license.assigned",
      targetTenantId: body.tenantId,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { licenseId: lic.id },
    });

    void triggerFinanceLicenseSync(db, body.tenantId).catch((err) => {
      console.error(
        "[license] finance sync failed (non-fatal)",
        err instanceof Error ? err.message : String(err),
      );
    });

    void syncPosOrgLicenseFromLicense(db, body.tenantId, upd).catch((err) => {
      console.error(
        "[license] POS license window sync failed (non-fatal)",
        err instanceof Error ? err.message : String(err),
      );
    });

    void sendLicenseActivatedEmailForTenant(db, body.tenantId, { licenseId: upd.id }).catch(
      (err) => {
        console.error(
          "[license] activated email failed (non-fatal)",
          err instanceof Error ? err.message : String(err),
        );
      },
    );

    return c.json({
      license: upd
        ? {
            id: upd.id,
            licenseKey: upd.licenseKey,
            product: upd.product,
            planSlug: upd.planSlug,
            status: upd.status,
            tenantId: upd.tenantId,
          }
        : null,
    });
  });

  const revokeBody = z.object({ reason: z.string().optional() });

  app.post("/licenses/:licenseId/revoke", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);
    let body: z.infer<typeof revokeBody>;
    try {
      body = revokeBody.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const [lic] = await db.select().from(licenses).where(eq(licenses.id, idParsed.data)).limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status === "revoked") return c.json({ error: "already_revoked" }, 409);
    const actorId = c.get("actorId") as string;
    const now = new Date();

    const [activeN] = await db
      .select({ c: count() })
      .from(licenseActivations)
      .where(
        and(eq(licenseActivations.licenseId, lic.id), eq(licenseActivations.activationStatus, "active")),
      );
    const toDrop = Number(activeN?.c ?? 0);
    const nextActivationCount = Math.max(0, lic.activationCount - toDrop);

    await db
      .update(licenses)
      .set({
        status: "revoked",
        revokedAt: now,
        revokedById: actorId,
        revokeReason: body.reason ?? null,
        updatedAt: now,
        activationCount: nextActivationCount,
      })
      .where(eq(licenses.id, lic.id));
    await db
      .update(licenseActivations)
      .set({
        activationStatus: "deactivated",
        deactivatedAt: now,
      })
      .where(
        and(eq(licenseActivations.licenseId, lic.id), eq(licenseActivations.activationStatus, "active")),
      );

    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      actorId,
      actorEmail: historyActor.actorEmail,
      action: "revoked",
      previousValues: { status: lic.status },
      newValues: { status: "revoked", activationCount: nextActivationCount },
      notes: body.reason ?? null,
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });

    await logAudit(db, {
      actorId,
      action: "license.revoked",
      targetTenantId: lic.tenantId ?? undefined,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { reason: body.reason ?? null, licenseId: lic.id },
    });

    void triggerFinanceLicenseSync(db, lic.tenantId).catch((err) => {
      console.error(
        "[license] finance sync failed (non-fatal)",
        err instanceof Error ? err.message : String(err),
      );
    });

    if (lic.tenantId) {
      void import("../notification-helpers.js").then(({ notifyLicenseForTenant }) => {
        notifyLicenseForTenant(db, {
          tenantId: lic.tenantId!,
          licenseId: lic.id,
          type: "license.revoked",
          body: body.reason?.trim() || "License has been revoked.",
        });
      });
      void syncPosOrgLicenseWindow(db, lic.tenantId, { endsAt: now }).catch((err) => {
        console.error(
          "[license] POS license end sync failed (non-fatal)",
          err instanceof Error ? err.message : String(err),
        );
      });
      void suspendPosOrgForLicense(db, lic.tenantId, body.reason ?? "license_revoked").catch(
        (err) => {
          console.error(
            "[license] POS suspend failed (non-fatal)",
            err instanceof Error ? err.message : String(err),
          );
        },
      );
    }

    return c.json({ revoked: true });
  });

  const suspendBody = z.object({ reason: z.string().max(500).optional() });

  app.post("/licenses/:licenseId/suspend", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);
    let body: z.infer<typeof suspendBody>;
    try {
      body = suspendBody.parse(await c.req.json().catch(() => ({})));
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const [lic] = await db.select().from(licenses).where(eq(licenses.id, idParsed.data)).limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status === "revoked") return c.json({ error: "cannot_suspend_revoked" }, 409);
    if (lic.status === "suspended") return c.json({ error: "already_suspended" }, 409);
    const now = new Date();
    await db
      .update(licenses)
      .set({ status: "suspended", updatedAt: now })
      .where(eq(licenses.id, lic.id));
    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      ...historyActor,
      action: "suspended",
      previousValues: { status: lic.status },
      newValues: { status: "suspended", reason: body.reason ?? null },
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    let financeSync: "ok" | "failed" | "skipped" = lic.tenantId ? "ok" : "skipped";
    let posSync: "ok" | "failed" | "skipped" = lic.tenantId ? "ok" : "skipped";
    const syncErrors: string[] = [];
    if (lic.tenantId) {
      try {
        await triggerFinanceLicenseSync(db, lic.tenantId);
      } catch (err) {
        financeSync = "failed";
        syncErrors.push(
          `finance: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const posResult = await suspendPosOrgForLicense(
        db,
        lic.tenantId,
        body.reason ?? "license_suspended",
      );
      posSync = posSyncResultToStatus(posResult, true);
      if (!posResult.ok) {
        syncErrors.push(`pos: ${posResult.error}`);
      }
      void import("../notification-helpers.js").then(({ notifyLicenseForTenant }) => {
        notifyLicenseForTenant(db, {
          tenantId: lic.tenantId!,
          licenseId: lic.id,
          type: "license.suspended",
          body: body.reason?.trim() || "License has been suspended.",
        });
      });
    }
    const strict = licenseConfig.syncStrict;
    if (strict && syncErrors.length > 0) {
      return c.json(
        { error: "license_sync_failed", financeSync, posSync, errors: syncErrors },
        502,
      );
    }
    return c.json({
      suspended: true,
      financeSync,
      posSync,
      ...(syncErrors.length ? { errors: syncErrors } : {}),
    });
  });

  app.post("/licenses/:licenseId/reactivate", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const idParsed = z.string().uuid().safeParse(c.req.param("licenseId"));
    if (!idParsed.success) return c.json({ error: "invalid_license_id" }, 400);
    const [lic] = await db.select().from(licenses).where(eq(licenses.id, idParsed.data)).limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status !== "suspended" && lic.status !== "expired") {
      return c.json({ error: "cannot_reactivate", message: "License is not suspended or expired" }, 409);
    }
    const now = new Date();
    const setVals: { status: string; updatedAt: Date } = {
      status: "active",
      updatedAt: now,
    };
    const [updated] = await db.update(licenses).set(setVals).where(eq(licenses.id, lic.id)).returning();
    if (!updated) return c.json({ error: "not_found" }, 404);
    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      ...historyActor,
      action: "reactivated",
      previousValues: { status: lic.status },
      newValues: { status: "active" },
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    void triggerFinanceLicenseSync(db, lic.tenantId).catch(() => undefined);
    if (lic.tenantId) {
      void syncPosOrgLicenseFromLicense(db, lic.tenantId, updated).catch(() => undefined);
      void reactivatePosOrgForLicense(db, lic.tenantId).catch(() => undefined);
    }
    return c.json({ reactivated: true });
  });

  app.post("/licenses/:licenseId/activations/:activationId/deactivate", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const licId = z.string().uuid().safeParse(c.req.param("licenseId"));
    const actId = z.string().uuid().safeParse(c.req.param("activationId"));
    if (!licId.success || !actId.success) return c.json({ error: "invalid_id" }, 400);
    const [act] = await db
      .select()
      .from(licenseActivations)
      .where(
        and(eq(licenseActivations.id, actId.data), eq(licenseActivations.licenseId, licId.data)),
      )
      .limit(1);
    if (!act) return c.json({ error: "not_found" }, 404);
    const actorId = c.get("actorId") as string;
    const now = new Date();
    await db
      .update(licenseActivations)
      .set({
        activationStatus: "deactivated",
        deactivatedAt: now,
        deactivatedById: actorId,
      })
      .where(eq(licenseActivations.id, act.id));
    const [licSnap] = await db
      .select({ n: licenses.activationCount })
      .from(licenses)
      .where(eq(licenses.id, licId.data))
      .limit(1);
    const nextCount = Math.max(0, (licSnap?.n ?? 0) - 1);
    await db
      .update(licenses)
      .set({
        activationCount: nextCount,
        updatedAt: now,
      })
      .where(eq(licenses.id, licId.data));

    const historyActor = await resolveLicenseHistoryActor(db, c);
    await insertLicenseHistory(db, {
      licenseId: licId.data,
      ...historyActor,
      action: "deactivated",
      newValues: {
        activationId: act.id,
        hardwareFingerprint: act.hardwareFingerprint,
        activationCount: nextCount,
      },
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });

    await logAudit(db, {
      actorId,
      action: "license.activation_deactivated",
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { licenseId: licId.data, activationId: actId.data },
    });

    return c.json({ deactivated: true });
  });

  const blacklistBody = z.object({
    hardwareFingerprint: z.string(),
    reason: z.string().optional(),
  });

  app.post("/fingerprints/blacklist", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    let body: z.infer<typeof blacklistBody>;
    try {
      body = blacklistBody.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const fp = body.hardwareFingerprint.trim();
    const actorId = c.get("actorId") as string;

    await db
      .insert(blacklistedFingerprints)
      .values({
        hardwareFingerprint: fp,
        reason: body.reason ?? null,
        blacklistedById: actorId,
      })
      .onConflictDoNothing({ target: blacklistedFingerprints.hardwareFingerprint });

    const deactivated = await db
      .update(licenseActivations)
      .set({ activationStatus: "blacklisted" })
      .where(
        and(
          eq(licenseActivations.hardwareFingerprint, fp),
          ne(licenseActivations.activationStatus, "blacklisted"),
        ),
      )
      .returning({ id: licenseActivations.id });

    await logAudit(db, {
      actorId,
      action: "fingerprint.blacklisted",
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { deactivatedCount: deactivated.length, fingerprint: fp },
    });

    return c.json({ blacklisted: true, deactivatedCount: deactivated.length });
  });
}
