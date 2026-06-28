import { publicConfig } from "@repo/config/public";

const publicScheme = publicConfig.stockixPublicScheme;
const publicRootDomain = publicConfig.stockixRootDomain;
const localTenantHost = publicConfig.stockixLocalTenantHost;

export function tenantPublicBaseUrl(slug: string, port: number | null) {
  return `${publicScheme}://${slug}.${publicRootDomain}`;
}
