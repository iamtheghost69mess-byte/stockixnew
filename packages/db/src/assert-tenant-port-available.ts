import { and, eq, inArray, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema.js";
import { tenantDeployments, tenants } from "./schema.js";

const ACTIVE_TENANT_STATUSES = ["active", "provisioning", "partial", "suspended"];

/**
 * Ensures no other active tenant deployment already uses the given host port.
 * Finance stores ports on tenant_deployments.internal_port; POS uses the same sequence.
 */
export async function assertTenantPortAvailable(
  db: PostgresJsDatabase<typeof schema>,
  port: number,
  options: { excludeTenantId?: string; slug: string },
): Promise<void> {
  const conditions = [
    eq(tenantDeployments.internalPort, port),
    inArray(tenants.status, ACTIVE_TENANT_STATUSES),
  ];
  if (options.excludeTenantId) {
    conditions.push(ne(tenantDeployments.tenantId, options.excludeTenantId));
  }

  const rows = await db
    .select({ slug: tenants.slug })
    .from(tenantDeployments)
    .innerJoin(tenants, eq(tenantDeployments.tenantId, tenants.id))
    .where(and(...conditions))
    .limit(1);

  const conflict = rows[0];
  if (conflict) {
    throw new Error(
      `[traefik] Port ${port} already allocated to tenant "${conflict.slug}". ` +
        `Port collision detected for ${options.slug}. Provision aborted.`,
    );
  }
}
