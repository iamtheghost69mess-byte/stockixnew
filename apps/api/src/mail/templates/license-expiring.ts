import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderLicenseExpiring(props: {
  tenantName: string;
  expiresAt: Date;
  daysRemaining: number;
}): string {
  const { h1, bodyText, kv, warningBox, btn, formatDateEnGb } = emailParts;
  const dayLabel = props.daysRemaining === 1 ? "" : "s";
  const dashboardUrl = process.env.DASHBOARD_URL ?? "";

  const content =
    h1(
      `Your license expires in ${props.daysRemaining} day${dayLabel}`,
    ) +
    warningBox(
      kv("Organization", escapeHtml(props.tenantName)) +
        kv("Expires on", formatDateEnGb(props.expiresAt)) +
        kv("Days remaining", String(props.daysRemaining)),
    ) +
    bodyText(
      "Please renew your license before the expiry date to avoid any interruption to your service.",
    ) +
    (dashboardUrl ? btn("Renew License", dashboardUrl) : "");

  return renderLayout({
    title: `License expiring in ${props.daysRemaining} days`,
    previewText: `Action required — your license expires in ${props.daysRemaining} day${dayLabel}`,
    content,
  });
}

export function renderLicenseExpiringText(props: {
  tenantName: string;
  expiresAt: Date;
  daysRemaining: number;
}): string {
  const { h1, line, section, kv, btn, blank } = textParts;
  const { formatDateEnGb } = emailParts;
  const dayLabel = props.daysRemaining === 1 ? "" : "s";
  const dashboardUrl = process.env.DASHBOARD_URL ?? "";
  const content = [
    h1(`License expiring in ${props.daysRemaining} day${dayLabel}`),
    section("Action required"),
    kv("Organization", props.tenantName),
    kv("Expires on", formatDateEnGb(props.expiresAt)),
    kv("Days remaining", String(props.daysRemaining)),
    blank(),
    line(
      "Please renew your license before the expiry date to avoid any interruption to your service.",
    ),
    dashboardUrl ? btn("Renew License", dashboardUrl) : "",
  ]
    .filter(Boolean)
    .join("\n");
  return renderTextLayout({ content });
}
