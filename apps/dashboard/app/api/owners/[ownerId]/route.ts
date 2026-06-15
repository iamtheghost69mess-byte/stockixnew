import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ ownerId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { ownerId } = await params;
  const body = await req.text();
  const res = await apiFetch(`/owners/${ownerId}`, {
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

export async function DELETE(req: Request, { params }: Params) {
  const { ownerId } = await params;
  const query = new URL(req.url).search;
  const res = await apiFetch(`/owners/${ownerId}${query}`, { method: "DELETE" }, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
