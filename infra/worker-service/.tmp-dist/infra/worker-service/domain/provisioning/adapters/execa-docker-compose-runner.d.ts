import type { IDockerComposeRunner } from "../contracts.js";
export declare class ExecaDockerComposeRunner implements IDockerComposeRunner {
    run(composeFile: string, project: string, envFile: string, composeEnv: Record<string, string>, args: string[], options?: {
        cancelSignal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<void>;
}
//# sourceMappingURL=execa-docker-compose-runner.d.ts.map