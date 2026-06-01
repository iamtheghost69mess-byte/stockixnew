import { mailConfig } from "@repo/config";
import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderOwnerInvite(opts: {
  name: string;
  inviteUrl: string;
  role: string;
}): string {
  const brandName = mailConfig.fromName;
  const { h1, bodyText, btn, mutedNote } = emailParts;

  const content =
    h1(`You've been invited to ${brandName}`) +
    bodyText(
      `Hi ${escapeHtml(opts.name || "there")}, you have been invited as <strong style="color:#0F172A">${escapeHtml(opts.role)}</strong> on the ${escapeHtml(brandName)} platform.`,
    ) +
    btn("Accept Invitation", opts.inviteUrl) +
    mutedNote(
      "This invitation link expires in 48 hours. If you did not expect this invitation, you can safely ignore this email.",
    );

  return renderLayout({
    title: `You've been invited to join ${brandName}`,
    previewText: `You have a pending invitation to join ${brandName}`,
    content,
  });
}

export function renderOwnerInviteText(opts: {
  name: string;
  inviteUrl: string;
  role: string;
}): string {
  const brandName = mailConfig.fromName;
  const { h1, line, btn, blank, note } = textParts;
  const content = [
    h1(`You've been invited to ${brandName}`),
    line(`Hi ${opts.name || "there"},`),
    blank(),
    line(`You have been invited as ${opts.role} on the ${brandName} platform.`),
    blank(),
    btn("Accept Invitation", opts.inviteUrl),
    blank(),
    note(
      "This invitation link expires in 48 hours. If you did not expect this invitation, you can safely ignore this email.",
    ),
  ].join("\n");
  return renderTextLayout({ content });
}
