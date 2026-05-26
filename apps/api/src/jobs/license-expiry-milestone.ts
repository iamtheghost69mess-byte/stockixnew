import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { logLine } from "../lib/logger.js";
import type { MailSendResult } from "../mail/mailer.js";
import { mailSendSucceeded } from "../mail/mailer.js";
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

function mailOutcomeAllowsNotification(result: MailSendResult | "no_recipient"): boolean {
  if (result === "no_recipient") return true;
  if (result.status === "sent") return true;
  if (result.status === "skipped" && result.reason === "not_configured") return true;
  return false;
}

function assertMilestoneMailOk(
  label: string,
  result: MailSendResult | "no_recipient",
): void {
  if (result === "no_recipient") return;
  if (result.status === "failed") {
    throw new Error(`${label} mail delivery failed: ${result.error}`);
  }
  if (result.status === "skipped" && result.reason !== "not_configured") {
    throw new Error(`${label} mail skipped: ${result.reason}`);
  }
}

export async function runLicenseExpiryMilestoneJob(
  db: Db,
  job: LicenseMilestoneJob,
  log: (message: string) => void = logLine,
): Promise<void> {
  const expiresAt = new Date(job.expiresAt);
  const alreadyNotified = await hasLicenseExpiryMilestoneNotification(db, {
    licenseId: job.licenseId,
    milestoneDays: job.milestoneDays,
  });
  if (alreadyNotified) return;

  const tenantMail = await sendLicenseExpiringEmailForTenant(db, job.tenantId, {
    expiresAt,
    gracePeriodDays: job.gracePeriodDays,
    licenseId: job.licenseId,
    milestoneDays: job.milestoneDays,
  });
  const ownerMail = await sendLicenseExpiringEmailToPlatformOwner(db, job.tenantId, {
    expiresAt,
    licenseId: job.licenseId,
    milestoneDays: job.milestoneDays,
  });

  assertMilestoneMailOk("tenant", tenantMail);
  assertMilestoneMailOk("platform_owner", ownerMail);

  if (!mailOutcomeAllowsNotification(tenantMail) || !mailOutcomeAllowsNotification(ownerMail)) {
    throw new Error("license_expiry_milestone_mail_not_delivered");
  }

  await notifyLicenseForTenant(db, {
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
