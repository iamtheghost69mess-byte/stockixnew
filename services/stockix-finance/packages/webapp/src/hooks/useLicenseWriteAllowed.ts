import { useDashboardMeta } from '@/hooks/query';
import { useAuthOrganizationId, useIsAuthenticated } from '@/hooks/state';

export const useLicenseWriteAllowed = (): boolean => {
  const isAuthenticated = useIsAuthenticated();
  const organizationId = useAuthOrganizationId();
  const { data } = useDashboardMeta({
    enabled: isAuthenticated && !!organizationId,
  });
  const status = data?.licenseStatus ?? data?.license_status ?? null;
  if (status === 'suspended' || status === 'expired' || status === 'grace') {
    return false;
  }
  return status === 'active' || status === null;
};
