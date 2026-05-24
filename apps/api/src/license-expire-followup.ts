import { licenses } from "@repo/db/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { insertLicenseHistory } from "./license-utils.js";
import { triggerFinanceLicenseSync } from "./license-finance-sync.js";
import {
  sendLicenseExpiredEmailForTenant,
  sendLicenseExpiringEmailForTenant,
} from "./mail/send.js";

type Db = PostgresJsDatabase<typeof schema>;

export type ExpiredLicenseRow = {
  id: string;
  tenantId: string | null;
  expiresAt: Date | null;
  gracePeriodDays: number;
};

/**
 * After licenses are marked expired: sync finance, send expiry email, warn soon-to-expire.
 */
export async function processLicenseExpiryFollowUp(
  db: Db,
  opts: {
    justExpired: ExpiredLicenseRow[];
    now?: Date;
    log?: (message: string) => void;
  },
): Promise<void> {
  const log = opts.log ?? ((message: string) => console.log(message));
  const now = opts.now ?? new Date();

  for (const license of opts.justExpired) {
    await insertLicenseHistory(db, {
      licenseId: license.id,
      action: "expired_by_worker",
      previousValues: { status: "active" },
      newValues: { status: "expired" },
      notes: "Automatically expired by worker cron",
    });

    if (!license.tenantId) continue;

    try {
      await triggerFinanceLicenseSync(db, license.tenantId, log);
    } catch (err) {
      console.error(
        "[expireDueLicenses] Finance sync failed for tenant",
        license.tenantId,
        err,
      );
    }

    try {
      await sendLicenseExpiredEmailForTenant(db, license.tenantId);
    } catch (err) {
      console.error(
        "[expireDueLicenses] Email failed for tenant",
        license.tenantId,
        err,
      );
    }
  }

  await processExpiringSoonWarnings(db, now);
}

async function processExpiringSoonWarnings(db: Db, now: Date): Promise<void> {
  const candidates = await db
    .select({
      id: licenses.id,
      tenantId: licenses.tenantId,
      expiresAt: licenses.expiresAt,
      gracePeriodDays: licenses.gracePeriodDays,
    })
    .from(licenses)
    .where(
      and(
        eq(licenses.status, "active"),
        eq(licenses.isPerpetual, false),
        isNotNull(licenses.tenantId),
        isNotNull(licenses.expiresAt),
        gte(licenses.expiresAt, now),
      ),
    );

  for (const license of candidates) {
    if (!license.tenantId || !license.expiresAt) continue;

    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + (license.gracePeriodDays ?? 7));
    if (license.expiresAt > windowEnd) continue;

    try {
      await sendLicenseExpiringEmailForTenant(db, license.tenantId, {
        expiresAt: license.expiresAt,
        gracePeriodDays: license.gracePeriodDays ?? 7,
      });
    } catch (err) {
      console.error(
        "[expireDueLicenses] Warning email failed",
        license.tenantId,
        err,
      );
    }
  }
}
