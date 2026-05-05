import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ correlationId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { correlationId } = await params;
  const res = await apiFetch(`/tenants/provision-status/${correlationId}`);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
