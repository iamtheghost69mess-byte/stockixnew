import { NextRequest, NextResponse } from "next/server";

export async function middleware(_request: NextRequest) {
  // We'll handle authentication in client components instead of middleware
  // This avoids the Edge runtime issues with SQLite
  return NextResponse.next();
}

// Keep the matcher configuration for future use if needed
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/auth/login",
    "/auth/signup",
  ],
};
