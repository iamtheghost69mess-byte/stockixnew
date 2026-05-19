import { useDashboardMeta } from '@/hooks/query';

export const useLicenseWriteAllowed = (): boolean => {
  const { data } = useDashboardMeta({ enabled: true });
  const status = data?.licenseStatus ?? data?.license_status ?? null;
  return status === 'active' || status === null;
};
