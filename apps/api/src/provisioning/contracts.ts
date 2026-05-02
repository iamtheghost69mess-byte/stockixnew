import type { ProvisionTracer } from "../provision-trace.js";

/**
 * Runs `docker compose` for tenant stacks. Abstracted for tests and alternate runtimes (e.g. nerdctl).
 */
export interface IDockerComposeRunner {
  run(
    composeFile: string,
    project: string,
    envFile: string,
    composeEnv: Record<string, string>,
    args: string[],
  ): Promise<void>;
}

/**
 * Generates bootstrap credentials. Swap for HSM/KMS-backed implementations in regulated environments.
 */
export interface ITenantSecretGenerator {
  bootstrapAdminPassword(): string;
  randomHex(bytes: number): string;
  /** Hook for future envelope encryption; today returns plaintext. */
  persistSecret(plaintext: string): string;
}

/** Publishes per-tenant routes at the edge (Traefik file provider, etc.). */
export interface ITenantEdgePublisher {
  publish(slug: string, port: number, rootDomain: string): Promise<void>;
  unpublish(slug: string): Promise<void>;
}

export interface IStockixFinanceBootstrap {
  waitUntilReady(
    internalBaseUrl: string,
    timeoutMs: number,
    log: (m: string) => void,
    trace?: ProvisionTracer,
  ): Promise<void>;

  registerBootstrapAdmin(params: {
    internalBaseUrl: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    log: (m: string) => void;
    trace?: ProvisionTracer;
  }): Promise<void>;
}
