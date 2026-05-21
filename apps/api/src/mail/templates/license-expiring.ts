export function renderLicenseExpiring(opts: {
  tenantName: string;
  expiresAt: Date;
  gracePeriodDays: number;
}): string {
  const expiresLabel = opts.expiresAt.toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h1>Your Stockix license expires soon</h1>
  <p>The license for <strong>${escapeHtml(opts.tenantName)}</strong> expired on ${escapeHtml(expiresLabel)}.</p>
  <p>You are in a grace period of ${opts.gracePeriodDays} day(s). Renew soon to avoid service interruption.</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
