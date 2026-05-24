import { useQuery } from 'react-query';
import useApiRequest from '../useRequest';

interface FinanceTenant {
  tenant_id: number;
  organization_id: string;
  role: string | null;
  name: string | null;
}

export interface StockixOrg {
  id: string;
  organizationId: string;
  tenantId?: number;
  name: string;
  role?: string | null;
  slug?: string;
  subdomain?: string;
  status?: string;
  createdAt?: string;
  publicUrl?: string | null;
}

const STOCKIX_API_URL = (process.env.REACT_APP_STOCKIX_API_URL ?? '').replace(
  /\/$/,
  '',
);
const STOCKIX_TENANT_ID = process.env.REACT_APP_STOCKIX_TENANT_ID ?? '';

async function fetchExternalStockixOrgs(): Promise<StockixOrg[]> {
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
    const list = (data as { organizations: Record<string, unknown>[] })
      .organizations;
    return list.map((o) => {
      const id = String(o.id ?? '');
      return {
        id,
        organizationId: id,
        name: String(o.name ?? ''),
        slug: String(o.slug ?? ''),
        subdomain: String(o.subdomain ?? ''),
        status: String(o.status ?? ''),
        createdAt: String(o.createdAt ?? ''),
        publicUrl: typeof o.publicUrl === 'string' ? o.publicUrl : null,
      };
    });
  }
  return [];
}

function mapFinanceTenants(rows: FinanceTenant[]): StockixOrg[] {
  return rows.map((t) => ({
    id: t.organization_id,
    organizationId: t.organization_id,
    tenantId: t.tenant_id,
    name: t.name ?? '',
    role: t.role,
  }));
}

function mergeOrgLists(
  finance: StockixOrg[],
  external: StockixOrg[],
): StockixOrg[] {
  if (finance.length === 0) return external;
  if (external.length === 0) return finance;

  const seen = new Set(finance.map((o) => o.organizationId));
  const externalOnly = external.filter((o) => !seen.has(o.organizationId));
  return [...finance, ...externalOnly];
}

export function useStockixOrgs() {
  const apiRequest = useApiRequest();

  return useQuery<StockixOrg[]>(
    ['auth', 'my-tenants', STOCKIX_TENANT_ID],
    async () => {
      let finance: StockixOrg[] = [];
      try {
        const res = await apiRequest.get('auth/my-tenants', {});
        finance = mapFinanceTenants(res.data as FinanceTenant[]);
      } catch {
        finance = [];
      }

      if (STOCKIX_API_URL && STOCKIX_TENANT_ID) {
        const external = await fetchExternalStockixOrgs();
        return mergeOrgLists(finance, external);
      }

      return finance;
    },
    {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
}
