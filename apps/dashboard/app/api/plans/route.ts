import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET(req: Request) {
  try {
    const res = await apiFetch("/v1/plans", {}, req);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "plans_proxy_failed", message },
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await apiFetch(
      "/plans",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
      req,
    );
    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "plans_proxy_failed", message },
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}
