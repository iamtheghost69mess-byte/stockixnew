import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function POST(req: Request, ctx: { params: Promise<{ licenseId: string }> }) {
  const { licenseId } = await ctx.params;
  const res = await apiFetch(`/licenses/${licenseId}/reactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }, req);
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
