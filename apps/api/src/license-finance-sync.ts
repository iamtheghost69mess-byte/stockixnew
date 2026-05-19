import { tenantDeployments } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { syncFinanceLicenseForStockixTenant } from "./finance-license.client.js";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Pushes current Stockix license state to the tenant Finance stack (non-blocking).
 */
export async function triggerFinanceLicenseSync(
  db: Db,
  stockixTenantId: string | null | undefined,
  log: (message: string) => void = console.log,
): Promise<void> {
  if (!stockixTenantId) return;

  const [deployment] = await db
    .select({ financeTenantId: tenantDeployments.financeTenantId })
    .from(tenantDeployments)
    .where(eq(tenantDeployments.tenantId, stockixTenantId))
    .limit(1);

  const financeTenantId = deployment?.financeTenantId;
  if (!financeTenantId || financeTenantId <= 0) {
    log(
      `[finance-license] No finance_tenant_id for Stockix tenant ${stockixTenantId}; skipping sync`,
    );
    return;
  }

  await syncFinanceLicenseForStockixTenant(
    db,
    { stockixTenantId, financeTenantId },
    log,
  );
}
