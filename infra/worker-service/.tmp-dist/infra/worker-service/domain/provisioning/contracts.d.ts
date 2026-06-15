import type { ProvisionTracer } from "../provision-trace.js";
export interface IDockerComposeRunner {
    run(composeFile: string, project: string, envFile: string, composeEnv: Record<string, string>, args: string[], options?: {
        cancelSignal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<void>;
}
export interface ITenantSecretGenerator {
    bootstrapAdminPassword(): string;
    randomHex(bytes: number): string;
    persistSecret(plaintext: string): string;
}
export interface ITenantEdgePublisher {
    publish(slug: string, port: number, rootDomain: string): Promise<void>;
    unpublish(slug: string): Promise<void>;
}
export interface IStockixFinanceBootstrap {
    waitUntilReady(internalBaseUrl: string, timeoutMs: number, log: (m: string) => void, requestId?: string, trace?: ProvisionTracer): Promise<void>;
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
}
//# sourceMappingURL=contracts.d.ts.map