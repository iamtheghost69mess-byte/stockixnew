export function renderPasswordReset(opts: {
  name?: string;
  resetUrl: string;
}): string {
  const greeting = opts.name
    ? `Hi ${escapeHtml(opts.name)},`
    : "Hi,";
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h1>Reset your Stockix password</h1>
  <p>${greeting}</p>
  <p>We received a request to reset the password for your Stockix owner account.</p>
  <p><a href="${escapeHtml(opts.resetUrl)}">Choose a new password</a></p>
  <p style="color: #666; font-size: 14px;">This link expires in one hour. If you did not request a reset, you can ignore this email.</p>
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
