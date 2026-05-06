import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  try {
    const res = await apiFetch(`/auth/mfa/status?sessionToken=${encodeURIComponent(sessionToken)}`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }
}
