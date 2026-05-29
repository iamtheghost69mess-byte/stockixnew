/**
 * Mail configuration supports two modes:
 *
 * Mode 1 — SMTP (recommended for production):
 *   MAIL_HOST=smtp.resend.com
 *   MAIL_PORT=587
 *   MAIL_USERNAME=resend
 *   MAIL_PASSWORD=[your-resend-api-key]
 *   MAIL_FROM_ADDRESS=noreply@yourdomain.com
 *   MAIL_FROM_NAME=Stockix
 *
 * Mode 2 — Resend SDK (alternative):
 *   RESEND_API_KEY=re_[your-key]
 *   MAIL_FROM_ADDRESS=noreply@yourdomain.com
 *
 * Currently configured: SMTP via Resend (see mailer.ts).
 * RESEND_API_KEY is NOT required if using SMTP mode.
 */
import { apiConfig } from "@repo/config";
import { licenses, owners, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { getActiveLicenseForTenant, insertLicenseHistory } from "../license-utils.js";
import {
  mailSendSucceeded,
  sendMail,
  type MailSendResult,
} from "./mailer.js";
import { renderTenantWelcome, renderTenantWelcomeText } from "./templates/tenant-welcome.js";
import { renderOwnerInvite, renderOwnerInviteText } from "./templates/owner-invite.js";
import { renderLicenseExpiring, renderLicenseExpiringText } from "./templates/license-expiring.js";
import { renderLicenseExpired, renderLicenseExpiredText } from "./templates/license-expired.js";
import { renderPasswordReset, renderPasswordResetText } from "./templates/password-reset.js";
import { renderPasswordChanged, renderPasswordChangedText } from "./templates/password-changed.js";
import { renderFinanceWelcome, renderFinanceWelcomeText } from "./templates/finance-welcome.js";
import { renderPosWelcome, renderPosWelcomeText } from "./templates/pos-welcome.js";

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
    text: renderOwnerInviteText({
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
    text: renderPasswordResetText({
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
    html: renderPasswordChanged({ name: opts.name }),
    text: renderPasswordChangedText({ name: opts.name }),
    idempotencyKey: `password-changed-${opts.ownerId ?? opts.to}-${Math.floor(Date.now() / 86400000)}`,
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
    text: renderTenantWelcomeText(opts),
    idempotencyKey: `tenant-welcome/${opts.organizationNumber}`,
    templateKey: "tenant-welcome",
    tenantId: opts.tenantId,
  });
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
  const brandName = apiConfig.brandName;
  const loginUrl = opts.financeUrl.replace(/\/+$/, "");

  return sendMail({
    to: opts.to,
    subject: `Your ${brandName} account is ready`,
    html: renderFinanceWelcome({
      tenantName: opts.tenantName,
      financeUrl: opts.financeUrl,
      adminEmail: opts.adminEmail,
      oneTimePassword: opts.oneTimePassword,
      modules: opts.modules,
    }),
    text: renderFinanceWelcomeText({
      tenantName: opts.tenantName,
      financeUrl: opts.financeUrl,
      adminEmail: opts.adminEmail,
      oneTimePassword: opts.oneTimePassword,
      modules: opts.modules,
    }),
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
  const brandName = apiConfig.brandName;

  return sendMail({
    to: opts.to,
    subject: `Your ${brandName} POS staff credentials`,
    html: renderPosWelcome({
      tenantName: opts.tenantName,
      posUrl: opts.posUrl,
      credentials: opts.credentials,
    }),
    text: renderPosWelcomeText({
      tenantName: opts.tenantName,
      posUrl: opts.posUrl,
      credentials: opts.credentials,
    }),
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
  idempotencyKey?: string;
}): Promise<MailSendResult> {
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (opts.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );
  const expiryDay = opts.expiresAt.toISOString().split("T")[0];
  const idempotencyKey =
    opts.idempotencyKey ??
    (opts.licenseId != null && opts.milestoneDays != null
      ? `license-expiring/${opts.licenseId}/${opts.milestoneDays}`
      : `license-expiring/${opts.tenantId}/${expiryDay}`);

  const result = await sendMail({
    to: opts.to,
    subject: "Your Stockix license expires soon",
    html: renderLicenseExpiring({
      tenantName: opts.tenantName,
      expiresAt: opts.expiresAt,
      daysRemaining,
    }),
    text: renderLicenseExpiringText({
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
    text: renderLicenseExpiredText({
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
): Promise<MailSendResult | "no_recipient"> {
  try {
    const [tenant] = await db
      .select({ name: tenants.name, adminEmail: tenants.adminEmail })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      console.warn("[sendLicenseExpiringEmail] Tenant not found:", tenantId);
      return "no_recipient";
    }

    if (!tenant.adminEmail) {
      console.warn("[sendLicenseExpiringEmail] No admin email for tenant", tenantId);
      return "no_recipient";
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
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[sendLicenseExpiringEmail] Failed for tenant", tenantId, error);
    return { status: "failed", error };
  }
}

/** Notify the tenant's assigned platform owner (SaaS operator). */
export async function sendLicenseExpiringEmailToPlatformOwner(
  db: MailDb,
  tenantId: string,
  opts: {
    expiresAt: Date;
    licenseId: string;
    milestoneDays: number;
  },
): Promise<MailSendResult | "no_recipient"> {
  try {
    const [tenant] = await db
      .select({ name: tenants.name, ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant?.ownerId) return "no_recipient";

    const [owner] = await db
      .select({ email: owners.email })
      .from(owners)
      .where(eq(owners.id, tenant.ownerId))
      .limit(1);
    if (!owner?.email) return "no_recipient";

    return sendLicenseExpiringEmail({
      to: owner.email,
      tenantName: tenant.name,
      tenantId,
      expiresAt: opts.expiresAt,
      licenseId: opts.licenseId,
      milestoneDays: opts.milestoneDays,
      idempotencyKey: `license-expiring-owner/${opts.licenseId}/${opts.milestoneDays}`,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[sendLicenseExpiringEmailToPlatformOwner] Failed", tenantId, error);
    return { status: "failed", error };
  }
}
