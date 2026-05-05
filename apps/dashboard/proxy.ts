import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { eq } from "drizzle-orm";

import { ROLE, ROLE_RANK } from "@/lib/roles";
import {
  RECENT_AUTH_COOKIE,
  SESSION_COOKIE,
  verifyRecentAuthToken,
  verifySession,
} from "@/lib/session";

const proxyDatabaseUrl = process.env.DATABASE_URL;
const proxyDb = proxyDatabaseUrl ? createDb(proxyDatabaseUrl) : null;

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:4000 ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function requiredRole(
  pathname: string,
  method: string,
): keyof typeof ROLE_RANK | null {
  if (
    pathname === "/login" ||
    pathname === "/accept-invite" ||
    pathname === "/api/login" ||
    pathname === "/api/verify-mfa" ||
    pathname === "/api/invite/accept" ||
    pathname.startsWith("/api/invite/")
  ) {
    return null;
  }
  if (pathname.startsWith("/api/owners")) {
    if (method === "GET") return ROLE.READ_ONLY;
    return ROLE.SUPER_ADMIN;
  }
  if (pathname.startsWith("/api/tenants")) {
    if (pathname.includes("/provision")) {
      return ROLE.SUPPORT_AGENT;
    }
    if (method === "GET") return ROLE.READ_ONLY;
    return ROLE.SUPER_ADMIN;
  }
  if (
    pathname === "/" ||
    pathname === "/tenants" ||
    pathname.startsWith("/tenants/") ||
    pathname === "/owners"
  ) {
    return ROLE.READ_ONLY;
  }
  if (pathname.includes("/provision") || pathname.includes("/sync")) {
    return ROLE.SUPPORT_AGENT;
  }
  if (pathname.startsWith("/owners/") && pathname.endsWith("/delete")) {
    return ROLE.SUPER_ADMIN;
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return ROLE.SUPER_ADMIN;
  }
  return ROLE.READ_ONLY;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const staleLogin = request.nextUrl.searchParams.get("stale") === "1";
  const forbiddenLogin = request.nextUrl.searchParams.get("forbidden") === "1";
  const method = request.method.toUpperCase();
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifySession(token) : null;
  const recentAuthToken = request.cookies.get(RECENT_AUTH_COOKIE)?.value ?? "";

  if (pathname.startsWith("/login")) {
    // Allow rendering the login page for stale/forbidden sessions to avoid redirect loops.
    if (session && !staleLogin && !forbiddenLogin) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/", request.url)));
    }
    return withSecurityHeaders(NextResponse.next());
  }

  const minRole = requiredRole(pathname, method);
  if (!session && minRole !== null) {
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if (session && minRole !== null) {
    if (!(session.role in ROLE_RANK)) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(NextResponse.json({ error: "forbidden" }, { status: 403 }));
      }
      const url = new URL("/", request.url);
      url.searchParams.set("forbidden", "1");
      return withSecurityHeaders(NextResponse.redirect(url));
    }
    const rank = ROLE_RANK[session.role];
    if (rank < ROLE_RANK[minRole]) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(NextResponse.json({ error: "forbidden" }, { status: 403 }));
      }
      const url = new URL("/", request.url);
      url.searchParams.set("forbidden", "1");
      return withSecurityHeaders(NextResponse.redirect(url));
    }

    if (!proxyDb) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Auth database not configured" }, { status: 503 }),
      );
    }
    const rows = await proxyDb
      .select({
        id: owners.id,
        role: owners.role,
        status: owners.status,
        sessionVersion: owners.sessionVersion,
        mfaEnabled: owners.mfaEnabled,
      })
      .from(owners)
      .where(eq(owners.id, session.sub))
      .limit(1);
    const owner = rows[0];
    if (!owner || owner.status !== "active") {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(NextResponse.json({ error: "forbidden" }, { status: 403 }));
      }
      const url = new URL("/login", request.url);
      url.searchParams.set("forbidden", "1");
      return withSecurityHeaders(NextResponse.redirect(url));
    }
    if (owner.role !== session.role || owner.sessionVersion !== session.sessionVersion) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(
          NextResponse.json({ error: "session_stale" }, { status: 401 }),
        );
      }
      const url = new URL("/login", request.url);
      url.searchParams.set("stale", "1");
      return withSecurityHeaders(NextResponse.redirect(url));
    }
    const ownersWrite =
      pathname.startsWith("/api/owners") &&
      ["POST", "PATCH", "DELETE"].includes(method);
    const tenantDangerous =
      /^\/api\/tenants\/[^/]+(?:\/(?:suspend|reactivate))?$/.test(pathname) &&
      ["POST", "PATCH", "DELETE"].includes(method);
    const requiresRecentAuth = ownersWrite || tenantDangerous;
    if (requiresRecentAuth) {
      const recentOwnerId = recentAuthToken
        ? await verifyRecentAuthToken(recentAuthToken)
        : null;
      if (recentOwnerId !== session.sub) {
        return withSecurityHeaders(
          NextResponse.json({ error: "reauth_required" }, { status: 401 }),
        );
      }
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
