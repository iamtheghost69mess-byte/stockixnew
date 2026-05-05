import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ tenantId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const query = new URL(req.url).search;
  const res = await apiFetch(`/tenants/${tenantId}${query}`, { method: "DELETE" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
