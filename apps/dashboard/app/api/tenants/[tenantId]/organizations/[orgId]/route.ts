import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ tenantId: string; orgId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { tenantId, orgId } = await params;
  const res = await apiFetch(`/tenants/${tenantId}/organizations/${orgId}`, {}, _);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { tenantId, orgId } = await params;
  const body = await req.text();
  const res = await apiFetch(`/tenants/${tenantId}/organizations/${orgId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  }, req);
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const { tenantId, orgId } = await params;
  const query = new URL(req.url).search;
  const res = await apiFetch(
    `/tenants/${tenantId}/organizations/${orgId}${query}`,
    { method: "DELETE" },
    req,
  );
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
