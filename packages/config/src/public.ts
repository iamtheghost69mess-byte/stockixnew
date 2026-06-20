// Each value must use a static property access so Next can replace it
// at bundle time for client components. Dynamic process.env[name] access
// causes TypeError in Next 16+ where process.env is not polyfilled
// in browser bundles.

function trim(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t.length > 0 ? t : fallback;
}

export const publicConfig = {
  stockixApiUrl: trim(typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STOCKIX_API_URL : undefined, "http://localhost:4000"),
  stockixRootDomain: trim(typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN : undefined, "localhost"),
  stockixPublicScheme: trim(typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME : undefined, "http"),
  stockixLocalTenantHost: trim(typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST : undefined, "127.0.0.1"),
  nodeEnv: trim(typeof process !== "undefined" ? process.env.NODE_ENV : undefined, "development"),
  publicUrl: trim(typeof process !== "undefined" ? process.env.PUBLIC_URL : undefined, ""),
  monorepoVersion: trim(typeof process !== "undefined" ? process.env.MONOREPO_VERSION : undefined, ""),
};
