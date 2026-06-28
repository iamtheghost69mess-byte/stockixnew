// Extracted utility functions
import { apiConfig } from "@repo/config";
import { encryptDeploymentSecret, decryptDeploymentSecret } from "@repo/shared/deployment-secrets";
import { execa } from "execa";

export function encryptDeploymentSecretLocal(plaintext: string): string {
  return encryptDeploymentSecret(plaintext, apiConfig.deploymentSecretKey);
}

export function decryptDeploymentSecretLocal(ciphertext: string): string {
  const plain = decryptDeploymentSecret(ciphertext, apiConfig.deploymentSecretKey);
  if (!plain) {
    throw new Error("deployment_secret_decrypt_failed");
  }
  return plain;
}

export async function resolvePublishedServerHostPort(containerName: string): Promise<number | null> {
  // Prefer `docker port` — reliable on Windows; complex inspect templates often fail under PowerShell.
  try {
    const { stdout } = await execa("docker", ["port", containerName, "3000"], { stdio: "pipe" });
    const match = stdout.trim().match(/:(\d+)\s*$/);
    if (match?.[1]) {
      const port = Number(match[1]);
      if (Number.isFinite(port) && port > 0) return port;
    }
  } catch {
    // Fall through to inspect.
  }
  try {
    const { stdout } = await execa(
      "docker",
      [
        "inspect",
        "--format",
        "{{(index (index .NetworkSettings.Ports \"3000/tcp\") 0).HostPort}}",
        containerName,
      ],
      { stdio: "pipe" },
    );
    const port = Number(stdout.trim());
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // Fall through to compose port lookup.
  }
  return null;
}

export async function resolveServerInternalUrl(params: {
  composeFile: string;
  project: string;
  envPath: string;
  composeEnv: Record<string, string>;
  fallbackHost: string;
  fallbackPort: number;
  log?: (message: string) => void;
  preferPublishedPort?: boolean;
}): Promise<string> {
  const preferPublishedPort =
    params.preferPublishedPort
    ?? (process.platform === "win32" || process.env.NODE_ENV !== "production");

  // Connect the tenant server container to the worker's internal network so the
  // worker can reach it directly (host-published port forwarding is blocked by
  // Docker isolation between different bridge networks on Linux).
  const workerNetwork = process.env.WORKER_INTERNAL_NETWORK ?? "stockix_internal";
  const containerName = `${params.project}-server-1`;
  if (!preferPublishedPort) {
    try {
      await execa("docker", ["network", "connect", workerNetwork, containerName], {
        stdio: "pipe",
        reject: false,
      });
      const { stdout: inspectOut } = await execa(
        "docker",
        [
          "inspect",
          "--format",
          `{{(index .NetworkSettings.Networks "${workerNetwork}").IPAddress}}`,
          containerName,
        ],
        { stdio: "pipe" },
      );
      const ip = inspectOut.trim();
      if (ip && ip !== "<no value>" && ip !== "") {
        return `http://${ip}:3000`;
      }
    } catch {
      // Fall through to host-port approach.
    }
  }

  const publishedPort = await resolvePublishedServerHostPort(containerName);
  if (publishedPort) {
    params.log?.(
      `[provision] resolved Finance server published port ${publishedPort} for ${containerName}`,
    );
    return `http://${params.fallbackHost}:${publishedPort}`;
  }

  try {
    const { stdout } = await execa(
      "docker",
      [
        "compose",
        "-f",
        params.composeFile,
        "-p",
        params.project,
        "--env-file",
        params.envPath,
        "port",
        "server",
        "3000",
      ],
      { env: params.composeEnv, extendEnv: true, stdio: "pipe" },
    );
    const trimmed = stdout.trim();
    const match = trimmed.match(/:(\d+)\s*$/);
    if (match?.[1]) {
      const composePort = Number(match[1]);
      params.log?.(
        `[provision] resolved Finance server compose port ${composePort} for ${params.project}`,
      );
      return `http://${params.fallbackHost}:${composePort}`;
    }
  } catch {
    // Fall through to last-resort fallback.
  }

  params.log?.(
    `[provision][warn] could not resolve published server port for ${containerName}; ` +
      `falling back to ${params.fallbackHost}:${params.fallbackPort} (PUBLIC_PROXY_PORT — likely wrong for health check)`,
  );
  return `http://${params.fallbackHost}:${params.fallbackPort}`;
}

