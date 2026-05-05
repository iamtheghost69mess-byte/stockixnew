export type TenantStatus =
  | "active"
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
  deploymentStatus: string | null;
  internalPort: number | null;
  composeProject: string | null;
  lastError: string | null;
  registrationCompletedAt: string | null;
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
  createdAt: string;
  deployment: {
    status: string;
    composeProjectName: string;
    internalPort: number;
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
  createdAt: string;
};
