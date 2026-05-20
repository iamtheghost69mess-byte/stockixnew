import { apiConfig } from "@repo/config";
import { licenses, plans, tenantDeployments } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type FinanceLicenseSyncPayload = {
  tenantId: number;
  planSlug: string;
  status: "active" | "expired" | "suspended" | "grace";
  validFrom: string;
  expiresAt: string | null;
  gracePeriodDays: number;
  maxUsers: number;
  maxOrganizations: number;
  isPerpetual: boolean;
  featureFlags: Record<string, boolean> | null;
};

function mapStockixLicenseStatus(
  status: string,
  tenantStatus?: string,
): FinanceLicenseSyncPayload["status"] {
  if (tenantStatus === "suspended") {
    return "suspended";
  }
  if (status === "expired") {
    return "expired";
  }
  if (status === "revoked") {
    return "suspended";
  }
  return "active";
}

export async function resolveTenantInternalBaseUrl(
  db: Db,
  stockixTenantId: string,
): Promise<string | null> {
  const [deployment] = await db
    .select({ internalPort: tenantDeployments.internalPort })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, stockixTenantId))
    .limit(1);

  if (!deployment?.internalPort) {
    return null;
  }

  const host = process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1";
  return `http://${host}:${deployment.internalPort}`;
}

export async function syncFinanceLicenseForStockixTenant(
  db: Db,
  params: {
    stockixTenantId: string;
    financeTenantId: number;
    internalBaseUrl?: string | null;
  },
  log: (message: string) => void = () => {},
): Promise<void> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    log("[finance-license] INTERNAL_API_SECRET not configured; skipping sync");
    return;
  }

  const internalBaseUrl =
    params.internalBaseUrl ??
    (await resolveTenantInternalBaseUrl(db, params.stockixTenantId));

  if (!internalBaseUrl) {
    log("[finance-license] No internal base URL; skipping sync");
    return;
  }

  const [license] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.tenantId, params.stockixTenantId))
    .limit(1);

  const [tenantRow] = await db
    .select({ status: schema.tenants.status, planSlug: schema.tenants.planSlug })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, params.stockixTenantId))
    .limit(1);

  const planSlug = license?.planSlug ?? tenantRow?.planSlug ?? "owner-managed";

  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, planSlug))
    .limit(1);

  const payload: FinanceLicenseSyncPayload = {
    tenantId: params.financeTenantId,
    planSlug,
    status: mapStockixLicenseStatus(
      license?.status ?? "active",
      tenantRow?.status,
    ),
    validFrom: (license?.validFrom ?? new Date()).toISOString(),
    expiresAt: license?.expiresAt?.toISOString() ?? null,
    gracePeriodDays: license?.gracePeriodDays ?? 30,
    maxUsers: plan?.maxActivations ?? 10,
    maxOrganizations: plan?.maxOrganizations ?? 1,
    isPerpetual: license?.isPerpetual ?? false,
    featureFlags: null,
  };

  const url = `${internalBaseUrl.replace(/\/+$/, "")}/api/internal/license/sync`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      log(
        `[finance-license] Sync failed HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
      return;
    }

    log(`[finance-license] Synced license for finance tenant ${params.financeTenantId}`);
  } catch (error) {
    log(
      `[finance-license] Sync error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
