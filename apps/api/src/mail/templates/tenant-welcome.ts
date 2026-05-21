export function renderTenantWelcome(opts: {
  tenantName: string;
  organizationNumber: string;
  loginUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h1>Welcome to Stockix</h1>
  <p>Your organization <strong>${escapeHtml(opts.tenantName)}</strong> is ready.</p>
  <p>Organization number: <code>${escapeHtml(opts.organizationNumber)}</code></p>
  <p><a href="${escapeHtml(opts.loginUrl)}">Sign in to your workspace</a></p>
  <p style="color: #666; font-size: 14px;">If you did not request this account, contact your administrator.</p>
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
