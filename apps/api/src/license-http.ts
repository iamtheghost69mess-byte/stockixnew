import { apiConfig } from "@repo/config";
import {
  blacklistedFingerprints,
  licenseActivations,
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
import { logAudit } from "./audit.js";
import { generateLicenseKey, signOfflineToken, verifyOfflineToken } from "./license-utils.js";

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

type Db = PostgresJsDatabase<typeof schema>;

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? null;
}

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
      plans: rows.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        maxOrganizations: p.maxOrganizations,
        maxActivations: p.maxActivations,
        isActive: p.isActive,
        sortOrder: p.sortOrder,
        activeLicenseCount: activeBySlug.get(p.slug) ?? 0,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
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
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
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
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
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
    return c.json({ plan: created }, 201);
  });

  const patchPlanBody = z
    .object({
      name: z.string().min(2).max(100).optional(),
      description: z.union([z.string().max(500), z.null()]).optional(),
      maxOrganizations: z.number().int().min(-1).max(9999).optional(),
      maxActivations: z.number().int().min(1).max(9999).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
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
      isActive?: boolean;
      sortOrder?: number;
    } = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) setVals.name = parsed.data.name;
    if (parsed.data.description !== undefined) setVals.description = parsed.data.description;
    if (parsed.data.maxOrganizations !== undefined) setVals.maxOrganizations = parsed.data.maxOrganizations;
    if (parsed.data.maxActivations !== undefined) setVals.maxActivations = parsed.data.maxActivations;
    if (parsed.data.isActive !== undefined) setVals.isActive = parsed.data.isActive;
    if (parsed.data.sortOrder !== undefined) setVals.sortOrder = parsed.data.sortOrder;
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
    return c.json({ plan: updated });
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

  const generateBody = z.object({
    product: z.enum(["platform", "pos_desktop", "bundle"]),
    planSlug: z.string().min(1),
    count: z.number().int().min(1).max(100).default(1),
    isPerpetual: z.boolean().default(true),
    expiresAt: z.string().datetime().optional(),
    validFrom: z.string().datetime().optional(),
    maxActivations: z.number().int().min(1).max(50).default(1),
    gracePeriodDays: z.number().int().min(0).max(365).default(7),
    notes: z.string().max(500).optional(),
    tenantId: z.string().uuid().optional(),
  });

  app.post("/licenses/generate", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    let body: z.infer<typeof generateBody>;
    try {
      body = generateBody.parse(await c.req.json());
    } catch (e) {
      return c.json({ error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) }, 400);
    }
    const [planRow] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.slug, body.planSlug), eq(plans.isActive, true)))
      .limit(1);
    if (!planRow) {
      return c.json({ error: "invalid_plan", message: `Plan not found: ${body.planSlug}` }, 400);
    }
    if (body.tenantId) {
      const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, body.tenantId)).limit(1);
      if (!t) return c.json({ error: "tenant_not_found" }, 404);
    }
    const actorId = c.get("actorId") as string;
    const expiresAtDate = body.expiresAt ? new Date(body.expiresAt) : null;
    const validFromDate = body.validFrom ? new Date(body.validFrom) : null;
    const now = new Date();

    const created = await db.transaction(async (tx) => {
      const out: { id: string; licenseKey: string; product: string; planSlug: string; status: string }[] = [];
      for (let i = 0; i < body.count; i++) {
        let licenseKey = generateLicenseKey();
        for (let attempt = 0; attempt < 3; attempt++) {
          const clash = await tx
            .select({ id: licenses.id })
            .from(licenses)
            .where(eq(licenses.licenseKey, licenseKey))
            .limit(1);
          if (clash.length === 0) break;
          licenseKey = generateLicenseKey();
        }
        const status = body.tenantId ? "active" : "unassigned";
        const assignNow = Boolean(body.tenantId);
        const effectiveStart = assignNow ? (validFromDate ?? now) : validFromDate;
        const [row] = await tx
          .insert(licenses)
          .values({
            licenseKey,
            product: body.product,
            planSlug: body.planSlug,
            tenantId: body.tenantId ?? null,
            status,
            activatedAt: assignNow ? effectiveStart : null,
            validFrom: effectiveStart ?? null,
            expiresAt: body.isPerpetual ? null : expiresAtDate,
            isPerpetual: body.isPerpetual,
            maxActivations: body.maxActivations,
            activationCount: 0,
            gracePeriodDays: body.gracePeriodDays,
            notes: body.notes ?? null,
            createdById: actorId,
          })
          .returning({
            id: licenses.id,
            licenseKey: licenses.licenseKey,
            product: licenses.product,
            planSlug: licenses.planSlug,
            status: licenses.status,
          });
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
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { count: created.length, product: body.product, planSlug: body.planSlug },
    });

    return c.json({ licenses: created }, 201);
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

  app.get("/licenses", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const q = c.req.query();
    const status = q.status?.trim();
    const product = q.product?.trim();
    const planSlug = q.planSlug?.trim();
    const tenantId = q.tenantId?.trim();
    const expiringInDays = q.expiringInDays ? Number(q.expiringInDays) : null;
    const search = q.search?.trim();
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20) || 20));
    const offset = (page - 1) * pageSize;

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

    const [bl] = await db
      .select({ id: blacklistedFingerprints.id })
      .from(blacklistedFingerprints)
      .where(eq(blacklistedFingerprints.hardwareFingerprint, fp))
      .limit(1);
    if (bl) return c.json({ error: "device_blacklisted" }, 403);

    const [lic] = await db.select().from(licenses).where(eq(licenses.licenseKey, keyNorm)).limit(1);
    if (!lic) return c.json({ error: "not_found" }, 404);
    if (lic.status === "revoked") return c.json({ error: "license_revoked" }, 403);
    if (lic.status === "expired") return c.json({ error: "license_expired" }, 403);
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
    return c.json({ valid: true, license: payload });
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
    const [updated] = await db
      .update(licenses)
      .set({ notes: body.notes ?? null, updatedAt: new Date() })
      .where(eq(licenses.id, idParsed.data))
      .returning();
    if (!updated) return c.json({ error: "not_found" }, 404);
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
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, body.tenantId)).limit(1);
    if (!t) return c.json({ error: "tenant_not_found" }, 404);

    const assignAt = new Date();
    const startAt = body.validFrom ? new Date(body.validFrom) : (lic.validFrom ?? assignAt);
    const [upd] = await db
      .update(licenses)
      .set({
        tenantId: body.tenantId,
        status: "active",
        activatedAt: assignAt,
        validFrom: startAt,
        updatedAt: assignAt,
      })
      .where(eq(licenses.id, lic.id))
      .returning();
    await db.update(tenants).set({ planSlug: lic.planSlug }).where(eq(tenants.id, body.tenantId));

    await logAudit(db, {
      actorId: c.get("actorId") as string,
      action: "license.assigned",
      targetTenantId: body.tenantId,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { licenseId: lic.id },
    });

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

    await logAudit(db, {
      actorId,
      action: "license.revoked",
      targetTenantId: lic.tenantId ?? undefined,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { reason: body.reason ?? null, licenseId: lic.id },
    });

    return c.json({ revoked: true });
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
