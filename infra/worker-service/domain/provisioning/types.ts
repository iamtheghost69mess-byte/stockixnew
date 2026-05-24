export type PosRoleCredential = {
  role: string;
  username: string;
  pin: string;
};

export type PosDefaultCredentials = {
  adminPin: string;
  allRoles: PosRoleCredential[];
};

export type ProvisionInput = {
  slug: string;
  name: string;
  ownerId: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  planSlug?: string;
  /** Licensed product modules for this tenant. */
  modules?: string[];
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
  /** When set to `["pos"]`, only re-provision the POS stack for an existing tenant. */
  retryModules?: string[];
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
      financeTenantId?: number;
      /** Bigcapital primary warehouse id (code 10001) for POS defaultWarehouseId. */
      financeDefaultWarehouseId?: number;
      walkInCustomerId?: number;
      cashAccountId?: number;
      cardAccountId?: number;
      posOrganizationId?: string;
      posUrl?: string;
      posApiUrl?: string;
      posDefaultCredentials?: PosDefaultCredentials;
      posStatus?: "ok" | "failed" | "skipped";
      posError?: string;
      /** Final tenant row status when Finance succeeded but POS did not (`partial`). */
      tenantStatus?: "active" | "partial";
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
