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
      /** Shown once — Stockix admin login (not stored in Stockix Postgres). */
      oneTimeAdminPassword: string;
    }
  | { ok: false; message: string; cause?: string };

export type DeprovisionOptions = {
  /** Pass `true` to run `docker compose down --volumes` (destroys MySQL/Mongo/Redis data). */
  removeVolumes?: boolean;
  log?: (message: string) => void;
};

export type DeprovisionResult =
  | {
      ok: true;
      slug: string;
      composeProject: string;
      docker: "stopped" | "skipped" | "failed";
    }
  | { ok: false; message: string };
