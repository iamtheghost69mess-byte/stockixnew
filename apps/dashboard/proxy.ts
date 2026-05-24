import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dashboardConfig } from "@repo/config";

function buildCspForRuntime(baseCsp: string): string {
  if (dashboardConfig.nodeEnv === "production") {
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
    try {
      const apiOrigin = new URL(dashboardConfig.nextPublicApiUrl).origin;
      return `'self' ${apiOrigin} ws: wss:`;
    } catch {
      return "'self' ws: wss:";
    }
  })();
  response.headers.set(
    "Content-Security-Policy",
    `${buildCspForRuntime(dashboardConfig.securityCspBase)}; connect-src ${connectSrc}`,
  );
  response.headers.set("Strict-Transport-Security", dashboardConfig.securityHsts);
  response.headers.set("X-Frame-Options", dashboardConfig.securityXFrameOptions);
  response.headers.set("Referrer-Policy", dashboardConfig.securityReferrerPolicy);
  response.headers.set("X-Content-Type-Options", dashboardConfig.securityXContentTypeOptions);
  return response;
}

export async function proxy(request: NextRequest) {
  void request;
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
