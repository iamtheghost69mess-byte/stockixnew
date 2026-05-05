import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET() {
  const res = await apiFetch("/tenants");
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const res = await apiFetch("/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
