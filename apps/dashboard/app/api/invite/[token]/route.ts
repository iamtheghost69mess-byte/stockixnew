import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ token: string }> };

export async function GET(_: Request, { params }: Params) {
  const { token } = await params;
  try {
    const res = await apiFetch(`/auth/invite/${token}`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }
}
