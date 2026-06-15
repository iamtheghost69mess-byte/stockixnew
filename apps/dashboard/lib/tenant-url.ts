import { publicConfig } from "@repo/config/public";

const publicScheme = publicConfig.stockixPublicScheme;
const publicRootDomain = publicConfig.stockixRootDomain;
const localTenantHost = publicConfig.stockixLocalTenantHost;

export function tenantPublicBaseUrl(slug: string, port: number | null) {
  if (publicRootDomain === "localhost" && port != null) {
    return `${publicScheme}://${localTenantHost}:${port}`;
  }
  if (publicRootDomain === "localhost") {
    // In local mode without a resolved tenant port, avoid emitting slug.localhost
    // links that commonly refuse connection when edge routing is not bound.
    return null;
  }
  return `${publicScheme}://${slug}.${publicRootDomain}`;
}
