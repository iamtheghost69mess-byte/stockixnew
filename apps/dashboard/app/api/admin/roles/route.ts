import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-client";

export async function GET(req: Request) {
  const res = await apiFetch("/v1/admin/roles", {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const res = await apiFetch(
    "/admin/roles",
    { method: "POST", headers: { "content-type": "application/json" }, body },
    req,
  );
  const out = await res.text();
  return new NextResponse(out, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
