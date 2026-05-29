import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderTenantWelcome(opts: {
  tenantName: string;
  organizationNumber: string;
  loginUrl: string;
}): string {
  const brandName = process.env.MAIL_FROM_NAME ?? "Stockix";
  const { h1, bodyText, heading, kv, infoBox, btn } = emailParts;

  const content =
    h1(`Welcome to ${brandName}`) +
    bodyText("Your account has been set up and is ready to use.") +
    heading("Your account details") +
    infoBox(
      kv("Organization", escapeHtml(opts.tenantName)) +
        kv("Reference no.", escapeHtml(opts.organizationNumber)),
    ) +
    btn("Go to your dashboard", opts.loginUrl);

  return renderLayout({
    title: `Welcome to ${brandName}`,
    previewText: `Your ${brandName} account is ready`,
    content,
  });
}

export function renderTenantWelcomeText(opts: {
  tenantName: string;
  organizationNumber: string;
  loginUrl: string;
}): string {
  const brandName = process.env.MAIL_FROM_NAME ?? "Stockix";
  const { h1, line, section, kv, btn, blank } = textParts;
  const content = [
    h1(`Welcome to ${brandName}`),
    line("Your account has been set up and is ready to use."),
    section("Your account details"),
    kv("Organization", opts.tenantName),
    kv("Reference no.", opts.organizationNumber),
    blank(),
    btn("Go to your dashboard", opts.loginUrl),
  ].join("\n");
  return renderTextLayout({ content });
}
