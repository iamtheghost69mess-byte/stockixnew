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
import { licenses, owners, plans, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { getActiveLicenseForTenant, insertLicenseHistory, parseLicenseModulesJson } from "../license-utils.js";
import { rootDomainForOrganizationSubdomain } from "../lib/organization-domain.js";
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
import {
  renderLicenseActivated,
  renderLicenseActivatedText,
} from "./templates/license-activated.js";
import {
  renderProvisionCompleteOwner,
  renderProvisionCompleteOwnerText,
} from "./templates/provision-complete-owner.js";
import {
  renderOrgAdminAccess,
  renderOrgAdminAccessText,
} from "./templates/org-admin-access.js";
import {
  renderModuleAdded,
  renderModuleAddedText,
  renderModuleRemoved,
  renderModuleRemovedText,
} from "./templates/module-lifecycle.js";
import {
  renderMfaEnabled,
  renderMfaEnabledText,
  renderMfaDisabled,
  renderMfaDisabledText,
  renderAccountLocked,
  renderAccountLockedText,
  renderSuspiciousLogin,
  renderSuspiciousLoginText,
} from "./templates/security-alerts.js";

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

export async function sendLicenseActivatedEmail(opts: {
  to: string;
  tenantName: string;
  tenantId: string;
  planName: string;
  modules: string[];
  validFrom: Date;
  expiresAt: Date | null;
  isPerpetual: boolean;
  loginUrl: string;
  licenseId: string;
}): Promise<MailSendResult> {
  const brandName = apiConfig.brandName;
  const mailOpts = {
    tenantName: opts.tenantName,
    planName: opts.planName,
    modules: opts.modules,
    validFrom: opts.validFrom,
    expiresAt: opts.expiresAt,
    isPerpetual: opts.isPerpetual,
    loginUrl: opts.loginUrl,
  };

  return sendMail({
    to: opts.to,
    subject: `Your ${brandName} license is active`,
    html: renderLicenseActivated(mailOpts),
    text: renderLicenseActivatedText(mailOpts),
    idempotencyKey: `license-activated/${opts.licenseId}`,
    templateKey: "license-activated",
    tenantId: opts.tenantId,
  });
}

export async function sendLicenseActivatedEmailForTenant(
  db: MailDb,
  tenantId: string,
  opts: { licenseId: string },
): Promise<void> {
  try {
    const [tenant] = await db
      .select({
        name: tenants.name,
        adminEmail: tenants.adminEmail,
        slug: tenants.slug,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      console.warn("[sendLicenseActivatedEmail] Tenant not found:", tenantId);
      return;
    }

    if (!tenant.adminEmail) {
      console.warn("[sendLicenseActivatedEmail] No admin email for tenant", tenantId);
      return;
    }

    const [license] = await db
      .select({
        id: licenses.id,
        planSlug: licenses.planSlug,
        modules: licenses.modules,
        validFrom: licenses.validFrom,
        expiresAt: licenses.expiresAt,
        isPerpetual: licenses.isPerpetual,
        activatedAt: licenses.activatedAt,
      })
      .from(licenses)
      .where(eq(licenses.id, opts.licenseId))
      .limit(1);

    if (!license) {
      console.warn("[sendLicenseActivatedEmail] License not found:", opts.licenseId);
      return;
    }

    const [plan] = await db
      .select({ name: plans.name })
      .from(plans)
      .where(eq(plans.slug, license.planSlug))
      .limit(1);

    const root = rootDomainForOrganizationSubdomain();
    const loginUrl =
      tenant.slug && root
        ? `${apiConfig.publicBaseUrlScheme}://${tenant.slug}.${root}`
        : apiConfig.dashboardUrl;

    const result = await sendLicenseActivatedEmail({
      to: tenant.adminEmail,
      tenantName: tenant.name,
      tenantId,
      planName: plan?.name ?? license.planSlug,
      modules: parseLicenseModulesJson(license.modules),
      validFrom: license.validFrom ?? license.activatedAt ?? new Date(),
      expiresAt: license.expiresAt,
      isPerpetual: license.isPerpetual,
      loginUrl,
      licenseId: license.id,
    });

    if (mailSendSucceeded(result)) {
      await insertLicenseHistory(db, {
        licenseId: license.id,
        action: "activated_email_sent",
        newValues: { to: tenant.adminEmail },
      });
    }
  } catch (err) {
    console.error(
      "[sendLicenseActivatedEmail] Failed for tenant",
      tenantId,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function sendProvisionCompleteOwnerEmail(opts: {
  to: string;
  ownerId?: string;
  tenantId: string;
  tenantName: string;
  tenantSlug?: string | null;
  adminEmail?: string | null;
  planSlug?: string | null;
  modules?: string[] | null;
}): Promise<MailSendResult> {
  const dashboardBase = apiConfig.dashboardUrl.replace(/\/+$/, "");
  const tenantDashboardUrl = `${dashboardBase}/tenants/${opts.tenantId}`;
  const mailOpts = {
    tenantName: opts.tenantName,
    tenantSlug: opts.tenantSlug ?? "—",
    adminEmail: opts.adminEmail ?? "—",
    planSlug: opts.planSlug ?? "starter",
    modules: opts.modules ?? [],
    tenantDashboardUrl,
  };

  return sendMail({
    to: opts.to,
    subject: `Tenant provisioned: ${opts.tenantName}`,
    html: renderProvisionCompleteOwner(mailOpts),
    text: renderProvisionCompleteOwnerText(mailOpts),
    idempotencyKey: `provision-complete-owner/${opts.tenantId}`,
    templateKey: "provision-complete-owner",
    tenantId: opts.tenantId,
    ownerId: opts.ownerId,
  });
}

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

export async function sendModuleAddedEmail(opts: {
  to: string;
  tenantName: string;
  moduleName: string;
  moduleUrl?: string;
  tenantId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: `${opts.moduleName} module activated`,
    html: renderModuleAdded({ tenantName: opts.tenantName, moduleName: opts.moduleName, moduleUrl: opts.moduleUrl }),
    text: renderModuleAddedText({ tenantName: opts.tenantName, moduleName: opts.moduleName, moduleUrl: opts.moduleUrl }),
    idempotencyKey: `module-added/${opts.tenantId ?? opts.tenantName}/${opts.moduleName}`,
    templateKey: "module-added",
    tenantId: opts.tenantId,
  });
}

export async function sendModuleRemovedEmail(opts: {
  to: string;
  tenantName: string;
  moduleName: string;
  tenantId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: `${opts.moduleName} module deactivated`,
    html: renderModuleRemoved({ tenantName: opts.tenantName, moduleName: opts.moduleName }),
    text: renderModuleRemovedText({ tenantName: opts.tenantName, moduleName: opts.moduleName }),
    idempotencyKey: `module-removed/${opts.tenantId ?? opts.tenantName}/${opts.moduleName}`,
    templateKey: "module-removed",
    tenantId: opts.tenantId,
  });
}

export async function sendOrgAdminAccessEmail(opts: {
  to: string;
  orgName: string;
  orgUrl: string;
  tenantId?: string;
  organizationId?: string;
}): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: `New organization ready — ${opts.orgName}`,
    html: renderOrgAdminAccess({ orgName: opts.orgName, orgUrl: opts.orgUrl }),
    text: renderOrgAdminAccessText({ orgName: opts.orgName, orgUrl: opts.orgUrl }),
    idempotencyKey: `org-admin-access/${opts.organizationId ?? opts.orgName}`,
    templateKey: "org-admin-access",
    tenantId: opts.tenantId,
  });
}

export async function sendMfaEnabledEmail(opts: { to: string; email: string }): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "Two-factor authentication enabled",
    html: renderMfaEnabled({ email: opts.email }),
    text: renderMfaEnabledText({ email: opts.email }),
    idempotencyKey: `mfa-enabled/${opts.to}/${Date.now()}`,
    templateKey: "mfa-enabled",
  });
}

export async function sendMfaDisabledEmail(opts: { to: string; email: string }): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "Two-factor authentication disabled",
    html: renderMfaDisabled({ email: opts.email }),
    text: renderMfaDisabledText({ email: opts.email }),
    idempotencyKey: `mfa-disabled/${opts.to}/${Date.now()}`,
    templateKey: "mfa-disabled",
  });
}

export async function sendAccountLockedEmail(opts: { to: string; email: string; lockedUntil: Date }): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "Your account has been temporarily locked",
    html: renderAccountLocked({ email: opts.email, lockedUntil: opts.lockedUntil }),
    text: renderAccountLockedText({ email: opts.email, lockedUntil: opts.lockedUntil }),
    idempotencyKey: `account-locked/${opts.to}/${opts.lockedUntil.getTime()}`,
    templateKey: "account-locked",
  });
}

export async function sendSuspiciousLoginEmail(opts: { to: string; email: string; ipAddress: string; userAgent: string; timestamp: Date }): Promise<MailSendResult> {
  return sendMail({
    to: opts.to,
    subject: "New sign-in from unrecognized device",
    html: renderSuspiciousLogin({ email: opts.email, ipAddress: opts.ipAddress, userAgent: opts.userAgent, timestamp: opts.timestamp }),
    text: renderSuspiciousLoginText({ email: opts.email, ipAddress: opts.ipAddress, userAgent: opts.userAgent, timestamp: opts.timestamp }),
    idempotencyKey: `suspicious-login/${opts.to}/${opts.timestamp.getTime()}`,
    templateKey: "suspicious-login",
  });
}
