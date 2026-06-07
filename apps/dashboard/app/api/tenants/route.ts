import { NextResponse } from "next/server";
import { apiFetch, LIFECYCLE_TIMEOUT_MS } from "@/lib/api-client";
import { isApiConnectionError } from "@/lib/api-connection";

const PROVISION_BFF_RETRIES = 0;

function apiUnreachableResponse() {
  return NextResponse.json(
    {
      error: "api_unreachable",
      message:
        "Control-plane API is not responding. Stop dev (`Ctrl+C`), run `pnpm dev:kill`, then `pnpm dev` and wait until the terminal shows API ready before provisioning.",
      retryable: true,
    },
    { status: 503 },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const res = await apiFetch(`/tenants${url.search}`, {}, req);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    if (isApiConnectionError(err)) return apiUnreachableResponse();
    throw err;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await apiFetch(
      "/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
      req,
      PROVISION_BFF_RETRIES,
      LIFECYCLE_TIMEOUT_MS,
    );
    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    if (isApiConnectionError(err)) return apiUnreachableResponse();
    throw err;
  }
}
