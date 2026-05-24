function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function renderLicenseExpiring(props: {
  tenantName: string;
  expiresAt: Date;
  daysRemaining: number;
}): string {
  const expiresDate = formatDate(props.expiresAt);
  const dayLabel = props.daysRemaining === 1 ? "day" : "days";
  const tenantName = escapeHtml(props.tenantName);

  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
  <h1 style="font-size: 1.25rem; margin-bottom: 1rem;">Your Stockix license expires soon</h1>
  <p>Hi ${tenantName},</p>
  <p>
    Your Stockix license will expire in
    <strong>${props.daysRemaining} ${dayLabel}</strong>
    on <strong>${escapeHtml(expiresDate)}</strong>.
  </p>
  <p>
    To avoid any interruption to your service, please renew your
    license before the expiry date.
  </p>
  <p>
    After expiry you will have a grace period during which your
    account will be read-only. After the grace period ends your
    account will be fully locked.
  </p>
  <p>Please contact your administrator to renew.</p>
  <p style="color: #666; font-size: 0.875rem; margin-top: 2rem;">
    This is an automated message from Stockix.
    Please do not reply to this email.
  </p>
</body>
</html>`;
}
