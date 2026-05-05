import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const apiBase = process.env.NEXT_PUBLIC_STOCKIX_API_URL ?? "http://localhost:4000";

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const secret = process.env.PLATFORM_API_SECRET;
  if (!secret) throw new Error("PLATFORM_API_SECRET is not configured");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  const method = (init.method ?? "GET").toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", randomUUID());
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await verifySession(token);
    if (session?.sub) headers.set("X-Actor-Id", session.sub);
  }

  return fetch(`${apiBase}${input}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
