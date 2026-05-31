import { randomUUID } from "node:crypto";

import { apiConfig } from "@repo/config";
import { organizations, tenantDeployments, tenants } from "@repo/db/schema";
import { and, asc, eq } from "drizzle-orm";

import { logger } from "./lib/logger.js";
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
      isPrimary: organizations.isPrimary,
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
      modules: tenants.modules,
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

  const internalHost = apiConfig.tenantInternalHost;
  const mainTenantInternalBaseUrl =
    parentDeployment !== undefined
      ? `http://${internalHost}:${parentDeployment.internalPort}`
      : undefined;

  const correlationId = randomUUID();
  const log = (m: string) => {
    logger.info(m, { correlationId });
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
      organizationSlug: org.slug,
      isPrimary: org.isPrimary,
      adminEmail: tenant.adminEmail,
      adminFirstName: tenant.adminFirstName,
      adminLastName: tenant.adminLastName,
      orgName: org.name,
      parentTenantSlug: tenant.slug,
      mainTenantInternalBaseUrl,
      stockixTenantId: tenantId,
      tenantModules: tenant.modules,
  stockixApiUrl: `${apiConfig.publicBaseUrlScheme ?? "https"}://${tenant.slug}.${apiConfig.rootDomain ?? "stockix.cloud"}/api`,
    },
  });
}
