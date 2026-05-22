import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ path: string[] }> };

async function forward(req: Request, params: Params, method: string) {
  const { path } = await params.params;
  const segment = path.join("/");
  const url = new URL(req.url);
  const query = url.search;
  const target = `/pms/api/${segment}${query}`;
  const init: RequestInit = { method };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.text();
    init.headers = { "Content-Type": req.headers.get("content-type") ?? "application/json" };
  }
  const res = await apiFetch(target, init, req);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: Request, params: Params) {
  return forward(req, params, "GET");
}

export async function POST(req: Request, params: Params) {
  return forward(req, params, "POST");
}

export async function PATCH(req: Request, params: Params) {
  return forward(req, params, "PATCH");
}

export async function DELETE(req: Request, params: Params) {
  return forward(req, params, "DELETE");
}
