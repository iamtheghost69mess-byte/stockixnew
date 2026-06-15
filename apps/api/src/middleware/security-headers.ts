import type { Context, Next } from "hono";
import { apiConfig } from "@repo/config";

/**
 * Applies production security headers to every API response (aligned with dashboard proxy.ts).
 */
export async function securityHeadersMiddleware(c: Context, next: Next) {
  await next();
  if (apiConfig.nodeEnv !== "production") {
    return;
  }
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
}
