import { useQuery } from 'react-query';

export interface StockixOrg {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  status: string;
  createdAt: string;
  /** Local dev: full URL with host port for published nginx. */
  publicUrl: string | null;
}

const STOCKIX_API_URL = (process.env.REACT_APP_STOCKIX_API_URL ?? '').replace(
  /\/$/,
  '',
);
const STOCKIX_TENANT_ID = process.env.REACT_APP_STOCKIX_TENANT_ID ?? '';

async function fetchStockixOrgs(): Promise<StockixOrg[]> {
  if (!STOCKIX_API_URL || !STOCKIX_TENANT_ID) return [];
  const res = await fetch(
    `${STOCKIX_API_URL}/public/tenant-orgs/${STOCKIX_TENANT_ID}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (
    typeof data === 'object' &&
    data !== null &&
    'organizations' in data &&
    Array.isArray((data as { organizations: unknown }).organizations)
  ) {
    const list = (data as { organizations: Record<string, unknown>[] }).organizations;
    return list.map((o) => ({
      id: String(o.id ?? ''),
      name: String(o.name ?? ''),
      slug: String(o.slug ?? ''),
      subdomain: String(o.subdomain ?? ''),
      status: String(o.status ?? ''),
      createdAt: String(o.createdAt ?? ''),
      publicUrl: typeof o.publicUrl === 'string' ? o.publicUrl : null,
    }));
  }
  return [];
}

export function useStockixOrgs() {
  return useQuery(
    ['stockix-orgs', STOCKIX_TENANT_ID],
    fetchStockixOrgs,
    {
      enabled: Boolean(STOCKIX_API_URL && STOCKIX_TENANT_ID),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
}
