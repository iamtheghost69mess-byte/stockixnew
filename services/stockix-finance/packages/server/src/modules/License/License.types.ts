export type LicenseStatus = 'active' | 'expired' | 'suspended' | 'grace';

export interface LicenseStatusMeta {
  licenseStatus: LicenseStatus | null;
  licenseExpiresAt: string | null;
  licenseGracePeriodEndsAt: string | null;
}
