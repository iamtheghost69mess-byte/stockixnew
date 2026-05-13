import type { OrgBuildSettings } from "./adapters/fetch-stockix-finance-org-settings.js";
import type { BuildOrgInput, BuildOrgResult } from "./adapters/fetch-stockix-finance-build-org.js";
import type { ProvisionTracer } from "../provision-trace.js";

export interface IDockerComposeRunner {
  run(
    composeFile: string,
    project: string,
    envFile: string,
    composeEnv: Record<string, string>,
    args: string[],
    options?: {
      cancelSignal?: AbortSignal;
      timeoutMs?: number;
    },
  ): Promise<void>;
}

export interface ITenantSecretGenerator {
  /** Deterministic per-tenant bootstrap password (HMAC over tenant slug / parent slug). */
  bootstrapAdminPassword(tenantKey: string): string;
  randomHex(bytes: number): string;
  persistSecret(plaintext: string): string;
}

export interface ITenantEdgePublisher {
  publish(slug: string, port: number, rootDomain: string): Promise<void>;
  unpublish(slug: string): Promise<void>;
}

export interface IStockixFinanceBootstrap {
  waitUntilReady(
    internalBaseUrl: string,
    timeoutMs: number,
    log: (m: string) => void,
    requestId?: string,
    trace?: ProvisionTracer,
  ): Promise<void>;

  registerBootstrapAdmin(params: {
    internalBaseUrl: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    log: (m: string) => void;
    requestId?: string;
    trace?: ProvisionTracer;
  }): Promise<void>;

  fetchOrgSettings(params: {
    mainInternalBaseUrl: string;
    adminEmail: string;
    adminPassword: string;
    correlationId: string;
  }): Promise<OrgBuildSettings | null>;

  buildOrganization(input: BuildOrgInput, log: (m: string) => void): Promise<BuildOrgResult>;
}
