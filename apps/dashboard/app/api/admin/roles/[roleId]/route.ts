import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-client";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ roleId: string }> },
) {
  const { roleId } = await ctx.params;
  const body = await req.text();
  const res = await apiFetch(
    `/admin/roles/${encodeURIComponent(roleId)}`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body },
    req,
  );
  const out = await res.text();
  return new NextResponse(out, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ roleId: string }> },
) {
  const { roleId } = await ctx.params;
  const res = await apiFetch(`/admin/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }, req);
  const out = await res.text();
  return new NextResponse(out, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
