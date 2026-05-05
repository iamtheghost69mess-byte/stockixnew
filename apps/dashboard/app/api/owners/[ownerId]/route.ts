import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ ownerId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { ownerId } = await params;
  const query = new URL(req.url).search;
  const res = await apiFetch(`/owners/${ownerId}${query}`, { method: "DELETE" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
