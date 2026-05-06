import type { IDockerComposeRunner } from "./contracts.js";

type ComposeCtx = {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
};

export async function executeDataStep(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
): Promise<void> {
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
    "up",
    "-d",
    "mysql",
    "mongo",
    "redis",
  ]);
}

export async function executeMigrationStep(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
  log: (m: string) => void,
): Promise<void> {
  log("database_migration");
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
    "run",
    "--build",
    "--rm",
    "database_migration",
  ]);
}

export async function executeAppStep(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
): Promise<void> {
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, ["up", "-d"]);
}

export async function composeDownBestEffort(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
): Promise<void> {
  await runner
    .run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, ["down"])
    .catch(() => undefined);
}
