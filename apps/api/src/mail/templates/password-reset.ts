import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderPasswordReset(opts: {
  name?: string;
  resetUrl: string;
}): string {
  const { h1, bodyText, btn, mutedNote } = emailParts;

  const content =
    h1("Reset your password") +
    bodyText(
      opts.name
        ? `Hi ${escapeHtml(opts.name)}, we received a request to reset the password for your account. Click the button below to set a new one.`
        : "We received a request to reset the password for your account. Click the button below to set a new one.",
    ) +
    btn("Reset Password", opts.resetUrl) +
    mutedNote(
      "This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will not be changed.",
    );

  return renderLayout({
    title: "Reset your password",
    previewText: "Reset your account password",
    content,
  });
}

export function renderPasswordResetText(opts: {
  name?: string;
  resetUrl: string;
}): string {
  const { h1, line, btn, blank, note } = textParts;
  const content = [
    h1("Reset your password"),
    opts.name
      ? line(
          `Hi ${opts.name}, we received a request to reset the password for your account.`,
        )
      : line("We received a request to reset the password for your account."),
    blank(),
    btn("Reset Password", opts.resetUrl),
    blank(),
    note(
      "This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password will not be changed.",
    ),
  ].join("\n");
  return renderTextLayout({ content });
}
