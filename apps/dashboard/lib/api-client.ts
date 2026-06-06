import { dashboardConfig } from "@repo/config";

import { isApiConnectionError } from "@/lib/api-connection";

// Server-side Route Handlers use dashboardConfig.serverApiUrl (internal Docker URL)
// to avoid hairpin NAT through Cloudflare — POST requests time out going via the public IP.
// Client-side bundle still uses NEXT_PUBLIC_STOCKIX_API_URL baked in at build time.
const apiBase = dashboardConfig.serverApiUrl;

const MAX_ATTEMPTS = dashboardConfig.nodeEnv === "production" ? 3 : 1;
const TIMEOUT_MS = dashboardConfig.nodeEnv === "production" ? 10_000 : 3_000;

/** Long-running control-plane mutations (tenant delete, provision, etc.). */
export const LIFECYCLE_TIMEOUT_MS = 30_000;

function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
  request?: Request,
  retries = MAX_ATTEMPTS - 1,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const secret = dashboardConfig.platformApiSecret;
  if (!secret) throw new Error("PLATFORM_API_SECRET is not configured");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  const forwardedRequestId =
    request?.headers.get("x-request-id")
    ?? request?.headers.get("x-correlation-id")
    ?? createRequestId();
  headers.set("x-request-id", forwardedRequestId);
  headers.set("x-correlation-id", forwardedRequestId);
  const method = (init.method ?? "GET").toUpperCase();
  if (["POST", "PATCH", "DELETE"].includes(method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", createRequestId());
  }
  const cookie = request?.headers.get("cookie");
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const url = `${apiBase}${input}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        headers,
        cache: "no-store",
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (isApiConnectionError(error) && attempt < retries) {
        const delayMs = 500 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("apiFetch failed");
}
