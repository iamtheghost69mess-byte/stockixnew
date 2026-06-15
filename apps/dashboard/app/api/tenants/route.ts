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
  console.log("[BFF] POST /api/tenants - Started, method:", req.method, "url:", req.url);
  const body = await req.text();
  console.log("[BFF] POST /api/tenants - Request Body:", body);
  const incomingIdempotencyKey = req.headers.get("Idempotency-Key");
  try {
    console.log("[BFF] POST /api/tenants - Calling apiFetch");
    const res = await apiFetch(
      "/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(incomingIdempotencyKey ? { "Idempotency-Key": incomingIdempotencyKey } : {}),
        },
        body,
      },
      req,
      PROVISION_BFF_RETRIES,
      LIFECYCLE_TIMEOUT_MS,
    );
    console.log("[BFF] POST /api/tenants - apiFetch returned status:", res.status);
    const responseBody = await res.text();
    console.log("[BFF] POST /api/tenants - Response Body:", responseBody);
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[BFF] POST /api/tenants - Error during apiFetch:", err);
    if (isApiConnectionError(err)) {
      console.error("[BFF] POST /api/tenants - Detected API Connection Error, returning unreachable response");
      return apiUnreachableResponse();
    }
    throw err;
  }
}
