import { apiConfig, mailConfig } from "@repo/config";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.5px;line-height:1.2">
  ${escapeHtml(text)}
</h1>`;
}

function bodyText(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">
  ${html}
</p>`;
}

function mutedNote(text: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#94A3B8">
  ${escapeHtml(text)}
</p>`;
}

function monospaceValue(text: string): string {
  return `<code style="font-family:'Courier New',Courier,monospace;font-size:13px;background:#F1F5F9;color:#0F172A;padding:2px 7px;border-radius:4px;letter-spacing:0.02em">
  ${escapeHtml(text)}
</code>`;
}

function formatDateEnGb(dateInput: string | Date): string {
  return new Date(dateInput).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function heading(text: string): string {
  return `<p style="margin:28px 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748B">
  ${escapeHtml(text)}
</p>`;
}

function kv(label: string, value: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px">
  <tr>
    <td style="font-size:12px;color:#94A3B8;width:130px;vertical-align:top;padding-top:1px;padding-right:12px">
      ${escapeHtml(label)}
    </td>
    <td style="font-size:14px;color:#1E293B;font-weight:500;line-height:1.4">
      ${value}
    </td>
  </tr>
</table>`;
}

function btn(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
  <tr>
    <td>
      <a href="${safeUrl}"
         style="display:inline-block;background:#0F172A;color:#FFFFFF;font-size:14px;
                font-weight:600;letter-spacing:0.3px;text-decoration:none;
                padding:13px 28px;border-radius:6px;mso-padding-alt:13px 28px">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}

function infoBox(html: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0"
  style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0">
  <tr>
    <td style="padding:20px 24px">
      ${html}
    </td>
  </tr>
</table>`;
}

function warningBox(html: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0"
  style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin:20px 0">
  <tr>
    <td style="padding:20px 24px">
      ${html}
    </td>
  </tr>
</table>`;
}

function dangerBox(html: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0"
  style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:8px;margin:20px 0">
  <tr>
    <td style="padding:20px 24px">
      ${html}
    </td>
  </tr>
</table>`;
}

function divider(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
  <tr>
    <td style="border-top:1px solid #E2E8F0;font-size:0;line-height:0">&nbsp;</td>
  </tr>
</table>`;
}

export const emailParts = {
  btn,
  heading,
  kv,
  infoBox,
  warningBox,
  dangerBox,
  divider,
  h1,
  bodyText,
  mutedNote,
  monospaceValue,
  formatDateEnGb,
};

export interface RenderLayoutOptions {
  title: string;
  previewText?: string;
  content: string;
  brandName?: string;
  logoUrl?: string;
  dashboardUrl?: string;
}

export function renderLayout(options: RenderLayoutOptions): string {
  const brandName = options.brandName ?? mailConfig.fromName;
  const dashboardUrl = options.dashboardUrl ?? apiConfig.dashboardUrl;
  const logoUrl =
    options.logoUrl ??
    (dashboardUrl
      ? `${dashboardUrl.replace(/\/+$/, "")}/stockix-logo.svg`
      : "");

  const safeTitle = escapeHtml(options.title);
  const safeBrand = escapeHtml(brandName);
  const previewText = options.previewText ?? options.title;
  const safePreview = escapeHtml(previewText);
  const year = new Date().getFullYear();

  const headerContent = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeBrand}" height="32" style="display:block;border:0;height:32px">`
    : `<span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:-0.5px">${safeBrand}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F1F5F9;line-height:1px">
    ${safePreview}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 16px">
    <tr>
      <td align="center">
        <!--[if mso]><table width="600"><tr><td><![endif]-->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

          <tr>
            <td style="background:#0F172A;padding:20px 32px;border-radius:8px 8px 0 0">
              ${headerContent}
            </td>
          </tr>

          <tr>
            <td style="background:#FFFFFF;padding:40px 40px 32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">
              ${options.content}
            </td>
          </tr>

          <tr>
            <td style="background:#F8FAFC;padding:24px 40px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px">
              <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
                &copy; ${year} ${safeBrand}. All rights reserved.<br>
                You're receiving this because you have an account on ${safeBrand}.
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>

</body>
</html>`;
}

export interface RenderTextLayoutOptions {
  brandName?: string;
  content: string;
  dashboardUrl?: string;
}

export function renderTextLayout(options: RenderTextLayoutOptions): string {
  const brandName =
    options.brandName ?? mailConfig.fromName;
  const dashboardUrl =
    options.dashboardUrl ?? apiConfig.dashboardUrl;
  const year = new Date().getFullYear();

  return [
    options.content.trim(),
    "",
    "---",
    `© ${year} ${brandName}. All rights reserved.`,
    dashboardUrl ? `${dashboardUrl}` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export const textParts = {
  h1: (text: string) => `${text}\n${"=".repeat(Math.min(text.length, 60))}\n`,
  section: (label: string) => `\n${label.toUpperCase()}\n${"-".repeat(label.length)}`,
  line: (text: string) => `${text}`,
  kv: (label: string, value: string) => `${label}: ${value}`,
  btn: (label: string, url: string) => `${label}: ${url}`,
  divider: () => "\n---\n",
  blank: () => "",
  note: (text: string) => `Note: ${text}`,
  box: (lines: string[]) => ["", ...lines.map((l) => `  ${l}`), ""].join("\n"),
};
