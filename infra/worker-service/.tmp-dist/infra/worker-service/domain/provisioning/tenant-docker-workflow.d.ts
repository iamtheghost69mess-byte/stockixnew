import type { IDockerComposeRunner } from "./contracts.js";
type ComposeCtx = {
    composeFile: string;
    project: string;
    envPath: string;
    composeEnv: Record<string, string>;
};
type ComposeRunOptions = {
    cancelSignal?: AbortSignal;
};
export declare function executeDataStep(runner: IDockerComposeRunner, ctx: ComposeCtx, options?: ComposeRunOptions): Promise<void>;
export declare function executeMigrationStep(runner: IDockerComposeRunner, ctx: ComposeCtx, log: (m: string) => void, options?: ComposeRunOptions): Promise<void>;
export declare function executeAppStep(runner: IDockerComposeRunner, ctx: ComposeCtx, options?: ComposeRunOptions): Promise<void>;
export declare function composeDownBestEffort(runner: IDockerComposeRunner, ctx: ComposeCtx): Promise<boolean>;
export {};
//# sourceMappingURL=tenant-docker-workflow.d.ts.map