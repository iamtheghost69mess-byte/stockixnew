export type MailFromInput =
  | string
  | { name?: string; address?: string }
  | undefined
  | null;

/**
 * Formats a from address for Nodemailer / Resend ("Name <email@domain.com>").
 */
export function formatMailFrom(
  from?: MailFromInput,
  fallbackName = process.env.MAIL_FROM_NAME,
  fallbackAddress = process.env.MAIL_FROM_ADDRESS,
): string {
  if (typeof from === 'string' && from.trim().length > 0) {
    return from.includes('<') ? from : formatMailFrom(undefined, undefined, from);
  }
  if (from && typeof from === 'object') {
    const name = from.name ?? fallbackName ?? 'Stockix';
    const address = from.address ?? fallbackAddress ?? '';
    return `${name} <${address}>`;
  }
  const name = fallbackName ?? 'Stockix';
  const address = fallbackAddress ?? '';
  return `${name} <${address}>`;
}

/**
 * Resolves the first entry from transactional mail `from` options.
 */
export function formatMailFromList(
  fromList?: Array<string | { name?: string; address?: string }>,
): string {
  const first = fromList?.[0];
  return formatMailFrom(first);
}
