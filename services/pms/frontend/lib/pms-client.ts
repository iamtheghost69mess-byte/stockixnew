import { cookies } from "next/headers";

const baseUrl = () =>
  process.env.NEXT_PUBLIC_PMS_API_URL ?? "http://localhost:3003";

export async function pmsFetch(path: string, init?: RequestInit) {
  const jar = await cookies();
  const token = jar.get("stockix-session")?.value;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Accept", "application/json");
  const url = `${baseUrl().replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers, cache: "no-store" });
}
