import { licenseConfig } from "@repo/config";
import { licenses, tenants } from "@repo/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { logLine } from "./lib/logger.js";
import { triggerFinanceLicenseSync } from "./license-finance-sync.js";
import { insertLicenseHistory } from "./license-utils.js";
import {
  reactivatePosOrgForLicense,
  suspendPosOrgForLicense,
  syncPosOrgLicenseFromLicense,
} from "./pos-license-sync.js";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * When a tenant is suspended from the dashboard, mirror license + product access
 * (in addition to Docker stop via tenant.lifecycle job).
 */
export async function applyTenantLicenseSuspend(
  db: Db,
  tenantId: string,
  reason: string,
  log: (message: string) => void = logLine,
): Promise<void> {
  await db
    .update(tenants)
    .set({ status: "suspended" })
    .where(eq(tenants.id, tenantId));

  const [lic] = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.tenantId, tenantId), eq(licenses.status, "active")))
    .orderBy(desc(licenses.activatedAt))
    .limit(1);

  if (lic) {
    const now = new Date();
    await db
      .update(licenses)
      .set({ status: "suspended", updatedAt: now })
      .where(eq(licenses.id, lic.id));
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      action: "suspended",
      previousValues: { status: lic.status },
      newValues: { status: "suspended", reason },
      notes: "Suspended via tenant suspend",
    });
  }

  try {
    await triggerFinanceLicenseSync(db, tenantId, log);
  } catch (err) {
    log(
      `[tenant-license] Finance sync failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const posResult = await suspendPosOrgForLicense(db, tenantId, reason, log);
  if (!posResult.ok) {
    log(`[tenant-license] POS suspend failed: ${posResult.error}`);
    if (licenseConfig.syncStrict) {
      throw new Error(`pos: ${posResult.error}`);
    }
  }
}

/**
 * When a tenant is reactivated, restore license + product access before compose start job runs.
 */
export async function applyTenantLicenseReactivate(
  db: Db,
  tenantId: string,
  log: (message: string) => void = logLine,
): Promise<void> {
  await db
    .update(tenants)
    .set({ status: "active" })
    .where(eq(tenants.id, tenantId));

  const [lic] = await db
    .select()
    .from(licenses)
    .where(
      and(
        eq(licenses.tenantId, tenantId),
        inArray(licenses.status, ["suspended", "expired"]),
      ),
    )
    .orderBy(desc(licenses.updatedAt))
    .limit(1);

  if (lic) {
    const now = new Date();
    const previousStatus = lic.status;
    await db
      .update(licenses)
      .set({ status: "active", updatedAt: now })
      .where(eq(licenses.id, lic.id));
    await insertLicenseHistory(db, {
      licenseId: lic.id,
      action: "reactivated",
      previousValues: { status: previousStatus },
      newValues: { status: "active" },
      notes: "Reactivated via tenant reactivate",
    });

    const updated = { ...lic, status: "active" as const };
    const windowResult = await syncPosOrgLicenseFromLicense(db, tenantId, updated, log);
    if (!windowResult.ok) {
      log(`[tenant-license] POS license window sync failed: ${windowResult.error}`);
      if (licenseConfig.syncStrict) {
        throw new Error(`pos: ${windowResult.error}`);
      }
    }
    const reactivateResult = await reactivatePosOrgForLicense(db, tenantId, log);
    if (!reactivateResult.ok) {
      log(`[tenant-license] POS reactivate failed: ${reactivateResult.error}`);
      if (licenseConfig.syncStrict) {
        throw new Error(`pos: ${reactivateResult.error}`);
      }
    }
  }

  try {
    await triggerFinanceLicenseSync(db, tenantId, log);
  } catch (err) {
    log(
      `[tenant-license] Finance sync failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
