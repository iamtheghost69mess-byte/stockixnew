import { apiConfig } from "@repo/config";

/**
 * Finance API base URL reachable from inside the per-tenant POS Docker stack.
 * Worker on the host uses 127.0.0.1; POS containers must use host gateway.
 */
export function buildFinanceInternalUrlForPos(params: {
  slug: string;
  internalPort: number;
  /** Host loopback URL used by the worker (e.g. http://127.0.0.1:59428). */
  workerInternalUrl?: string;
}): string {
  const template = process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE?.trim();
  if (template) {
    return template
      .replace(/\{slug\}/g, params.slug)
      .replace(/\{port\}/g, String(params.internalPort))
      .replace(/\{host\}/g, financeInternalHost());
  }

  const useTraefik =
    process.env.POS_FINANCE_USE_TRAEFIK_URL === "1"
    || process.env.POS_FINANCE_USE_TRAEFIK_URL === "true";
  if (useTraefik) {
    const rootDomain = apiConfig.rootDomain || "example.com";
    const scheme = apiConfig.publicBaseUrlScheme || "https";
    return `${scheme}://${params.slug}.${rootDomain}`;
  }

  const host = financeInternalHost();
  return `http://${host}:${params.internalPort}`;
}

function financeInternalHost(): string {
  const fromEnv = process.env.POS_FINANCE_INTERNAL_HOST?.trim();
  if (fromEnv) return fromEnv;
  return "host.docker.internal";
}
