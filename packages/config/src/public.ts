import { env } from "./index.js";

export const publicConfig = {
  stockixRootDomain: env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN,
  stockixPublicScheme: env.NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME,
  stockixLocalTenantHost: env.NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST,
  nodeEnv: env.NODE_ENV,
  publicUrl: env.PUBLIC_URL ?? "",
  monorepoVersion: env.MONOREPO_VERSION ?? "",
};
