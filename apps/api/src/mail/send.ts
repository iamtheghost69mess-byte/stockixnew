import { sendMail } from "./mailer.js";
import { renderTenantWelcome } from "./templates/tenant-welcome.js";
import { renderLicenseExpiring } from "./templates/license-expiring.js";
import { renderLicenseExpired } from "./templates/license-expired.js";

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
}) {
  const day = opts.expiresAt?.toISOString().split("T")[0] ?? "unknown";
  return sendMail({
    to: opts.to,
    subject: "Your Stockix license has expired",
    html: renderLicenseExpired(opts),
    idempotencyKey: `license-expired/${opts.to}/${day}`,
  });
}
