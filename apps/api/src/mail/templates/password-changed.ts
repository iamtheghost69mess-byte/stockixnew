import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderPasswordChanged(opts: { name?: string }): string {
  const { h1, bodyText, warningBox } = emailParts;

  const content =
    h1("Your password was changed") +
    bodyText(
      `Hi ${escapeHtml(opts.name || "there")}, the password for your account has been successfully updated.`,
    ) +
    warningBox(
      `<p style="margin:0;font-size:14px;color:#92400E;line-height:1.5">
        If you did not make this change, please reset your password immediately and contact support.
      </p>`,
    );

  return renderLayout({
    title: "Your password was changed",
    previewText: "Your account password has been changed",
    content,
  });
}

export function renderPasswordChangedText(opts: { name?: string }): string {
  const { h1, line, blank } = textParts;
  const content = [
    h1("Your password was changed"),
    line(`Hi ${opts.name || "there"},`),
    line("The password for your account has been successfully updated."),
    blank(),
    "IMPORTANT: If you did not make this change, please reset your password",
    "immediately and contact support.",
  ].join("\n");
  return renderTextLayout({ content });
}
