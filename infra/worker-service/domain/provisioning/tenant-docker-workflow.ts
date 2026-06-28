import type { IDockerComposeRunner } from "./contracts.js";
import { execa } from "execa";

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

export async function runDockerExec(params: {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
  service: string;
  command: string[];
  timeoutMs?: number;
  log?: (message: string) => void;
}): Promise<void> {
  const { project, composeEnv, service, command, timeoutMs, log } = params;
  log?.(`[docker] exec ${project}/${service}: ${command.join(" ")}`);

  const slug = project.replace(/^stockix-/, '');
  const stackName = `stockix_tenant_${slug.replace(/-/g, '_')}`;
  const serviceName = `${stackName}_${service}`;

  const psResult = await execa("docker", ["ps", "-q", "-f", `name=${serviceName}`]);
  const containerId = psResult.stdout.split('\n')[0]?.trim();

  if (!containerId) {
    throw new Error(`Container for service ${serviceName} not found`);
  }

  await execa(
    "docker",
    [
      "exec",
      "-T",
      containerId,
      ...command,
    ],
    {
      env: composeEnv,
      stdio: "pipe",
      extendEnv: true,
      timeout: timeoutMs ?? 60_000,
    },
  );
}
