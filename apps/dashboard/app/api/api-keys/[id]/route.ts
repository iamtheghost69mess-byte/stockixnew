import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-client";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await apiFetch(`/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
