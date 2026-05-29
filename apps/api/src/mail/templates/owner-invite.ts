export function renderOwnerInvite(opts: {
  name: string;
  inviteUrl: string;
  role: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h1>Stockix team invitation</h1>
  <p>Hi ${escapeHtml(opts.name)},</p>
  <p>You have been invited to join the Stockix control plane as <strong>${escapeHtml(opts.role)}</strong>.</p>
  <p><a href="${escapeHtml(opts.inviteUrl)}">Accept invitation</a></p>
  <p style="color: #666; font-size: 14px;">This link expires in 48 hours. If you did not expect this email, you can ignore it.</p>
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
