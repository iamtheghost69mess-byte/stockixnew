export function renderLicenseExpired(opts: {
  tenantName: string;
  expiresAt: Date | null;
}): string {
  const expiresLabel = opts.expiresAt
    ? opts.expiresAt.toLocaleDateString(undefined, { dateStyle: "medium" })
    : "N/A";
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h1>Your Stockix license has expired</h1>
  <p>The license for <strong>${escapeHtml(opts.tenantName)}</strong> is no longer active (expired ${escapeHtml(expiresLabel)}).</p>
  <p>Contact your platform administrator to renew.</p>
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
