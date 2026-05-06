import { publicConfig } from "@repo/config/public";

const publicScheme = publicConfig.stockixPublicScheme;
const publicRootDomain = publicConfig.stockixRootDomain;
const localTenantHost = publicConfig.stockixLocalTenantHost;

export function tenantPublicBaseUrl(slug: string, port: number | null) {
  if (publicRootDomain === "localhost" && port != null) {
    return `${publicScheme}://${localTenantHost}:${port}`;
  }
  return `${publicScheme}://${slug}.${publicRootDomain}`;
}
