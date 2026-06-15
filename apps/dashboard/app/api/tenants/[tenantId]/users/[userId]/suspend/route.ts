import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Ctx = { params: Promise<{ tenantId: string; userId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { tenantId, userId } = await ctx.params;
  const res = await apiFetch(
    `/tenants/${tenantId}/users/${userId}/suspend`,
    { method: "POST" },
    req,
  );
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
