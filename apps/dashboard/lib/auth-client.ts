"use client";

import { publicConfig } from "@repo/config/public";

export async function authApiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const apiBase = publicConfig.stockixApiUrl;
  return fetch(`${apiBase}${input}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: new Headers(init.headers),
  });
}
