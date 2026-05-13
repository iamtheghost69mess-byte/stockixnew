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

export async function executeDataStep(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
  options?: ComposeRunOptions,
): Promise<void> {
  // --build: always rebuild data-layer images from STOCKIX_TENANT_APP_ROOT so provisioning
  // does not silently reuse stale locally tagged images (stockix-*:local).
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
    "up",
    "-d",
    "--no-deps",
    "--remove-orphans",
    "--build",
    "mysql",
    "mongo",
    "redis",
  ], options);
}

export async function executeMigrationStep(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
  log: (m: string) => void,
  options?: ComposeRunOptions,
): Promise<void> {
  log("database_migration");
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
    "run",
    "--rm",
    "--build",
    "database_migration",
  ], options);
}

export async function executeAppStep(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
  options?: ComposeRunOptions,
): Promise<void> {
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
    "up",
    "-d",
    "--remove-orphans",
    "--build",
    "webapp",
    "nginx",
    "server",
  ], options);
}

export async function composeDownBestEffort(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
): Promise<boolean> {
  const result = await runner
    // Provision rollback should remove anonymous/named volumes to avoid stale
    // MySQL credentials across retries (new secret vs old initialized volume).
    .run(
      ctx.composeFile,
      ctx.project,
      ctx.envPath,
      ctx.composeEnv,
      ["down", "--remove-orphans", "-v", "--timeout", "30"],
      { timeoutMs: 2 * 60 * 1000 },
    )
    .then(() => true)
    .catch(() => false);
  return result;
}
