import { dashboardConfig } from "@repo/config";

const apiBase = dashboardConfig.nextPublicApiUrl;

export async function apiFetch(
  input: string,
  init: RequestInit = {},
  request?: Request,
): Promise<Response> {
  const secret = dashboardConfig.platformApiSecret;
  if (!secret) throw new Error("PLATFORM_API_SECRET is not configured");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
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
