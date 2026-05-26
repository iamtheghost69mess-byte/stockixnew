import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import {
  hasLicenseExpiryMilestoneNotification,
} from "../notification-service.js";
import {
  sendLicenseExpiringEmailForTenant,
  sendLicenseExpiringEmailToPlatformOwner,
} from "../mail/send.js";
import { notifyLicenseForTenant } from "../notification-helpers.js";

type Db = PostgresJsDatabase<typeof schema>;

export type LicenseMilestoneJob = {
  licenseId: string;
  tenantId: string;
  milestoneDays: number;
  expiresAt: string;
  gracePeriodDays: number;
};

export async function runLicenseExpiryMilestoneJob(
  db: Db,
  job: LicenseMilestoneJob,
  log: (message: string) => void = console.log,
): Promise<void> {
  const expiresAt = new Date(job.expiresAt);
  const alreadyNotified = await hasLicenseExpiryMilestoneNotification(db, {
    licenseId: job.licenseId,
    milestoneDays: job.milestoneDays,
  });
  if (alreadyNotified) return;

  try {
    await sendLicenseExpiringEmailForTenant(db, job.tenantId, {
      expiresAt,
      gracePeriodDays: job.gracePeriodDays,
      licenseId: job.licenseId,
      milestoneDays: job.milestoneDays,
    });
    await sendLicenseExpiringEmailToPlatformOwner(db, job.tenantId, {
      expiresAt,
      licenseId: job.licenseId,
      milestoneDays: job.milestoneDays,
    });
  } catch (err) {
    console.error(
      "[expireDueLicenses] Milestone email failed",
      job.tenantId,
      job.milestoneDays,
      err,
    );
  }

  notifyLicenseForTenant(db, {
    tenantId: job.tenantId,
    licenseId: job.licenseId,
    type: "license.expiring",
    body: `License expires in ${job.milestoneDays} day${job.milestoneDays === 1 ? "" : "s"}. Extend now to avoid service interruption.`,
    daysLeft: job.milestoneDays,
    milestoneDays: job.milestoneDays,
  });

  log(
    `[license_expiry_milestone_fired] licenseId=${job.licenseId} milestoneDays=${job.milestoneDays}`,
  );
}
