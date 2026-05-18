export type ProvisionInput = {
  slug: string;
  name: string;
  ownerId: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  /** Parent Stockix tenant slug (same password key for all org stacks under this tenant). */
  parentTenantSlug?: string;
  /** Internal base URL of the parent tenant's primary deployment (org provisioning only). */
  mainTenantInternalBaseUrl?: string;
  /** Parent Stockix tenant UUID for org-scoped Bigcapital instances (optional). */
  stockixTenantId?: string;
  /** Public Stockix API base URL for webapp org switcher (optional). */
  stockixApiUrl?: string;
  /** Control-plane organization row id (UUID); set when provisioning a sub-org stack. */
  controlPlaneOrgId?: string;
};

export type ProvisionResult =
  | {
      ok: true;
      tenantId: string;
      deploymentId: string;
      composeProjectName: string;
      internalPort: number;
      baseUrl: string;
      oneTimeAdminPassword: string;
      financeOrganizationId?: string;
    }
  | { ok: false; message: string; cause?: string };

export type DeprovisionOptions = {
  removeVolumes?: boolean;
  removeImages?: boolean;
  log?: (message: string) => void;
};

export type DeprovisionResult =
  | { ok: true; slug: string; composeProject: string; docker: "stopped" | "skipped" | "failed" }
  | { ok: false; message: string };
