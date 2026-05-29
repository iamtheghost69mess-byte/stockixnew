import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

function formatModuleLabel(moduleId: string): string {
  if (moduleId === "accounting") return "Accounting";
  if (moduleId === "pos") return "Point of Sale";
  if (moduleId === "pms") return "Property Management";
  if (moduleId === "chat") return "Chat";
  return moduleId;
}

function formatModules(modules: string[]): string {
  if (modules.length === 0) return "Accounting";
  return modules.map(formatModuleLabel).join(", ");
}

export function renderLicenseActivated(opts: {
  tenantName: string;
  planName: string;
  modules: string[];
  validFrom: Date;
  expiresAt: Date | null;
  isPerpetual: boolean;
  loginUrl: string;
}): string {
  const brandName = process.env.MAIL_FROM_NAME ?? "Stockix";
  const { h1, bodyText, heading, kv, infoBox, btn } = emailParts;
  const { formatDateEnGb } = emailParts;
  const expiryKv = opts.isPerpetual
    ? kv("Expires", "Never (perpetual license)")
    : opts.expiresAt
      ? kv("Expires", formatDateEnGb(opts.expiresAt))
      : "";

  const content =
    h1("Your license is active") +
    bodyText(
      `Your ${escapeHtml(brandName)} license has been assigned and is ready to use.`,
    ) +
    heading("License details") +
    infoBox(
      kv("Organization", escapeHtml(opts.tenantName)) +
        kv("Plan", escapeHtml(opts.planName)) +
        kv("Modules", escapeHtml(formatModules(opts.modules))) +
        kv("Valid from", formatDateEnGb(opts.validFrom)) +
        expiryKv,
    ) +
    btn("Go to your workspace", opts.loginUrl);

  return renderLayout({
    title: "Your license is active",
    previewText: `Your ${brandName} license for ${opts.tenantName} is now active`,
    content,
  });
}

export function renderLicenseActivatedText(opts: {
  tenantName: string;
  planName: string;
  modules: string[];
  validFrom: Date;
  expiresAt: Date | null;
  isPerpetual: boolean;
  loginUrl: string;
}): string {
  const { h1, line, section, kv, btn, blank } = textParts;
  const { formatDateEnGb } = emailParts;
  const expiryLine = opts.isPerpetual
    ? kv("Expires", "Never (perpetual license)")
    : opts.expiresAt
      ? kv("Expires", formatDateEnGb(opts.expiresAt))
      : "";

  const content = [
    h1("Your license is active"),
    line("Your license has been assigned and is ready to use."),
    section("License details"),
    kv("Organization", opts.tenantName),
    kv("Plan", opts.planName),
    kv("Modules", formatModules(opts.modules)),
    kv("Valid from", formatDateEnGb(opts.validFrom)),
    expiryLine,
    blank(),
    btn("Go to your workspace", opts.loginUrl),
  ]
    .filter(Boolean)
    .join("\n");
  return renderTextLayout({ content });
}
