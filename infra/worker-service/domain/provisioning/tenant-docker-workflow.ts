import type { IDockerComposeRunner } from "./contracts.js";

type ComposeCtx = {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
};

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
