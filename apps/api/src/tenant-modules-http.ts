import { licenses, tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as schema from "@repo/db/schema";
import type { StockixModule } from "@repo/auth";
import { logAudit } from "./audit.js";
import { createProvisionTracer } from "./provision-trace.js";
import { insertTenantJob } from "./services/tenant-jobs.js";
import {
  parseTenantModules,
  serializeTenantModules,
} from "./services/auth/stockix-product-token.js";
import { getActiveLicenseForTenant } from "./license-utils.js";
import { syncFinanceLicenseForStockixTenant } from "./finance-license.client.js";

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

type Db = PostgresJsDatabase<typeof schema>;

const stockixTenantIdParam = z.string().uuid();

const addableModuleSchema = z.enum(["pos", "pms", "chat", "accounting"]);
const removableModuleSchema = z.enum(["pos", "pms", "chat", "accounting"]);

const moduleBodySchema = z.object({
  module: addableModuleSchema,
});

const removeModuleBodySchema = z.object({
  module: removableModuleSchema,
});

async function updateTenantAndLicenseModules(
  db: Db,
  tenantId: string,
  modules: StockixModule[],
): Promise<void> {
  const serialized = serializeTenantModules(modules);
  await db.update(tenants).set({ modules: serialized }).where(eq(tenants.id, tenantId));

  const license = await getActiveLicenseForTenant(db, tenantId);
  if (license) {
    await db
      .update(licenses)
      .set({ modules: serialized, updatedAt: new Date() })
      .where(eq(licenses.id, license.id));
  }
}

export function registerTenantModulesRoutes(app: Hono<ApiEnv>, db: Db | null): void {
  app.post("/tenants/:tenantId/add-module", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorRole = String(c.get("actorRole") ?? "");
    if (actorRole !== "super_admin") {
      return c.json({ error: "forbidden", message: "super_admin required" }, 403);
    }

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const bodyParsed = moduleBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!bodyParsed.success) {
      return c.json({ error: "invalid_body", details: bodyParsed.error.flatten() }, 400);
    }

    const moduleToAdd = bodyParsed.data.module;

    const [row] = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        adminEmail: tenants.adminEmail,
        planSlug: tenants.planSlug,
        modules: tenants.modules,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantParsed.data))
      .limit(1);

    if (!row) return c.json({ error: "tenant_not_found" }, 404);

    const currentModules = parseTenantModules(row.modules);
    if (currentModules.includes(moduleToAdd)) {
      return c.json(
        { error: "module_already_present", message: `Module "${moduleToAdd}" is already licensed` },
        400,
      );
    }

    const nextModuleList: StockixModule[] = [...currentModules, moduleToAdd];
    await db
      .update(tenants)
      .set({ status: "provisioning" })
      .where(eq(tenants.id, row.id));
    await updateTenantAndLicenseModules(db, row.id, nextModuleList);

    const correlationId = randomUUID();
    const log = (m: string) => {
      console.log(JSON.stringify({ level: "info", correlationId, message: m }));
    };
    const acceptTrace = createProvisionTracer(db, correlationId, () => ({ slug: row.slug }), log);
    await acceptTrace.event("api", `HTTP 202 — add module ${moduleToAdd} accepted`);

    const job = await insertTenantJob(db, {
      type: "add_module",
      tenantId: row.id,
      correlationId,
      payload: {
        tenantId: row.id,
        slug: row.slug,
        name: row.name,
        adminEmail: row.adminEmail,
        planSlug: row.planSlug,
        module: moduleToAdd,
      },
    });

    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "tenant.module_added",
      targetTenantId: row.id,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: { module: moduleToAdd, jobId: job?.id ?? null },
    });

    return c.json(
      {
        accepted: true,
        tenantId: row.id,
        module: moduleToAdd,
        modules: nextModuleList,
        jobId: job?.id ?? null,
        correlationId,
      },
      202,
    );
  });

  app.post("/tenants/:tenantId/remove-module", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorRole = String(c.get("actorRole") ?? "");
    if (actorRole !== "super_admin") {
      return c.json({ error: "forbidden", message: "super_admin required" }, 403);
    }

    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const bodyParsed = removeModuleBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!bodyParsed.success) {
      return c.json({ error: "invalid_body", details: bodyParsed.error.flatten() }, 400);
    }

    const moduleToRemove = bodyParsed.data.module;

    const [row] = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        modules: tenants.modules,
        financeTenantId: tenantDeployments.financeTenantId,
      })
      .from(tenants)
      .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
      .where(eq(tenants.id, tenantParsed.data))
      .limit(1);

    if (!row) return c.json({ error: "tenant_not_found" }, 404);

    const currentModules = parseTenantModules(row.modules);
    if (!currentModules.includes(moduleToRemove)) {
      return c.json(
        { error: "module_not_present", message: `Module "${moduleToRemove}" is not licensed` },
        400,
      );
    }

    const remaining = currentModules.filter((m) => m !== moduleToRemove);
    if (remaining.length === 0) {
      return c.json(
        { error: "cannot_remove_last_module", message: "At least one module must remain" },
        400,
      );
    }

    await updateTenantAndLicenseModules(db, row.id, remaining);

    if (moduleToRemove === "pos") {
      await db
        .update(tenantDeployments)
        .set({ posUrl: null, posOrganizationId: null, updatedAt: new Date() })
        .where(eq(tenantDeployments.tenantId, row.id));
    }
    if (moduleToRemove === "accounting") {
      await db
        .update(tenantDeployments)
        .set({
          financeTenantId: null,
          financeDefaultWarehouseId: null,
          financeWalkInCustomerId: null,
          financeCashAccountId: null,
          financeCardAccountId: null,
          updatedAt: new Date(),
        })
        .where(eq(tenantDeployments.tenantId, row.id));
    }

    const correlationId = randomUUID();
    const job = await insertTenantJob(db, {
      type: "remove_module",
      tenantId: row.id,
      correlationId,
      payload: {
        slug: row.slug,
        module: moduleToRemove,
      },
    });

    if (row.financeTenantId && row.financeTenantId > 0 && moduleToRemove !== "accounting") {
      void syncFinanceLicenseForStockixTenant(db, {
        stockixTenantId: row.id,
        financeTenantId: row.financeTenantId,
      }).catch((err) => {
        console.error(
          "[remove-module] finance license sync failed",
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    await logAudit(db, {
      actorId: (c.get("actorId") as string | undefined) ?? "",
      action: "tenant.module_removed",
      targetTenantId: row.id,
      ipAddress: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      metadata: {
        module: moduleToRemove,
        jobId: job?.id ?? null,
        dataRetained: true,
      },
    });

    return c.json({
      ok: true,
      tenantId: row.id,
      module: moduleToRemove,
      modules: remaining,
      warning: "Module removed from license. Stack stopped; data volumes were not destroyed.",
      jobId: job?.id ?? null,
      correlationId,
    });
  });
}
