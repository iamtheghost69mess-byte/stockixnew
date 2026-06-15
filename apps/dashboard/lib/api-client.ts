import { dashboardConfig } from "@repo/config";

import { isApiConnectionError } from "@/lib/api-connection";

// Server-side Route Handlers use dashboardConfig.serverApiUrl (internal Docker URL)
// to avoid hairpin NAT through Cloudflare — POST requests time out going via the public IP.
// Client-side bundle still uses NEXT_PUBLIC_STOCKIX_API_URL baked in at build time.
const apiBase = dashboardConfig.serverApiUrl;

const MAX_ATTEMPTS = dashboardConfig.nodeEnv === "production" ? 3 : 5;
const TIMEOUT_MS = dashboardConfig.nodeEnv === "production" ? 10_000 : 15_000;

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
  console.log(`[BFF] apiFetch: Calling URL = ${url}, method = ${method}, apiBase = ${apiBase}`);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    console.log(`[BFF] apiFetch: Attempt ${attempt + 1}/${retries + 1} for ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      console.warn(`[BFF] apiFetch: Timeout reached (${timeoutMs}ms) for ${url}`);
      controller.abort();
    }, timeoutMs);
    try {
      console.log(`[BFF] apiFetch: Initiating fetch to ${url}`);
      const res = await fetch(url, {
        ...init,
        headers,
        cache: "no-store",
        signal: init.signal ?? controller.signal,
      });
      console.log(`[BFF] apiFetch: Success response from ${url}, status = ${res.status}`);
      return res;
    } catch (error) {
      console.error(`[BFF] apiFetch: Error during attempt ${attempt + 1} for ${url}:`, error);
      lastError = error;
      if (isApiConnectionError(error) && attempt < retries) {
        const delayMs = 500 * 2 ** attempt;
        console.log(`[BFF] apiFetch: Connection error retryable, backing off for ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("apiFetch failed");
}

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/**
 * Proxy a long-lived SSE upstream without throwing when the control-plane restarts
 * (ECONNRESET during pipe). Client EventSource reconnect handles recovery.
 */
export function proxyControlPlaneEventStream(
  upstream: Response,
  req: Request,
): Response {
  if (!upstream.ok || !upstream.body) {
    return new Response("Stream unavailable", {
      status: upstream.status >= 400 ? upstream.status : 503,
    });
  }

  const reader = upstream.body.getReader();
  const stream = new ReadableStream({
    start(controller) {
      const closeQuietly = (): void => {
        try {
          controller.close();
        } catch {
          /* client already gone */
        }
      };

      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              closeQuietly();
              return;
            }
            try {
              controller.enqueue(value);
            } catch {
              await reader.cancel().catch(() => undefined);
              return;
            }
          }
        } catch {
          closeQuietly();
        }
      };

      void pump().catch(() => {
        closeQuietly();
      });
    },
    cancel() {
      void reader.cancel().catch(() => undefined);
    },
  });

  req.signal.addEventListener(
    "abort",
    () => {
      void reader.cancel().catch(() => undefined);
    },
    { once: true },
  );

  return new Response(stream, {
    status: upstream.status,
    headers: {
      ...SSE_HEADERS,
      "content-type": upstream.headers.get("content-type") ?? SSE_HEADERS["content-type"],
    },
  });
}
