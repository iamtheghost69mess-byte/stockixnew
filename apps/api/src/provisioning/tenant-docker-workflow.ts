import type { ProvisionTracer } from "../provision-trace.js";
import type { IDockerComposeRunner } from "./contracts.js";
import {
  TENANT_MIGRATION_MAX_ATTEMPTS,
  TENANT_MIGRATION_RETRY_DELAY_MS,
} from "./constants.js";

type ComposeCtx = {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
};

export async function composeUpDataServices(
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

export async function composeRunMigrationWithRetries(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
  log: (m: string) => void,
  trace: ProvisionTracer,
): Promise<void> {
  for (let i = 0; i < TENANT_MIGRATION_MAX_ATTEMPTS; i++) {
    try {
      log(`database_migration attempt ${i + 1}`);
      await trace.event(
        "migrate",
        `Running database_migration (attempt ${i + 1})`,
      );
      await runner.run(
        ctx.composeFile,
        ctx.project,
        ctx.envPath,
        ctx.composeEnv,
        ["run", "--build", "--rm", "database_migration"],
      );
      await trace.event("migrate", "database_migration finished successfully", {
        meta: { attempt: i + 1 },
      });
      return;
    } catch (e) {
      log(`migration failed (retry): ${String(e)}`);
      await trace.event(
        "migrate",
        `database_migration failed, will retry: ${String(e).slice(0, 500)}`,
        { level: "warn", meta: { attempt: i + 1 } },
      );
      await new Promise((r) => setTimeout(r, TENANT_MIGRATION_RETRY_DELAY_MS));
    }
  }
  throw new Error("database_migration did not succeed");
}

export async function composeUpApplicationStack(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
): Promise<void> {
  await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
    "up",
    "-d",
  ]);
}

export async function composeDownBestEffort(
  runner: IDockerComposeRunner,
  ctx: ComposeCtx,
): Promise<void> {
  await runner
    .run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, ["down"])
    .catch(() => undefined);
}
