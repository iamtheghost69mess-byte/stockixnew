const publicScheme = process.env.NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME ?? "http";
const publicRootDomain =
  process.env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN ?? "localhost";
const localTenantHost =
  process.env.NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST ?? "127.0.0.1";

export function tenantPublicBaseUrl(slug: string, port: number | null) {
  if (publicRootDomain === "localhost" && port != null) {
    return `${publicScheme}://${localTenantHost}:${port}`;
  }
  return `${publicScheme}://${slug}.${publicRootDomain}`;
}
