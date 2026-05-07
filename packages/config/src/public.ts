function readPublicEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const publicConfig = {
  stockixApiUrl: readPublicEnv("NEXT_PUBLIC_STOCKIX_API_URL", "http://localhost:4000"),
  stockixRootDomain: readPublicEnv("NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN", "localhost"),
  stockixPublicScheme: readPublicEnv("NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME", "http"),
  stockixLocalTenantHost: readPublicEnv("NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST", "127.0.0.1"),
  nodeEnv: readPublicEnv("NODE_ENV", "development"),
  publicUrl: readPublicEnv("PUBLIC_URL", ""),
  monorepoVersion: readPublicEnv("MONOREPO_VERSION", ""),
};
