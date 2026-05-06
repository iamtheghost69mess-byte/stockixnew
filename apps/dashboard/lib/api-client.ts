import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { dashboardConfig } from "@repo/config";
import { SESSION_COOKIE } from "@/lib/session";

const apiBase = dashboardConfig.nextPublicApiUrl;

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const secret = dashboardConfig.platformApiSecret;
  if (!secret) throw new Error("PLATFORM_API_SECRET is not configured");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  const method = (init.method ?? "GET").toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", randomUUID());
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) headers.set("X-Session-Token", token);

  return fetch(`${apiBase}${input}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
