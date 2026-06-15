import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ tenantId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const res = await apiFetch(`/tenants/${tenantId}/config`, {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const body = await req.text();
  const res = await apiFetch(`/tenants/${tenantId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  }, req);
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
