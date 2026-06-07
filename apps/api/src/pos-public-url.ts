import { execa } from "execa";
import { apiConfig } from "@repo/config";
import { publicConfig } from "@repo/config/public";

function localTenantHost(): string {
  return publicConfig.stockixLocalTenantHost || "127.0.0.1";
}

function publicScheme(): string {
  return (apiConfig.publicBaseUrlScheme ?? "http").replace(/:+$/, "");
}

export function buildPosPublicUrls(
  slug: string,
  ports: { backendPort: number; frontendPort: number },
): { posUrl: string; posApiUrl: string } {
  const rootDomain = apiConfig.rootDomain || "example.com";
  const scheme = publicScheme();
  if (rootDomain === "localhost") {
    const host = localTenantHost();
    return {
      posUrl: `${scheme}://${host}:${ports.frontendPort}`,
      posApiUrl: `${scheme}://${host}:${ports.backendPort}`,
    };
  }
  return {
    posUrl: `${scheme}://${slug}-pos.${rootDomain}`,
    posApiUrl: `${scheme}://${slug}-pos-api.${rootDomain}`,
  };
}

export async function resolvePosFrontendHostPort(slug: string): Promise<number | null> {
  const project = `stockix-pos-${slug}`;
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      project,
      "port",
      "pos-frontend",
      "3000",
    ]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function resolvePosBackendHostPort(slug: string): Promise<number | null> {
  const project = `stockix-pos-${slug}`;
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      project,
      "port",
      "pos-backend",
      "8010",
    ]);
    const match = stdout.trim().match(/:(\d+)\s*$/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function resolvePosBackendHealthUrl(slug: string): Promise<string | null> {
  const port = await resolvePosBackendHostPort(slug);
  if (port == null || !Number.isFinite(port) || port <= 0) return null;
  const host = localTenantHost();
  return `${publicScheme()}://${host}:${port}/health`;
}

/** Resolves a reachable POS API base URL for control-plane proxy calls. */
export async function effectivePosApiUrl(slug: string): Promise<string | null> {
  const root = apiConfig.rootDomain ?? "localhost";
  if (root === "localhost") {
    const port = await resolvePosBackendHostPort(slug);
    if (port == null || !Number.isFinite(port) || port <= 0) return null;
    return `${publicScheme()}://${localTenantHost()}:${port}`;
  }
  return `${publicScheme()}://${slug}-pos-api.${root}`;
}

/** Resolves a reachable POS URL in local dev (direct host port instead of Traefik subdomain). */
export async function effectivePosUrl(
  slug: string,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored?.trim()) return null;
  const storedTrimmed = stored.trim();
  const root = apiConfig.rootDomain ?? "localhost";
  if (root !== "localhost") return storedTrimmed;

  const port = await resolvePosFrontendHostPort(slug);
  if (port == null || !Number.isFinite(port) || port <= 0) {
    return storedTrimmed;
  }

  const direct = `${publicScheme()}://${localTenantHost()}:${port}`;
  if (storedTrimmed === direct) return storedTrimmed;
  return direct;
}
