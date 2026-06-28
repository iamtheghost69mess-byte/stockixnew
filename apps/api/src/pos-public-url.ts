import { apiConfig } from "@repo/config";
import { publicConfig } from "@repo/config/public";
import { buildTenantServiceUrl } from "../../../packages/shared/src/tenant-dns.js";

function publicScheme(): string {
  return (apiConfig.publicBaseUrlScheme ?? "http").replace(/:+$/, "");
}

export function buildPosPublicUrls(
  slug: string,
  ports: { backendPort: number; frontendPort: number },
): { posUrl: string; posApiUrl: string } {
  const rootDomain = apiConfig.rootDomain || "example.com";
  const scheme = publicScheme();
  return {
    posUrl: `${scheme}://${slug}-pos.${rootDomain}`,
    posApiUrl: `${scheme}://${slug}-pos-api.${rootDomain}`,
  };
}

export async function resolvePosFrontendHostPort(slug: string): Promise<number | null> {
  // Deprecated. Return null.
  return null;
}

export async function resolvePosBackendHostPort(slug: string): Promise<number | null> {
  // Deprecated. Return null.
  return null;
}

export async function resolvePosBackendHealthUrl(slug: string): Promise<string | null> {
  return buildTenantServiceUrl(slug, "pos-backend", 8010) + "/health";
}

/** Resolves a reachable POS API base URL for control-plane proxy calls. */
export async function effectivePosApiUrl(slug: string): Promise<string | null> {
  return buildTenantServiceUrl(slug, "pos-backend", 8010);
}

/** Resolves a reachable POS URL. In Swarm, it's just the public stored URL. */
export async function effectivePosUrl(
  slug: string,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored?.trim()) return null;
  return stored.trim();
}
