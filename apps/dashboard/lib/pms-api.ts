import { pmsFetch } from "@/lib/pms-fetch";

export type PmsTenantOption = {
  tenantId: string;
  name: string;
  slug: string;
  modules?: string;
};

export async function fetchPmsTenants(): Promise<PmsTenantOption[]> {
  const res = await fetch("/api/tenants?pageSize=100");
  if (!res.ok) return [];
  const data = (await res.json()) as {
    tenants?: Array<{
      tenantId?: string;
      id?: string;
      name: string;
      slug: string;
      modules?: string;
    }>;
  };
  return (data.tenants ?? [])
    .map((t) => ({
      tenantId: t.tenantId ?? t.id ?? "",
      name: t.name,
      slug: t.slug,
      modules: t.modules,
    }))
    .filter((t) => {
      if (!t.tenantId) return false;
      try {
        const mods = JSON.parse(t.modules ?? '["accounting"]') as string[];
        return mods.includes("pms");
      } catch {
        return false;
      }
    });
}

/** Parse JSON from PMS proxy; returns null when response is an error payload. */
export async function parsePmsJson<T extends Record<string, unknown>>(
  res: Response,
): Promise<T | null> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || (typeof data.error === "string" && data.error.length > 0)) {
    return null;
  }
  return data;
}

export async function pmsJson<T extends Record<string, unknown>>(
  path: string,
  tenantId: string,
): Promise<{ data: T | null; ok: boolean }> {
  const res = await pmsFetch(path, tenantId);
  const data = await parsePmsJson<T>(res);
  return { data, ok: res.ok && data !== null };
}
