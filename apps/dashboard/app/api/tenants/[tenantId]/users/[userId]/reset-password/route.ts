import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Ctx = { params: Promise<{ tenantId: string; userId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { tenantId, userId } = await ctx.params;
  const payload = await req.text();
  const res = await apiFetch(
    `/tenants/${tenantId}/users/${userId}/reset-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    },
    req,
  );
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
