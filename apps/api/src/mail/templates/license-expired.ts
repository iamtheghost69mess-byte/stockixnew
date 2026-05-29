import { renderLayout, escapeHtml, emailParts, renderTextLayout, textParts } from "./layout.js";

export function renderLicenseExpired(props: {
  tenantName: string;
  expiredAt: Date;
  gracePeriodDays: number;
  graceEndsAt: Date;
}): string {
  const brandName = process.env.MAIL_FROM_NAME ?? "Stockix";
  const { h1, bodyText, kv, dangerBox, formatDateEnGb } = emailParts;

  const content =
    h1("Your license has expired") +
    dangerBox(
      kv("Organization", escapeHtml(props.tenantName)) +
        kv("Expired on", formatDateEnGb(props.expiredAt)) +
        (props.gracePeriodDays > 0
          ? kv("Grace period ends", formatDateEnGb(props.graceEndsAt))
          : ""),
    ) +
    bodyText(
      "Your access has been suspended and your account is in read-only mode. Please renew your license or contact your administrator to restore service.",
    );

  return renderLayout({
    title: "Your license has expired",
    previewText: `Your ${brandName} license has expired — action required`,
    content,
  });
}

export function renderLicenseExpiredText(props: {
  tenantName: string;
  expiredAt: Date;
  gracePeriodDays: number;
  graceEndsAt: Date;
}): string {
  const { h1, line, kv, blank } = textParts;
  const { formatDateEnGb } = emailParts;
  const content = [
    h1("Your license has expired"),
    kv("Organization", props.tenantName),
    kv("Expired on", formatDateEnGb(props.expiredAt)),
    props.gracePeriodDays > 0
      ? kv("Grace period ends", formatDateEnGb(props.graceEndsAt))
      : "",
    blank(),
    line(
      "Your access has been suspended. Please renew your license or contact your administrator to restore service.",
    ),
  ]
    .filter(Boolean)
    .join("\n");
  return renderTextLayout({ content });
}
