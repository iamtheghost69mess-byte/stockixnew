import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ token: string }> };

export async function GET(_: Request, { params }: Params) {
  const { token } = await params;
  const res = await apiFetch(`/v1/auth/invite/${token}`, {}, _);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
