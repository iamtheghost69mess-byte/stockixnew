import { renderLayout, escapeHtml, emailParts, renderTextLayout } from "./layout.js";

export function renderModuleAdded(opts: {
  tenantName: string;
  moduleName: string;
  moduleUrl?: string;
}): string {
  const { h1, bodyText, btn } = emailParts;
  const content =
    h1(`${escapeHtml(opts.moduleName)} module activated`) +
    bodyText(
      `The <strong>${escapeHtml(opts.moduleName)}</strong> module has been successfully activated for <strong>${escapeHtml(opts.tenantName)}</strong>.`,
    ) +
    (opts.moduleUrl ? btn(`Open ${escapeHtml(opts.moduleName)}`, opts.moduleUrl) : "");
  return renderLayout({ title: `${opts.moduleName} module activated`, content });
}

export function renderModuleAddedText(opts: {
  tenantName: string;
  moduleName: string;
  moduleUrl?: string;
}): string {
  const parts = [`${opts.moduleName} module activated for ${opts.tenantName}.`];
  if (opts.moduleUrl) parts.push(`Access it at: ${opts.moduleUrl}`);
  return renderTextLayout({ content: parts.join("\n") });
}

export function renderModuleRemoved(opts: {
  tenantName: string;
  moduleName: string;
}): string {
  const { h1, bodyText } = emailParts;
  const content =
    h1(`${escapeHtml(opts.moduleName)} module removed`) +
    bodyText(
      `The <strong>${escapeHtml(opts.moduleName)}</strong> module has been deactivated for <strong>${escapeHtml(opts.tenantName)}</strong>. All associated data has been preserved.`,
    );
  return renderLayout({ title: `${opts.moduleName} module removed`, content });
}

export function renderModuleRemovedText(opts: {
  tenantName: string;
  moduleName: string;
}): string {
  return renderTextLayout({
    content: `${opts.moduleName} module removed from ${opts.tenantName}.\nAll associated data has been preserved.`,
  });
}
