import { apiConfig } from "@repo/config";
import { normalizeFinanceApiJson } from "@repo/shared/finance-api";
import { organizations, tenantDeployments, tenants } from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { tenantProvisionEvents } from "@repo/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

function internalBaseUrlFromPort(internalPort: number): string {
  return `http://${apiConfig.tenantInternalHost}:${internalPort}`;
}

async function fetchResolvedFinanceTenant(
  internalBaseUrl: string,
  params: { organizationId?: string; email?: string },
): Promise<{ tenantId: number; organizationId: string } | null> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) return null;

  const qs = new URLSearchParams();
  if (params.organizationId) qs.set("organizationId", params.organizationId);
  if (params.email) qs.set("email", params.email);
  if ([...qs.keys()].length === 0) return null;

  const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/resolve-tenant?${qs.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-internal-secret": secret },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;

  const raw = (await res.json().catch(() => null)) as unknown;
  if (raw === null) return null;
  const body = normalizeFinanceApiJson(raw) as Record<string, unknown>;

  const tenantId = Number(body.tenantId);
  const organizationId = String(body.organizationId ?? "");
  if (!Number.isFinite(tenantId) || tenantId <= 0 || !organizationId) return null;

  return { tenantId, organizationId };
}

/** Read finance tenant id from provision journal when job result omitted it. */
export async function readFinanceTenantIdFromProvisionEvents(
  db: Db,
  correlationId: string,
): Promise<number | undefined> {
  const rows = await db
    .select({ meta: tenantProvisionEvents.meta })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(desc(tenantProvisionEvents.createdAt))
    .limit(500);

  for (const row of rows) {
    if (!row.meta || typeof row.meta !== "object" || Array.isArray(row.meta)) continue;
    const meta = row.meta as Record<string, unknown>;
    const id = Number(meta.financeTenantId);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return undefined;
}

/**
 * Ensures tenant_deployments.finance_tenant_id is set by querying the live Finance stack.
 * Safe to call repeatedly (idempotent when already linked).
 */
export async function resolveAndPersistFinanceTenantId(
  db: Db,
  stockixTenantId: string,
): Promise<
  | { ok: true; financeTenantId: number; organizationId?: string; source: string }
  | { ok: false; error: string }
> {
  const [row] = await db
    .select({
      adminEmail: tenants.adminEmail,
      financeTenantId: tenantDeployments.financeTenantId,
      internalPort: tenantDeployments.internalPort,
      deploymentStatus: tenantDeployments.status,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, stockixTenantId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "tenant_not_found" };
  }

  const existing = row.financeTenantId == null ? null : Number(row.financeTenantId);
  if (existing != null && Number.isFinite(existing) && existing > 0) {
    return { ok: true, financeTenantId: existing, source: "database" };
  }

  const port = row.internalPort == null ? null : Number(row.internalPort);
  if (port == null || Number.isNaN(port) || port <= 0) {
    return { ok: false, error: "tenant_no_internal_port" };
  }

  const [primaryOrg] = await db
    .select({ financeOrganizationId: organizations.financeOrganizationId })
    .from(organizations)
    .where(
      and(eq(organizations.tenantId, stockixTenantId), eq(organizations.isPrimary, true)),
    )
    .limit(1);

  const organizationId = primaryOrg?.financeOrganizationId?.trim() || undefined;
  const email = row.adminEmail?.trim() || undefined;

  const resolved = await fetchResolvedFinanceTenant(internalBaseUrlFromPort(port), {
    organizationId,
    email,
  });

  if (!resolved) {
    return { ok: false, error: "finance_resolve_failed" };
  }

  await db
    .update(tenantDeployments)
    .set({
      financeTenantId: resolved.tenantId,
      updatedAt: new Date(),
    })
    .where(eq(tenantDeployments.tenantId, stockixTenantId));

  return {
    ok: true,
    financeTenantId: resolved.tenantId,
    organizationId: resolved.organizationId,
    source: "finance_api",
  };
}
