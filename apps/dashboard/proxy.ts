import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ROLE, ROLE_RANK } from "@/lib/roles";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

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
  const method = request.method.toUpperCase();
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifySession(token) : null;

  if (pathname.startsWith("/login")) {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  const minRole = requiredRole(pathname, method);
  if (!session && minRole !== null) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (session && minRole !== null) {
    if (!(session.role in ROLE_RANK)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const url = new URL("/", request.url);
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
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
