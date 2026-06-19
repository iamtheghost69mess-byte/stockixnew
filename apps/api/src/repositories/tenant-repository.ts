import type { createDb } from "@repo/db";
import { tenants, tenantDeployments, tenantConfig, organizations, ownerOrganizationAccess, licenses } from "@repo/db/schema";
import { and, eq, inArray, sql, desc, isNull } from "drizzle-orm";

type Db = NonNullable<ReturnType<typeof createDb>>;

export class TenantRepository {
  constructor(private db: Db) {}

  async findById(id: string, scopedTenantIds: string[] | null) {
    const conditions = [eq(tenants.id, id)];
    if (scopedTenantIds) {
      conditions.push(inArray(tenants.id, scopedTenantIds));
    }
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async findDeploymentByTenantId(tenantId: string) {
    const [row] = await this.db
      .select()
      .from(tenantDeployments)
      .where(eq(tenantDeployments.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  }

  async findConfigByTenantId(tenantId: string) {
    const [row] = await this.db
      .select()
      .from(tenantConfig)
      .where(eq(tenantConfig.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  }

  async getLicenseCount(tenantId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(licenses)
      .where(eq(licenses.tenantId, tenantId));
    return Number(row?.count ?? 0);
  }

  async getOrgCount(tenantId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId));
    return Number(row?.count ?? 0);
  }

  async getActiveLicense(tenantId: string) {
    const [row] = await this.db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.tenantId, tenantId),
          eq(licenses.status, "active")
        )
      )
      .orderBy(desc(licenses.createdAt))
      .limit(1);
    return row ?? null;
  }
}
