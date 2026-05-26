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
const STOCKIX_DISCOVERY_SLUG =
  process.env.REACT_APP_STOCKIX_DISCOVERY_SLUG ?? '';

/** Fetches public tenant branding (no org list — use auth/my-tenants for orgs). */
async function fetchPublicTenantBranding(): Promise<{
  displayName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
} | null> {
  if (!STOCKIX_API_URL || !STOCKIX_DISCOVERY_SLUG) return null;
  const res = await fetch(
    `${STOCKIX_API_URL}/public/tenant/${STOCKIX_DISCOVERY_SLUG}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const data: unknown = await res.json();
  if (typeof data !== 'object' || data === null) return null;
  const row = data as Record<string, unknown>;
  return {
    displayName:
      typeof row.displayName === 'string' ? row.displayName : undefined,
    logoUrl: typeof row.logoUrl === 'string' ? row.logoUrl : null,
    primaryColor:
      typeof row.primaryColor === 'string' ? row.primaryColor : null,
  };
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

export function useStockixOrgs() {
  const apiRequest = useApiRequest();

  return useQuery<StockixOrg[]>(
    ['auth', 'my-tenants', STOCKIX_DISCOVERY_SLUG],
    async () => {
      let finance: StockixOrg[] = [];
      try {
        const res = await apiRequest.get('auth/my-tenants', {});
        finance = mapFinanceTenants(res.data as FinanceTenant[]);
      } catch {
        finance = [];
      }

      if (STOCKIX_DISCOVERY_SLUG) {
        await fetchPublicTenantBranding();
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
