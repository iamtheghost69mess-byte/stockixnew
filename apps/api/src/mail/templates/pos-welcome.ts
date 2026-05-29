import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderPosWelcome(opts: {
  tenantName: string;
  posUrl: string;
  credentials: Array<{ role: string; username: string; pin: string }>;
}): string {
  const { h1, bodyText, heading, kv, infoBox, btn, monospaceValue } =
    emailParts;

  const credentialBlocks = opts.credentials
    .map(
      (c) =>
        infoBox(
          heading(c.role) +
            kv("Username", escapeHtml(c.username)) +
            kv("PIN", monospaceValue(c.pin)),
        ),
    )
    .join("");

  const content =
    h1("Your POS system is ready") +
    bodyText(
      `Here are the login credentials for <strong style="color:#0F172A">${escapeHtml(opts.tenantName)}</strong>. Share them with the relevant staff members.`,
    ) +
    credentialBlocks +
    btn("Open POS", opts.posUrl);

  return renderLayout({
    title: "Your POS system is ready",
    previewText: `POS credentials ready for ${opts.tenantName}`,
    content,
  });
}

export function renderPosWelcomeText(opts: {
  tenantName: string;
  posUrl: string;
  credentials: Array<{ role: string; username: string; pin: string }>;
}): string {
  const { h1, line, section, kv, btn, blank } = textParts;
  const credentialBlocks = opts.credentials
    .map(
      (c) =>
        [
          section(c.role),
          kv("Username", c.username),
          kv("PIN", c.pin),
        ].join("\n"),
    )
    .join("\n");
  const content = [
    h1("Your POS system is ready"),
    line(
      `Here are the login credentials for ${opts.tenantName}. Share them with the relevant staff members.`,
    ),
    blank(),
    credentialBlocks,
    blank(),
    btn("Open POS", opts.posUrl),
  ].join("\n");
  return renderTextLayout({ content });
}
