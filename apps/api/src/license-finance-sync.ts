import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { syncFinanceLicenseForStockixTenant } from "./finance-license.client.js";
import { getActiveLicenseForTenant } from "./license-utils.js";
import { sendLicenseExpiringEmail } from "./mail/send.js";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Pushes current Stockix license state to the tenant Finance stack (non-blocking).
 * Sends a grace-period warning email when the license has expired but is still within grace.
 */
export async function triggerFinanceLicenseSync(
  db: Db,
  stockixTenantId: string | null | undefined,
  log: (message: string) => void = console.log,
): Promise<void> {
  if (!stockixTenantId) return;

  await maybeSendLicenseGraceWarningEmail(db, stockixTenantId, log);

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

async function maybeSendLicenseGraceWarningEmail(
  db: Db,
  stockixTenantId: string,
  log: (message: string) => void,
): Promise<void> {
  const license = await getActiveLicenseForTenant(db, stockixTenantId);

  if (!license?.expiresAt || license.isPerpetual) {
    return;
  }

  const now = new Date();
  const expiresAt = license.expiresAt;
  const graceDays = license.gracePeriodDays ?? 7;
  const graceEnds = new Date(expiresAt);
  graceEnds.setDate(graceEnds.getDate() + graceDays);

  const inGrace =
    expiresAt < now && now <= graceEnds && license.status !== "revoked";

  if (!inGrace) {
    return;
  }

  const [tenant] = await db
    .select({ name: tenants.name, adminEmail: tenants.adminEmail })
    .from(tenants)
    .where(eq(tenants.id, stockixTenantId))
    .limit(1);

  if (!tenant?.adminEmail) {
    return;
  }

  try {
    await sendLicenseExpiringEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      expiresAt,
      gracePeriodDays: graceDays,
    });
    log(`[mail] Sent license grace warning to ${tenant.adminEmail}`);
  } catch (err) {
    log(
      `[mail] License grace email failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
