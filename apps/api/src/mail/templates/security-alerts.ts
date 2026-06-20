import { renderLayout, escapeHtml, emailParts, renderTextLayout } from "./layout.js";

export function renderMfaEnabled(opts: { email: string }): string {
  const { h1, bodyText, mutedNote } = emailParts;
  const content =
    h1("Two-factor authentication enabled") +
    bodyText(`Two-factor authentication (MFA) has been enabled for your account (<strong>${escapeHtml(opts.email)}</strong>). Your account is now more secure.`) +
    mutedNote("If you did not enable MFA, contact support immediately and change your password.");
  return renderLayout({ title: "MFA enabled", content });
}

export function renderMfaEnabledText(opts: { email: string }): string {
  return renderTextLayout({
    content: `MFA enabled for ${opts.email}.\nIf you did not enable this, contact support immediately.`,
  });
}

export function renderMfaDisabled(opts: { email: string }): string {
  const { h1, bodyText, mutedNote } = emailParts;
  const content =
    h1("Two-factor authentication disabled") +
    bodyText(`Two-factor authentication has been <strong>disabled</strong> for your account (<strong>${escapeHtml(opts.email)}</strong>).`) +
    mutedNote("If you did not disable MFA, contact support immediately and re-enable it.");
  return renderLayout({ title: "MFA disabled", content });
}

export function renderMfaDisabledText(opts: { email: string }): string {
  return renderTextLayout({
    content: `MFA disabled for ${opts.email}.\nIf you did not disable this, contact support immediately.`,
  });
}

export function renderAccountLocked(opts: { email: string; lockedUntil: Date }): string {
  const { h1, bodyText, mutedNote } = emailParts;
  const lockedUntilStr = opts.lockedUntil.toUTCString();
  const content =
    h1("Your account has been temporarily locked") +
    bodyText(`Too many failed login attempts were detected for <strong>${escapeHtml(opts.email)}</strong>. Your account is locked until <strong>${escapeHtml(lockedUntilStr)}</strong>.`) +
    mutedNote("If this was not you, your password may be compromised. Reset it immediately.");
  return renderLayout({ title: "Account locked", content });
}

export function renderAccountLockedText(opts: { email: string; lockedUntil: Date }): string {
  return renderTextLayout({
    content: `Your account (${opts.email}) has been locked until ${opts.lockedUntil.toUTCString()} due to failed login attempts.`,
  });
}

export function renderSuspiciousLogin(opts: { email: string; ipAddress: string; userAgent: string; timestamp: Date }): string {
  const { h1, bodyText, mutedNote } = emailParts;
  const content =
    h1("New sign-in from unrecognized device") +
    bodyText(`A sign-in to <strong>${escapeHtml(opts.email)}</strong> was detected from a device or location we don't recognize.`) +
    bodyText(`<strong>IP Address:</strong> ${escapeHtml(opts.ipAddress)}<br><strong>Device:</strong> ${escapeHtml(opts.userAgent.slice(0, 120))}<br><strong>Time:</strong> ${escapeHtml(opts.timestamp.toUTCString())}`) +
    mutedNote("If this was you, no action is needed. If not, change your password immediately and enable MFA.");
  return renderLayout({ title: "New sign-in detected", content });
}

export function renderSuspiciousLoginText(opts: { email: string; ipAddress: string; userAgent: string; timestamp: Date }): string {
  return renderTextLayout({
    content: `New sign-in to ${opts.email} from ${opts.ipAddress} at ${opts.timestamp.toUTCString()}.\nIf this was not you, change your password and enable MFA.`,
  });
}
