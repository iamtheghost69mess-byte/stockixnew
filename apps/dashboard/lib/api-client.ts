import { dashboardConfig } from "@repo/config";

const apiBase = dashboardConfig.nextPublicApiUrl;

function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
  request?: Request,
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

  return fetch(`${apiBase}${input}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
