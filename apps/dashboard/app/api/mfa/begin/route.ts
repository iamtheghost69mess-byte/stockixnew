import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { apiFetch } from "@/lib/api-client";

export async function POST() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  try {
    const res = await apiFetch("/auth/mfa/begin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }
}
