import { licenses, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { getActiveLicenseForTenant, insertLicenseHistory } from "../license-utils.js";
import {
  mailSendSucceeded,
  sendMail,
  type MailSendResult,
} from "./mailer.js";
import { renderTenantWelcome } from "./templates/tenant-welcome.js";
import { renderOwnerInvite } from "./templates/owner-invite.js";
import { renderLicenseExpiring } from "./templates/license-expiring.js";
import { renderLicenseExpired } from "./templates/license-expired.js";
import { renderPasswordReset } from "./templates/password-reset.js";

type MailDb = PostgresJsDatabase<typeof schema>;

export async function sendOwnerInviteEmail(opts: {
  to: string;
  name: string;
  role: string;
  inviteUrl: string;
  ownerId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "You're invited to Stockix",
    html: renderOwnerInvite({
      name: opts.name,
      role: opts.role,
      inviteUrl: opts.inviteUrl,
    }),
    idempotencyKey: `owner-invite/${opts.to}/${opts.inviteUrl.slice(-12)}`,
    templateKey: "owner-invite",
    ownerId: opts.ownerId,
  });
}

export async function sendOwnerPasswordResetEmail(opts: {
  to: string;
  name?: string;
  resetUrl: string;
  ownerId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "Reset your Stockix password",
    html: renderPasswordReset({
      name: opts.name,
      resetUrl: opts.resetUrl,
    }),
    idempotencyKey: `password-reset/${opts.to}/${opts.resetUrl.slice(-16)}`,
    templateKey: "password-reset",
    ownerId: opts.ownerId,
  });
}

export async function sendPasswordChangedEmail(opts: {
  to: string;
  name?: string;
  ownerId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "Your Stockix password was changed",
    html: `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h1>Password updated</h1>
  <p>${opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,"}</p>
  <p>The password for your Stockix owner account was changed successfully.</p>
  <p style="color: #666; font-size: 14px;">If you did not make this change, contact your platform administrator immediately.</p>
</body>
</html>`,
    idempotencyKey: `password-changed/${opts.to}/${Date.now().toString(36).slice(0, 8)}`,
    templateKey: "password-changed",
    ownerId: opts.ownerId,
  });
}

export async function sendTenantWelcomeEmail(opts: {
  to: string;
  tenantName: string;
  organizationNumber: string;
  loginUrl: string;
  tenantId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: `Welcome to Stockix — ${opts.tenantName}`,
    html: renderTenantWelcome(opts),
    idempotencyKey: `tenant-welcome/${opts.organizationNumber}`,
    templateKey: "tenant-welcome",
    tenantId: opts.tenantId,
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
  tenantId?: string;
}): Promise<MailSendResult> {
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
    templateKey: "finance-welcome",
    tenantId: opts.tenantId,
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
  tenantId?: string;
}): Promise<MailSendResult> {
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
    templateKey: "pos-welcome",
    tenantId: opts.tenantId,
  });
}

/** @deprecated Use sendPosWelcomeEmail */
export const sendPosCredentialsEmail = sendPosWelcomeEmail;

export async function sendLicenseExpiringEmail(opts: {
  to: string;
  tenantName: string;
  tenantId: string;
  expiresAt: Date;
  licenseId?: string;
  milestoneDays?: number;
}): Promise<MailSendResult> {
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (opts.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );
  const expiryDay = opts.expiresAt.toISOString().split("T")[0];
  const idempotencyKey =
    opts.licenseId != null && opts.milestoneDays != null
      ? `license-expiring/${opts.licenseId}/${opts.milestoneDays}`
      : `license-expiring/${opts.tenantId}/${expiryDay}`;

  const result = await sendMail({
    to: opts.to,
    subject: "Your Stockix license expires soon",
    html: renderLicenseExpiring({
      tenantName: opts.tenantName,
      expiresAt: opts.expiresAt,
      daysRemaining,
    }),
    idempotencyKey,
    templateKey: "license-expiring",
    tenantId: opts.tenantId,
  });

  if (!mailSendSucceeded(result)) {
    console.error(
      "[sendLicenseExpiringEmail] Send failed",
      opts.tenantId,
      result.status === "failed" ? result.error : result.status,
    );
  }
  return result;
}

export async function sendLicenseExpiredEmail(opts: {
  to: string;
  tenantName: string;
  tenantId: string;
  expiredAt: Date;
  gracePeriodDays: number;
  graceEndsAt: Date;
}): Promise<MailSendResult> {
  const today = new Date().toISOString().split("T")[0];

  const result = await sendMail({
    to: opts.to,
    subject: "Your Stockix license has expired",
    html: renderLicenseExpired({
      tenantName: opts.tenantName,
      expiredAt: opts.expiredAt,
      gracePeriodDays: opts.gracePeriodDays,
      graceEndsAt: opts.graceEndsAt,
    }),
    idempotencyKey: `license-expired/${opts.tenantId}/${today}`,
    templateKey: "license-expired",
    tenantId: opts.tenantId,
  });

  if (!mailSendSucceeded(result)) {
    console.error(
      "[sendLicenseExpiredEmail] Send failed",
      opts.tenantId,
      result.status === "failed" ? result.error : result.status,
    );
  }
  return result;
}

export async function sendLicenseExpiredEmailForTenant(
  db: MailDb,
  tenantId: string,
  opts?: { licenseId?: string },
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

    const license =
      opts?.licenseId != null
        ? (
            await db
              .select({
                id: licenses.id,
                expiresAt: licenses.expiresAt,
                gracePeriodDays: licenses.gracePeriodDays,
              })
              .from(licenses)
              .where(eq(licenses.id, opts.licenseId))
              .limit(1)
          )[0]
        : await getActiveLicenseForTenant(db, tenantId);
    const expiredAt = license?.expiresAt ?? new Date();
    const gracePeriodDays = license?.gracePeriodDays ?? 7;
    const graceEndsAt = new Date(expiredAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + gracePeriodDays);

    const result = await sendLicenseExpiredEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      expiredAt,
      gracePeriodDays,
      graceEndsAt,
    });

    const historyLicenseId = opts?.licenseId ?? license?.id;
    if (historyLicenseId && mailSendSucceeded(result)) {
      await insertLicenseHistory(db, {
        licenseId: historyLicenseId,
        action: "expired_email_sent",
        newValues: { to: tenant.adminEmail, expiredAt: expiredAt.toISOString() },
      });
    }
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
  opts: {
    expiresAt: Date;
    gracePeriodDays: number;
    licenseId?: string;
    milestoneDays?: number;
  },
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

    const licenseIdForMail = opts.licenseId;
    const result = await sendLicenseExpiringEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      expiresAt: opts.expiresAt,
      licenseId: licenseIdForMail,
      milestoneDays: opts.milestoneDays,
    });

    const license =
      opts.licenseId != null
        ? (
            await db.select({ id: licenses.id }).from(licenses).where(eq(licenses.id, opts.licenseId)).limit(1)
          )[0]
        : await getActiveLicenseForTenant(db, tenantId);

    if (license?.id && mailSendSucceeded(result)) {
      await insertLicenseHistory(db, {
        licenseId: license.id,
        action: "expiry_warning_sent",
        newValues: {
          to: tenant.adminEmail,
          expiresAt: opts.expiresAt.toISOString(),
          ...(opts.milestoneDays != null
            ? { milestoneDays: opts.milestoneDays }
            : {}),
        },
      });
    }
  } catch (err) {
    console.error(
      "[sendLicenseExpiringEmail] Failed for tenant",
      tenantId,
      err instanceof Error ? err.message : err,
    );
  }
}
