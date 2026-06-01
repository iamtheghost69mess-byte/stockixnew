import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

function formatModuleLabel(moduleId: string): string {
  if (moduleId === "accounting") return "Accounting";
  if (moduleId === "pos") return "Point of Sale";
  if (moduleId === "pms") return "Property Management";
  if (moduleId === "chat") return "Chat";
  return moduleId;
}

export function renderFinanceWelcome(opts: {
  tenantName: string;
  financeUrl: string;
  adminEmail: string;
  oneTimePassword: string;
  modules: string[];
}): string {
  const { h1, bodyText, kv, infoBox, btn, mutedNote, monospaceValue } =
    emailParts;
  const loginUrl = `${opts.financeUrl.replace(/\/+$/, "")}/auth/login`;
  const safeFinanceUrl = escapeHtml(opts.financeUrl);
  const modulesHtml =
    opts.modules.length > 0
      ? kv(
          "Modules",
          escapeHtml(opts.modules.map(formatModuleLabel).join(", ")),
        )
      : "";

  const content =
    h1("Your Finance account is ready") +
    bodyText(
      "Here are your login credentials. You will be prompted to set a new password on first login.",
    ) +
    infoBox(
      kv("Organization", escapeHtml(opts.tenantName)) +
        kv(
          "Finance URL",
          `<a href="${safeFinanceUrl}" style="color:#0F172A;text-decoration:underline">${safeFinanceUrl}</a>`,
        ) +
        kv("Admin email", escapeHtml(opts.adminEmail)) +
        kv("Temp password", monospaceValue(opts.oneTimePassword)) +
        modulesHtml,
    ) +
    btn("Open Finance Dashboard", loginUrl) +
    mutedNote(
      "This is a one-time password. You will be required to change it immediately after your first login.",
    );

  return renderLayout({
    title: "Your Finance account is ready",
    previewText: `Your finance account credentials for ${opts.tenantName}`,
    content,
  });
}

export function renderFinanceWelcomeText(opts: {
  tenantName: string;
  financeUrl: string;
  adminEmail: string;
  oneTimePassword: string;
  modules: string[];
}): string {
  const { h1, line, section, kv, btn, blank, note } = textParts;
  const loginUrl = `${opts.financeUrl.replace(/\/+$/, "")}/auth/login`;
  const modulesLine =
    opts.modules.length > 0
      ? kv("Modules", opts.modules.map(formatModuleLabel).join(", "))
      : "";
  const content = [
    h1("Your Finance account is ready"),
    line(
      "Here are your login credentials. You will be required to set a new password immediately after your first login.",
    ),
    section("Your credentials"),
    kv("Organization", opts.tenantName),
    kv("Finance URL", opts.financeUrl),
    kv("Admin email", opts.adminEmail),
    kv("Temp password", opts.oneTimePassword),
    modulesLine,
    blank(),
    btn("Open Finance Dashboard", loginUrl),
    blank(),
    note(
      "This is a one-time password. You will be required to change it on first login.",
    ),
  ]
    .filter(Boolean)
    .join("\n");
  return renderTextLayout({ content });
}
