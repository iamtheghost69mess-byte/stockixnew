import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value ?? "";
  const res = await apiFetch("/auth/session/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken }),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  const session = (data.data as { session?: { sub: string; role: string; email: string; name: string } })?.session;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ id: session.sub, role: session.role, email: session.email, name: session.name });
}
