import { licenses, tenants } from "@repo/db/schema";
import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
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
  expiresAt: Date;
  gracePeriodDays: number;
}) {
  return sendMail({
    to: opts.to,
    subject: "Your Stockix license expires soon",
    html: renderLicenseExpiring(opts),
    idempotencyKey: `license-expiring/${opts.to}/${opts.expiresAt.toISOString().split("T")[0]}`,
  });
}

export async function sendLicenseExpiredEmail(opts: {
  to: string;
  tenantName: string;
  expiresAt: Date | null;
  tenantId?: string;
}) {
  const day = opts.expiresAt?.toISOString().split("T")[0] ?? "unknown";
  const idKey = opts.tenantId ?? opts.to;
  return sendMail({
    to: opts.to,
    subject: "Your Stockix license has expired",
    html: renderLicenseExpired(opts),
    idempotencyKey: `license-expired/${idKey}/${day}`,
  });
}

export async function sendLicenseExpiredEmailForTenant(
  db: MailDb,
  tenantId: string,
): Promise<void> {
  const [tenant] = await db
    .select({ name: tenants.name, adminEmail: tenants.adminEmail })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.adminEmail) {
    console.warn("[sendLicenseExpiredEmail] No admin email for tenant", tenantId);
    return;
  }

  const [license] = await db
    .select({ expiresAt: licenses.expiresAt })
    .from(licenses)
    .where(eq(licenses.tenantId, tenantId))
    .orderBy(desc(licenses.updatedAt))
    .limit(1);

  await sendLicenseExpiredEmail({
    to: tenant.adminEmail,
    tenantName: tenant.name,
    expiresAt: license?.expiresAt ?? null,
    tenantId,
  });
}

export async function sendLicenseExpiringEmailForTenant(
  db: MailDb,
  tenantId: string,
  opts: { expiresAt: Date; gracePeriodDays: number },
): Promise<void> {
  const [tenant] = await db
    .select({ name: tenants.name, adminEmail: tenants.adminEmail })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.adminEmail) {
    console.warn("[sendLicenseExpiringEmail] No admin email for tenant", tenantId);
    return;
  }

  await sendLicenseExpiringEmail({
    to: tenant.adminEmail,
    tenantName: tenant.name,
    expiresAt: opts.expiresAt,
    gracePeriodDays: opts.gracePeriodDays,
  });
}
