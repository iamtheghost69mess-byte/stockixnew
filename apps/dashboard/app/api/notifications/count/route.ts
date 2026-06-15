import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET(req: Request) {
  const res = await apiFetch("/notifications/count", {}, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
