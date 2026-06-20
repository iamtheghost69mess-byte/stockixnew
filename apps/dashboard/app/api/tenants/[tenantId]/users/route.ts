import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { tenantId } = await ctx.params;
  const res = await apiFetch(`/v1/tenants/${tenantId}/users`, {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { tenantId } = await ctx.params;
  const payload = await req.text();
  const res = await apiFetch(
    `/tenants/${tenantId}/users`,
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
