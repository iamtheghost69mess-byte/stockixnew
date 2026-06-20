import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ownerId: string }> },
) {
  const { ownerId } = await ctx.params;
  const res = await apiFetch(`/v1/owners/${ownerId}/resend-invite`, { method: "POST" }, req);
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
