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

export function renderLicenseExpired(props: {
  tenantName: string;
  expiredAt: Date;
  gracePeriodDays: number;
  graceEndsAt: Date;
}): string {
  const expiredDate = formatDate(props.expiredAt);
  const graceEndsDate = formatDate(props.graceEndsAt);
  const tenantName = escapeHtml(props.tenantName);

  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
  <h1 style="font-size: 1.25rem; margin-bottom: 1rem;">Your Stockix license has expired</h1>
  <p>Hi ${tenantName},</p>
  <p>Your Stockix license expired on <strong>${escapeHtml(expiredDate)}</strong>.</p>
  <p>
    You are currently in <strong>read-only mode</strong> — you can view
    your existing data but cannot create or edit records.
  </p>
  <p>
    Your grace period ends on <strong>${escapeHtml(graceEndsDate)}</strong>.
    After this date your account will be fully locked.
  </p>
  <p>
    Please contact your administrator to renew your license and
    restore full access.
  </p>
  <p style="color: #666; font-size: 0.875rem; margin-top: 2rem;">
    This is an automated message from Stockix.
    Please do not reply to this email.
  </p>
</body>
</html>`;
}
