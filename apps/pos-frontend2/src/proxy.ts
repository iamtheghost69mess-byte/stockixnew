import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Root `/` only exists for SaaS "open tenant" links (`/?org=slug`). A server page that
 * immediately `redirect()` caused `performance.measure("Home", ...)` to throw (negative
 * duration) in Next.js, so we handle the hop in proxy.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/") {
    return NextResponse.next();
  }

  const org = searchParams.get("org");
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const trimmed = org?.trim();
  if (trimmed) {
    url.searchParams.set("org", trimmed);
  }

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/"],
};
