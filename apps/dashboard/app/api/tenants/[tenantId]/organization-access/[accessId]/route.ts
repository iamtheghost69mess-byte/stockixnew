import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Ctx = { params: Promise<{ tenantId: string; accessId: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const { tenantId, accessId } = await ctx.params;
  const res = await apiFetch(`/tenants/${tenantId}/organization-access/${accessId}`, {
    method: "DELETE",
  }, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
