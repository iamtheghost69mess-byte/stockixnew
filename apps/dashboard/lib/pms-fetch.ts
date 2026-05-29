export async function pmsFetch(
  path: string,
  tenantId: string,
  init?: RequestInit,
): Promise<Response> {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const sep = normalized.includes("?") ? "&" : "?";
  return fetch(`/api/pms/${normalized}${sep}tenantId=${encodeURIComponent(tenantId)}`, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}
