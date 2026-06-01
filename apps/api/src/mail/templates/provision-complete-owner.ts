import { mailConfig } from "@repo/config";
import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

function formatModuleLabel(moduleId: string): string {
  if (moduleId === "accounting") return "Accounting";
  if (moduleId === "pos") return "Point of Sale";
  if (moduleId === "pms") return "Property Management";
  if (moduleId === "chat") return "Chat";
  return moduleId;
}

function formatModules(modules: string[]): string {
  if (modules.length === 0) return "—";
  return modules.map(formatModuleLabel).join(", ");
}

function formatPlanLabel(planSlug: string): string {
  return planSlug.charAt(0).toUpperCase() + planSlug.slice(1).replace(/-/g, " ");
}

export function renderProvisionCompleteOwner(opts: {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  planSlug: string;
  modules: string[];
  tenantDashboardUrl: string;
}): string {
  const brandName = mailConfig.fromName;
  const { h1, bodyText, heading, kv, infoBox, btn } = emailParts;

  const content =
    h1("Tenant provisioned successfully") +
    bodyText(
      `A new tenant on ${escapeHtml(brandName)} has finished provisioning and is ready to use.`,
    ) +
    heading("Tenant details") +
    infoBox(
      kv("Organization", escapeHtml(opts.tenantName)) +
        kv("Slug", escapeHtml(opts.tenantSlug)) +
        kv("Admin email", escapeHtml(opts.adminEmail)) +
        kv("Plan", escapeHtml(formatPlanLabel(opts.planSlug))) +
        kv("Modules", escapeHtml(formatModules(opts.modules))),
    ) +
    btn("View tenant", opts.tenantDashboardUrl);

  return renderLayout({
    title: "Tenant provisioned successfully",
    previewText: `${opts.tenantName} is ready on ${brandName}`,
    content,
  });
}

export function renderProvisionCompleteOwnerText(opts: {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  planSlug: string;
  modules: string[];
  tenantDashboardUrl: string;
}): string {
  const { h1, line, section, kv, btn, blank } = textParts;

  const content = [
    h1("Tenant provisioned successfully"),
    line("A new tenant has finished provisioning and is ready to use."),
    section("Tenant details"),
    kv("Organization", opts.tenantName),
    kv("Slug", opts.tenantSlug),
    kv("Admin email", opts.adminEmail),
    kv("Plan", formatPlanLabel(opts.planSlug)),
    kv("Modules", formatModules(opts.modules)),
    blank(),
    btn("View tenant", opts.tenantDashboardUrl),
  ].join("\n");
  return renderTextLayout({ content });
}
