import { tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { getActiveLicenseForTenant } from "../license-utils.js";
import { sendMail } from "./mailer.js";
import { renderTenantWelcome } from "./templates/tenant-welcome.js";
import { renderOwnerInvite } from "./templates/owner-invite.js";
import { renderLicenseExpiring } from "./templates/license-expiring.js";
import { renderLicenseExpired } from "./templates/license-expired.js";

type MailDb = PostgresJsDatabase<typeof schema>;

export async function sendOwnerInviteEmail(opts: {
  to: string;
  name: string;
  role: string;
  inviteUrl: string;
}) {
  return sendMail({
    to: opts.to,
    subject: "You're invited to Stockix",
    html: renderOwnerInvite({
      name: opts.name,
      role: opts.role,
      inviteUrl: opts.inviteUrl,
    }),
    idempotencyKey: `owner-invite/${opts.to}/${opts.inviteUrl.slice(-12)}`,
  });
}

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

function formatModuleLabel(moduleId: string): string {
  if (moduleId === "accounting") return "Accounting";
  if (moduleId === "pos") return "Point of Sale";
  if (moduleId === "pms") return "Property Management";
  if (moduleId === "chat") return "Chat";
  return moduleId;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendFinanceWelcomeEmail(opts: {
  to: string;
  tenantName: string;
  financeUrl: string;
  adminEmail: string;
  oneTimePassword: string;
  modules: string[];
}) {
  const brandName = process.env.BRAND_NAME ?? "Stockix";
  const loginUrl = opts.financeUrl.replace(/\/+$/, "");
  const moduleNames = opts.modules.map(formatModuleLabel).join(", ");
  const safeTenant = escapeHtml(opts.tenantName);
  const safeEmail = escapeHtml(opts.adminEmail);
  const safePassword = escapeHtml(opts.oneTimePassword);
  const safeLoginUrl = escapeHtml(loginUrl);

  return sendMail({
    to: opts.to,
    subject: `Your ${brandName} account is ready`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
  <h1 style="font-size: 22px;">Your account is ready</h1>
  <p>Hello,</p>
  <p>Your <strong>${safeTenant}</strong> account has been set up successfully.</p>
  <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <h2 style="font-size: 16px; margin: 0 0 12px;">Finance login details</h2>
    <p style="margin: 8px 0;"><strong>Login URL</strong><br />
      <a href="${safeLoginUrl}/auth/login">${safeLoginUrl}/auth/login</a></p>
    <p style="margin: 8px 0;"><strong>Email</strong><br />${safeEmail}</p>
    <p style="margin: 8px 0;"><strong>Temporary password</strong><br />
      <code style="font-size: 15px;">${safePassword}</code></p>
  </div>
  <p style="color: #b45309;"><strong>Important:</strong> You will be asked to create a new password on first login.
  The temporary password above will no longer work after you set a new one.</p>
  <p>Modules included: ${escapeHtml(moduleNames || "Accounting")}</p>
  <p style="margin: 24px 0;">
    <a href="${safeLoginUrl}/auth/login"
       style="display: inline-block; background: #111; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">
      Log in to your account
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">If you have questions, contact your account manager.</p>
</body>
</html>`,
    idempotencyKey: `finance-welcome/${opts.adminEmail}/${loginUrl}`,
  });
}

/** @deprecated Use sendFinanceWelcomeEmail */
export const sendFinanceCredentialsEmail = sendFinanceWelcomeEmail;

export type PosCredentialEmailRow = {
  role: string;
  username: string;
  pin: string;
};

export async function sendPosWelcomeEmail(opts: {
  to: string;
  tenantName: string;
  posUrl: string;
  credentials: PosCredentialEmailRow[];
}) {
  const brandName = process.env.BRAND_NAME ?? "Stockix";
  const safeTenant = escapeHtml(opts.tenantName);
  const safePosUrl = escapeHtml(opts.posUrl);
  const credentialRows = opts.credentials
    .map(
      (c) =>
        `<tr>
        <td>${escapeHtml(c.role)}</td>
        <td>${escapeHtml(c.username)}</td>
        <td><strong>${escapeHtml(c.pin)}</strong></td>
      </tr>`,
    )
    .join("");

  return sendMail({
    to: opts.to,
    subject: `Your ${brandName} POS staff credentials`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 600px;">
  <h1 style="font-size: 22px;">POS staff login credentials</h1>
  <p>Hello,</p>
  <p>Your <strong>${safeTenant}</strong> Point of Sale system is ready.</p>
  <p><strong>POS URL:</strong> <a href="${safePosUrl}">${safePosUrl}</a></p>
  <p>Staff log in using their role PIN code:</p>
  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <thead>
      <tr style="background: #f4f4f5;">
        <th align="left">Role</th>
        <th align="left">Username</th>
        <th align="left">PIN</th>
      </tr>
    </thead>
    <tbody>${credentialRows}</tbody>
  </table>
  <p style="color: #b45309;"><strong>Security:</strong> Share each PIN only with the relevant staff member.
  PINs can be changed from the admin panel. Do not forward this email to staff directly.</p>
  <p style="color: #666; font-size: 14px;">To reset a PIN, log in as admin and go to Settings → Staff Management.</p>
</body>
</html>`,
    idempotencyKey: `pos-welcome/${opts.to}/${opts.posUrl}`,
  });
}

/** @deprecated Use sendPosWelcomeEmail */
export const sendPosCredentialsEmail = sendPosWelcomeEmail;

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
