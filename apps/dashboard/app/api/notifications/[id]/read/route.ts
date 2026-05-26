import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/notifications/${id}/read`, { method: "POST" }, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
