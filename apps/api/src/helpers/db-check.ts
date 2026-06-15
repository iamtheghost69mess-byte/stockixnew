import type { Context } from "hono";

/**
 * Type guard that returns a 503 response when db is null/undefined.
 * Use as an early-return guard at the top of route handlers.
 */
export function requireDb<T>(
  db: T | null | undefined,
  c: Context,
): db is T {
  if (!db) {
    c.json({ error: "DATABASE_URL is not configured" }, 503);
    return false;
  }
  return true;
}
