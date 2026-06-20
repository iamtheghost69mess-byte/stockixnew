import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Ctx = { params: Promise<{ licenseId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { licenseId } = await ctx.params;
  const res = await apiFetch(`/v1/licenses/${licenseId}`, {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { licenseId } = await ctx.params;
  const body = await req.text();
  const res = await apiFetch(`/v1/licenses/${licenseId}`, {
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
