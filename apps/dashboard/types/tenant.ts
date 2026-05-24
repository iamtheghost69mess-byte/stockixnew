export type TenantStatus =
  | "active"
  | "partial"
  | "suspended"
  | "provisioning"
  | "pending"
  | "failed"
  | "unknown";

export type TenantRow = {
  tenantId: string;
  slug: string;
  name: string;
  adminEmail: string;
  planSlug?: string;
  /** Row in `tenants` (may differ from deployment when status is partial). */
  tenantStatus?: string | null;
  deploymentStatus: string | null;
  internalPort: number | null;
  composeProject: string | null;
  lastError: string | null;
  registrationCompletedAt: string | null;
};

/** Full-directory counts (child-org filter only), for headers and dashboard stats. */
export type TenantDirectoryTotals = {
  total: number;
  active: number;
  suspended: number;
  provisioning: number;
  failed: number;
};

export type TenantDetail = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  ownerId: string;
  planSlug: string;
  modules: string[];
  posOrganizationId: string | null;
  posBootstrapCredentials: {
    adminPinMasked: string;
    allRoles: { role: string; username: string; pinMasked: string }[];
  } | null;
  latestProvision: {
    correlationId: string;
    jobStatus: string;
  } | null;
  createdAt: string;
  deployment: {
    status: string;
    composeProjectName: string;
    internalPort: number;
    posUrl: string | null;
    financeTenantId: number | null;
    financeOrganizationId: string | null;
    financeDefaultWarehouseId: number | null;
    financeWalkInCustomerId: number | null;
    financeCashAccountId: number | null;
    financeCardAccountId: number | null;
    lastError: string | null;
    registrationCompletedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  config: {
    appName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    branding: Record<string, unknown> | null;
  } | null;
};

export type ProvisionEventRow = {
  id: string;
  phase: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
  slug?: string | null;
  parentTenantId?: string | null;
  createdAt: string;
};
