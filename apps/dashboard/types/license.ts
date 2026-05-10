export type LicenseProduct = "platform" | "pos_desktop" | "bundle";
export type LicenseStatus = "active" | "expired" | "revoked" | "unassigned";
export type ActivationStatus = "active" | "deactivated" | "blacklisted";

export type LicenseRow = {
  id: string;
  licenseKey: string;
  product: LicenseProduct;
  planSlug: string;
  status: LicenseStatus;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  isPerpetual: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  maxActivations: number;
  activationCount: number;
  gracePeriodDays: number;
  revokedAt: string | null;
  revokeReason: string | null;
  notes: string | null;
  createdAt: string;
};

export type LicenseActivation = {
  id: string;
  licenseId: string;
  hardwareFingerprint: string;
  machineName: string | null;
  ipAddress: string | null;
  activationStatus: ActivationStatus;
  offlineTokenExpiresAt: string | null;
  deactivatedAt: string | null;
  activatedAt: string;
};

export type LicenseDetail = LicenseRow & {
  activations: LicenseActivation[];
  createdByName: string | null;
  revokedByName: string | null;
};

export type LicenseAnalytics = {
  total: number;
  active: number;
  unassigned: number;
  revoked: number;
  expired: number;
  expiringIn30Days: number;
  byProduct: Record<LicenseProduct, number>;
  byPlan: Record<string, number>;
};
