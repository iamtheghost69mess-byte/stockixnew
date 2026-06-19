import { Hono } from "hono";
import { and, asc, count, desc, eq, ilike, inArray, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import type { createDb } from "@repo/db";
import { tenants, tenantDeployments, organizations } from "@repo/db/schema";
import type { ControlPlaneAuthEnv } from "../../middleware/auth.js";
import { getScopedTenantIdsForOwner } from "../../org-access-scope.js";
import { TenantRepository } from "../../repositories/tenant-repository.js";

type Db = NonNullable<ReturnType<typeof createDb>>;

export function registerTenantListRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db): void {
  app.get("/tenants", async (c) => {
    const actorId = String(c.get("actorId") ?? "");
    const actorRole = String(c.get("actorRole") ?? "");
    const actorPermissions = (c.get("actorPermissions") as string[] | undefined) ?? [];

    const rawPage = c.req.query("page");
    const rawPageSize = c.req.query("pageSize");
    const search = c.req.query("search")?.trim() ?? "";
    const statusFilter = c.req.query("status")?.trim() ?? "";
    const sortRaw = c.req.query("sort")?.trim() ?? "newest";

    const page = Math.max(1, Number(rawPage ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(rawPageSize ?? 20) || 20));
    const offset = (page - 1) * pageSize;

    const childOrgFilter = notExists(
      db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.slug, tenants.slug), ne(organizations.tenantId, tenants.id))),
    );

    const conditions: SQL[] = [childOrgFilter];

    const scopedTenantIds = await getScopedTenantIdsForOwner(
      db,
      actorId,
      actorPermissions,
      actorRole,
    );
    if (scopedTenantIds !== null) {
      if (scopedTenantIds.length === 0) {
        return c.json({
          tenants: [],
          page,
          pageSize,
          total: 0,
          totalPages: 1,
          directoryTotals: {
            all: 0,
            active: 0,
            suspended: 0,
            provisioning: 0,
            failed: 0,
            partial: 0,
          },
        });
      }
      conditions.push(inArray(tenants.id, scopedTenantIds));
    }

    if (search) {
      const pat = `%${search}%`;
      conditions.push(
        or(
          ilike(tenants.name, pat),
          ilike(tenants.slug, pat),
          ilike(tenants.adminEmail, pat),
        )!,
      );
    }

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "provisioning") {
        conditions.push(
          or(eq(tenantDeployments.status, "provisioning"), eq(tenantDeployments.status, "pending"))!,
        );
      } else if (statusFilter === "partial") {
        conditions.push(eq(tenants.status, "partial"));
      } else if (statusFilter === "failed") {
        conditions.push(
          or(eq(tenantDeployments.status, "failed"), eq(tenants.status, "failed"))!,
        );
      } else {
        conditions.push(eq(tenantDeployments.status, statusFilter));
      }
    }

    const fullWhere = conditions.length === 1 ? conditions[0] : and(...conditions);

    const orderClause =
      sortRaw === "oldest"
        ? asc(tenants.createdAt)
        : sortRaw === "name_asc"
          ? asc(tenants.name)
          : sortRaw === "name_desc"
            ? desc(tenants.name)
            : desc(tenants.createdAt);

    const joinDeployments = eq(tenantDeployments.tenantId, tenants.id);

    const [countRow] = await db
      .select({ c: count() })
      .from(tenants)
      .leftJoin(tenantDeployments, joinDeployments)
      .where(fullWhere);

    const data = await db
      .select({
        tenantId: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        adminEmail: tenants.adminEmail,
        planSlug: tenants.planSlug,
        modules: tenants.modules,
        tenantStatus: tenants.status,
        deploymentStatus: tenantDeployments.status,
        internalPort: tenantDeployments.internalPort,
        composeProject: tenantDeployments.composeProjectName,
        lastError: tenantDeployments.lastError,
        registrationCompletedAt: tenantDeployments.registrationCompletedAt,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .leftJoin(tenantDeployments, joinDeployments)
      .where(fullWhere)
      .orderBy(orderClause)
      .limit(pageSize)
      .offset(offset);

    const total = Number(countRow?.c ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    return c.json({
      tenants: data,
      page,
      pageSize,
      total,
      totalPages,
      directoryTotals: {
        all: total,
        active: total,
        suspended: 0,
        provisioning: 0,
        failed: 0,
        partial: 0,
      },
    });
  });

  app.get("/tenants/export.csv", async (c) => {
    const actorId = String(c.get("actorId") ?? "");
    const actorRole = String(c.get("actorRole") ?? "");
    const actorPermissions = (c.get("actorPermissions") as string[] | undefined) ?? [];

    const scopedTenantIds = await getScopedTenantIdsForOwner(
      db,
      actorId,
      actorPermissions,
      actorRole,
    );

    const csvHeaders = "ID,Slug,Name,AdminEmail,Plan,Modules,Status,CreatedAt\n";

    if (scopedTenantIds !== null && scopedTenantIds.length === 0) {
      c.header("Content-Type", "text/csv");
      c.header("Content-Disposition", 'attachment; filename="tenants-export.csv"');
      return c.text(csvHeaders);
    }

    const conditions: SQL[] = [];
    if (scopedTenantIds !== null) {
      conditions.push(inArray(tenants.id, scopedTenantIds));
    }

    const allTenants = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        adminEmail: tenants.adminEmail,
        planSlug: tenants.planSlug,
        modules: tenants.modules,
        status: tenants.status,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tenants.createdAt));

    let csvContent = csvHeaders;
    for (const t of allTenants) {
      const escapedName = `"${t.name.replace(/"/g, '""')}"`;
      csvContent += `${t.id},${t.slug},${escapedName},${t.adminEmail},${t.planSlug},"${t.modules}",${t.status},${t.createdAt.toISOString()}\n`;
    }

    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", 'attachment; filename="tenants-export.csv"');
    return c.text(csvContent);
  });
}
