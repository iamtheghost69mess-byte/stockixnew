import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = await apiFetch(`/v1/admin/email-logs${url.search}`, {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
