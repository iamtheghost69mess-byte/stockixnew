import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderOrgAdminAccess(opts: {
  orgName: string;
  orgUrl: string;
}): string {
  const { h1, bodyText, kv, infoBox, btn, mutedNote } = emailParts;
  const loginUrl = `${opts.orgUrl.replace(/\/+$/, "")}/auth/login`;
  const safeOrgUrl = escapeHtml(opts.orgUrl);

  const content =
    h1("A new organization is ready") +
    bodyText(
      `The organization <strong>${escapeHtml(opts.orgName)}</strong> has been provisioned on your account. You can access it immediately — no new password is required.`,
    ) +
    infoBox(
      kv("Organization", escapeHtml(opts.orgName)) +
        kv(
          "Finance URL",
          `<a href="${safeOrgUrl}" style="color:#0F172A;text-decoration:underline">${safeOrgUrl}</a>`,
        ),
    ) +
    btn(`Open ${opts.orgName}`, loginUrl) +
    mutedNote(
      "Log in with your existing email and password. Once inside, use the organization switcher to move between your organizations.",
    );

  return renderLayout({
    title: `New organization ready — ${opts.orgName}`,
    previewText: `${opts.orgName} is ready — access it now with your existing credentials`,
    content,
  });
}

export function renderOrgAdminAccessText(opts: {
  orgName: string;
  orgUrl: string;
}): string {
  const { h1, line, kv, btn, blank, note } = textParts;
  const loginUrl = `${opts.orgUrl.replace(/\/+$/, "")}/auth/login`;
  const content = [
    h1(`New organization ready — ${opts.orgName}`),
    line(
      `The organization "${opts.orgName}" has been provisioned on your account. No new password is required.`,
    ),
    blank(),
    kv("Organization", opts.orgName),
    kv("Finance URL", opts.orgUrl),
    blank(),
    btn(`Open ${opts.orgName}`, loginUrl),
    blank(),
    note(
      "Log in with your existing email and password. Use the organization switcher inside Finance to move between your organizations.",
    ),
  ]
    .filter(Boolean)
    .join("\n");
  return renderTextLayout({ content });
}
