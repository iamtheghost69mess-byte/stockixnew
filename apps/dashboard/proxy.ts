import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";

const ROLE_RANK = {
  read_only: 0,
  billing_manager: 1,
  support_agent: 2,
  super_admin: 3,
} as const;

function requiredRole(pathname: string): keyof typeof ROLE_RANK | null {
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
  if (
    pathname === "/" ||
    pathname === "/tenants" ||
    pathname.startsWith("/tenants/") ||
    pathname === "/owners"
  ) {
    return "read_only";
  }
  if (pathname.includes("/provision") || pathname.includes("/sync")) {
    return "support_agent";
  }
  if (pathname.startsWith("/owners/") && pathname.endsWith("/delete")) {
    return "super_admin";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "super_admin";
  }
  return "read_only";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifySession(token) : null;

  if (pathname.startsWith("/login")) {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  const minRole = requiredRole(pathname);
  if (!session && minRole !== null) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (session && minRole !== null) {
    const rank = ROLE_RANK[session.role];
    if (rank < ROLE_RANK[minRole]) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const url = new URL("/", request.url);
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
