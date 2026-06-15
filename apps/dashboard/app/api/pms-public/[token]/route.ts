import { NextResponse } from "next/server";
import { pmsConfig } from "@repo/config";

type Params = { params: Promise<{ token: string }> };

async function forward(req: Request, params: Params, method: string) {
  const { token } = await params.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const target = `${pmsConfig.baseUrl}/public/g/${token}`;
  const init: RequestInit = { method };

  if (method === "POST") {
    init.body = await req.text();
    init.headers = { "Content-Type": "application/json" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(target, { ...init, signal: controller.signal });
  } catch {
    return NextResponse.json({ error: "pms_unreachable" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }

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
