import { env, readRequiredString } from "./env.js";

export const dashboardConfig = {
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get sessionSecret() {
    return env.SESSION_SECRET ?? readRequiredString("SESSION_SECRET");
  },
  get platformApiSecret() {
    return env.PLATFORM_API_SECRET ?? readRequiredString("PLATFORM_API_SECRET");
  },
  get platformAdminEmail() {
    return env.PLATFORM_ADMIN_EMAIL ?? readRequiredString("PLATFORM_ADMIN_EMAIL");
  },
  get platformAdminPassword() {
    return env.PLATFORM_ADMIN_PASSWORD ?? readRequiredString("PLATFORM_ADMIN_PASSWORD");
  },
  get nodeEnv() {
    return env.NODE_ENV;
  },
  get nextPublicApiUrl() {
    return env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  /** Internal Docker URL for server-side Route Handlers (avoids hairpin NAT through Cloudflare). */
  get serverApiUrl() {
    return env.STOCKIX_SERVER_API_URL ?? env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  get nextPublicScheme() {
    return env.NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME;
  },
  get nextPublicRootDomain() {
    return env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN;
  },
  get nextPublicLocalTenantHost() {
    return env.NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST;
  },
  get securityHsts() {
    return env.SECURITY_HSTS;
  },
  get securityXFrameOptions() {
    return env.SECURITY_X_FRAME_OPTIONS;
  },
  get securityReferrerPolicy() {
    return env.SECURITY_REFERRER_POLICY;
  },
  get securityXContentTypeOptions() {
    return env.SECURITY_X_CONTENT_TYPE_OPTIONS;
  },
  get securityCspBase() {
    return env.SECURITY_CSP_BASE;
  },
  get nextPublicSentryDsn() {
    return env.NEXT_PUBLIC_SENTRY_DSN;
  },
} as const;
