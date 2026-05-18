import { randomUUID } from "node:crypto";

import { apiConfig } from "@repo/config";
import { organizations, tenantDeployments, tenants } from "@repo/db/schema";
import { and, asc, eq } from "drizzle-orm";

import { createProvisionTracer } from "./provision-trace.js";
import { insertTenantJob } from "./services/tenant-jobs.js";
import type { PlanLimitsDb } from "./plan-limits.js";

export async function enqueueOrgProvisioning(
  db: PlanLimitsDb,
  organizationId: string,
  tenantId: string,
): Promise<void> {
  const [org] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      tenantId: organizations.tenantId,
    })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.tenantId, tenantId)))
    .limit(1);
  if (!org) {
    throw new Error("organization_not_found");
  }

  const [tenant] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      ownerId: tenants.ownerId,
      adminEmail: tenants.adminEmail,
      adminFirstName: tenants.adminFirstName,
      adminLastName: tenants.adminLastName,
      planSlug: tenants.planSlug,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) {
    throw new Error("tenant_not_found");
  }

  const [parentDeployment] = await db
    .select({ internalPort: tenantDeployments.internalPort })
    .from(tenantDeployments)
    .where(and(eq(tenantDeployments.tenantId, tenantId), eq(tenantDeployments.status, "active")))
    .orderBy(asc(tenantDeployments.createdAt))
    .limit(1);

  const internalHost = process.env.TENANT_INTERNAL_HOST?.trim() || apiConfig.tenantInternalHost;
  const mainTenantInternalBaseUrl =
    parentDeployment !== undefined
      ? `http://${internalHost}:${parentDeployment.internalPort}`
      : undefined;

  const correlationId = randomUUID();
  const log = (m: string) => {
    console.log(JSON.stringify({ level: "info", correlationId, message: m }));
  };
  const acceptTrace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: org.slug, tenantId }),
    log,
  );
  await acceptTrace.event(
    "api",
    "HTTP 202 — organization provisioning accepted; background worker will start",
    { meta: { organizationId, parentTenantId: tenantId } },
  );

  if (!mainTenantInternalBaseUrl) {
    throw new Error("parent_tenant_not_deployed");
  }

  await insertTenantJob(db, {
    type: "organization.provision",
    tenantId,
    correlationId,
    payload: {
      organizationId,
      adminEmail: tenant.adminEmail,
      adminFirstName: tenant.adminFirstName,
      adminLastName: tenant.adminLastName,
      orgName: org.name,
      parentTenantSlug: tenant.slug,
      mainTenantInternalBaseUrl,
      stockixTenantId: tenantId,
      stockixApiUrl:
        process.env.STOCKIX_API_URL?.trim()
        ?? process.env.NEXT_PUBLIC_STOCKIX_API_URL?.trim()
        ?? "",
    },
  });
}
