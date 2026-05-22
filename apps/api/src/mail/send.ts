import { tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { getActiveLicenseForTenant } from "../license-utils.js";
import { sendMail } from "./mailer.js";
import { renderTenantWelcome } from "./templates/tenant-welcome.js";
import { renderLicenseExpiring } from "./templates/license-expiring.js";
import { renderLicenseExpired } from "./templates/license-expired.js";

type MailDb = PostgresJsDatabase<typeof schema>;

export async function sendTenantWelcomeEmail(opts: {
  to: string;
  tenantName: string;
  organizationNumber: string;
  loginUrl: string;
}) {
  return sendMail({
    to: opts.to,
    subject: `Welcome to Stockix — ${opts.tenantName}`,
    html: renderTenantWelcome(opts),
    idempotencyKey: `tenant-welcome/${opts.organizationNumber}`,
  });
}

export async function sendLicenseExpiringEmail(opts: {
  to: string;
  tenantName: string;
  tenantId: string;
  expiresAt: Date;
}): Promise<void> {
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (opts.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );
  const expiryDay = opts.expiresAt.toISOString().split("T")[0];

  try {
    await sendMail({
      to: opts.to,
      subject: "Your Stockix license expires soon",
      html: renderLicenseExpiring({
        tenantName: opts.tenantName,
        expiresAt: opts.expiresAt,
        daysRemaining,
      }),
      idempotencyKey: `license-expiring/${opts.tenantId}/${expiryDay}`,
    });
  } catch (err) {
    console.error(
      "[sendLicenseExpiringEmail] Send failed",
      opts.tenantId,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function sendLicenseExpiredEmail(opts: {
  to: string;
  tenantName: string;
  tenantId: string;
  expiredAt: Date;
  gracePeriodDays: number;
  graceEndsAt: Date;
}): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  try {
    await sendMail({
      to: opts.to,
      subject: "Your Stockix license has expired",
      html: renderLicenseExpired({
        tenantName: opts.tenantName,
        expiredAt: opts.expiredAt,
        gracePeriodDays: opts.gracePeriodDays,
        graceEndsAt: opts.graceEndsAt,
      }),
      idempotencyKey: `license-expired/${opts.tenantId}/${today}`,
    });
  } catch (err) {
    console.error(
      "[sendLicenseExpiredEmail] Send failed",
      opts.tenantId,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function sendLicenseExpiredEmailForTenant(
  db: MailDb,
  tenantId: string,
): Promise<void> {
  try {
    const [tenant] = await db
      .select({ name: tenants.name, adminEmail: tenants.adminEmail })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      console.warn("[sendLicenseExpiredEmail] Tenant not found:", tenantId);
      return;
    }

    if (!tenant.adminEmail) {
      console.warn("[sendLicenseExpiredEmail] No admin email for tenant", tenantId);
      return;
    }

    const license = await getActiveLicenseForTenant(db, tenantId);
    const expiredAt = license?.expiresAt ?? new Date();
    const gracePeriodDays = license?.gracePeriodDays ?? 7;
    const graceEndsAt = new Date(expiredAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + gracePeriodDays);

    await sendLicenseExpiredEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      expiredAt,
      gracePeriodDays,
      graceEndsAt,
    });
  } catch (err) {
    console.error(
      "[sendLicenseExpiredEmail] Failed for tenant",
      tenantId,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function sendLicenseExpiringEmailForTenant(
  db: MailDb,
  tenantId: string,
  opts: { expiresAt: Date; gracePeriodDays: number },
): Promise<void> {
  try {
    const [tenant] = await db
      .select({ name: tenants.name, adminEmail: tenants.adminEmail })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      console.warn("[sendLicenseExpiringEmail] Tenant not found:", tenantId);
      return;
    }

    if (!tenant.adminEmail) {
      console.warn("[sendLicenseExpiringEmail] No admin email for tenant", tenantId);
      return;
    }

    await sendLicenseExpiringEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      expiresAt: opts.expiresAt,
    });
  } catch (err) {
    console.error(
      "[sendLicenseExpiringEmail] Failed for tenant",
      tenantId,
      err instanceof Error ? err.message : err,
    );
  }
}
