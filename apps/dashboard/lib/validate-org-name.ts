/**
 * Client-side validation for organization display names (create / rename).
 * Server still enforces `z.string().min(1).max(100)` on the API; UI uses min 2 for clarity.
 */
const RESERVED = new Set(
  ["admin", "administrator", "system", "root", "support", "api", "null", "undefined"].map((s) => s.toLowerCase()),
);

export function validateOrganizationDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 2) {
    return "Name must be at least 2 characters.";
  }
  if (name.length > 100) {
    return "Name cannot exceed 100 characters.";
  }
  if (/[\u0000-\u001F\u007F]/.test(name)) {
    return "Name cannot contain control characters.";
  }
  // Letters (any script), numbers, spaces, common business punctuation
  if (!/^[\p{L}\p{N}\s._'’&,()+/#\-]+$/u.test(name)) {
    return "Use only letters, numbers, spaces, and common punctuation (. , ' - & ( ) / # +).";
  }
  if (RESERVED.has(name.toLowerCase())) {
    return "That name is reserved. Choose a different organization name.";
  }
  return null;
}
