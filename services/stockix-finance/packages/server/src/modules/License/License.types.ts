export type LicenseStatus =
  | 'active'
  | 'expired'
  | 'suspended'
  | 'grace'
  | 'revoked';

export interface LicenseStatusMeta {
  licenseStatus: LicenseStatus | null;
  licenseExpiresAt: string | null;
  licenseGracePeriodEndsAt: string | null;
  planSlug: string | null;
  licenseKey: string | null;
  isPerpetual: boolean;
}
