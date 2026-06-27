import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Read process.env directly — @repo/config uses node:crypto / node:fs and cannot
// run in the Edge Runtime. These values are available as plain env vars at build time.
function readEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
}

const DEFAULT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function buildCspForRuntime(baseCsp: string): string {
  if (process.env.NODE_ENV === "production") {
    return baseCsp;
  }
  // React/Next dev tooling requires eval for source maps and stack reconstruction.
  if (baseCsp.includes("'unsafe-eval'")) {
    return baseCsp;
  }
  return baseCsp.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  const connectSrc = (() => {
    const parts = ["'self'"];
    try {
      parts.push(new URL(process.env.NEXT_PUBLIC_STOCKIX_API_URL ?? "").origin);
    } catch {}
    try {
      const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
      if (dsn) parts.push(new URL(dsn).origin);
    } catch {}
    parts.push("ws:", "wss:");
    return parts.join(" ");
  })();
  const builtCsp = buildCspForRuntime(readEnv("SECURITY_CSP_BASE", DEFAULT_CSP));
  const connectSrcDirective = `connect-src ${connectSrc}`;
  const finalCsp = builtCsp.includes("connect-src")
    ? builtCsp.replace(/connect-src[^;]*/, connectSrcDirective)
    : `${builtCsp}; ${connectSrcDirective}`;

  response.headers.set("Content-Security-Policy", finalCsp);
  response.headers.set("Strict-Transport-Security", readEnv("SECURITY_HSTS", "max-age=31536000; includeSubDomains"));
  response.headers.set("X-Frame-Options", readEnv("SECURITY_X_FRAME_OPTIONS", "DENY"));
  response.headers.set("Referrer-Policy", readEnv("SECURITY_REFERRER_POLICY", "strict-origin-when-cross-origin"));
  response.headers.set("X-Content-Type-Options", readEnv("SECURITY_X_CONTENT_TYPE_OPTIONS", "nosniff"));
  return response;
}

export async function proxy(request: NextRequest) {
  // Stale service workers from older builds hit /sw.js and slow dev (500 + retries).
  if (request.nextUrl.pathname === "/sw.js") {
    return new NextResponse(null, { status: 404 });
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
