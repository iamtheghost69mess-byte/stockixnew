import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Ctx = { params: Promise<{ licenseId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { licenseId } = await ctx.params;
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const path = qs ? `/licenses/${licenseId}/history?${qs}` : `/licenses/${licenseId}/history`;
  const res = await apiFetch(path, {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
