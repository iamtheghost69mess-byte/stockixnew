export type ProvisionInput = {
  slug: string;
  name: string;
  ownerId: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
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
