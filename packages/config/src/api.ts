import { createHash } from "node:crypto";
import {
  env,
  parseOrigins,
  readRequiredString,
  validateRequiredEnvForProfile,
  validateRecommendedEnvForProfile,
  validateWorkerSecret,
} from "./env.js";

export const apiConfig = {
  get runBullMqConsumers() {
    const raw = env.RUN_BULLMQ_CONSUMERS;
    if (raw === undefined || raw === "") return true;
    return raw === "1" || raw.toLowerCase() === "true";
  },
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get platformApiSecret() {
    return env.PLATFORM_API_SECRET ?? readRequiredString("PLATFORM_API_SECRET");
  },
  get workerSecret() {
    return env.WORKER_SECRET;
  },
  get workerConcurrency() {
    return env.WORKER_CONCURRENCY;
  },
  get provisionPollMs() {
    return env.PROVISION_POLL_MS;
  },
  get mysqlProxyHost() {
    return env.MYSQL_PROXY_HOST;
  },
  get mysqlProxyPort() {
    return env.MYSQL_PROXY_PORT;
  },
  get tenantRedisPassword(): string | undefined {
    const raw = env.TENANT_REDIS_PASSWORD?.trim();
    return raw && raw.length > 0 ? raw : undefined;
  },
  get workerInternalNetwork() {
    return env.WORKER_INTERNAL_NETWORK;
  },
  /** Secret for finance internal routes; dev/test fall back to WORKER_SECRET when unset. */
  get internalApiSecret(): string | undefined {
    if (env.INTERNAL_API_SECRET) return env.INTERNAL_API_SECRET;
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      return env.WORKER_SECRET;
    }
    return undefined;
  },
  get dashboardUrl() {
    return env.DASHBOARD_URL ?? readRequiredString("DASHBOARD_URL");
  },
  get rootDomain() {
    return env.ROOT_DOMAIN;
  },
  get corsOrigins() {
    return parseOrigins(env.CORS_ORIGINS);
  },
  get port() {
    return env.PORT;
  },
  /** Control-plane API hostname for worker → API calls. Must be set explicitly: `api` in Docker, `127.0.0.1` on host. */
  get apiHost() {
    const host = env.API_HOST?.trim();
    if (!host) throw new Error("[config] API_HOST is required — set to 'api' for containerized worker, '127.0.0.1' for host-run worker");
    return host;
  },
  get controlPlaneApiBaseUrl() {
    return `http://${this.apiHost}:${this.port}`;
  },
  get publicBaseUrlScheme() {
    return env.PUBLIC_BASE_URL_SCHEME;
  },
  get maxTenantPort() {
    return env.MAX_TENANT_PORT;
  },
  get tenantInternalHost() {
    return env.TENANT_INTERNAL_HOST;
  },
  get tenantEnvRoot() {
    return env.TENANT_ENV_ROOT;
  },
  get repoRoot() {
    return env.REPO_ROOT;
  },
  get stockixTenantAppRoot() {
    return env.STOCKIX_TENANT_APP_ROOT;
  },
  get traefikDynamicDir() {
    return env.TRAEFIK_DYNAMIC_DIR;
  },
  get traefikTenantUpstreamHost() {
    return env.TRAEFIK_TENANT_UPSTREAM_HOST;
  },
  get bootstrapAdminEmail() {
    return env.BOOTSTRAP_ADMIN_EMAIL;
  },
  get bootstrapAdminPassword() {
    return env.BOOTSTRAP_ADMIN_PASSWORD;
  },
  get nodeEnv() {
    return env.NODE_ENV;
  },
  get sessionSecret() {
    return env.SESSION_SECRET ?? readRequiredString("SESSION_SECRET");
  },
  /**
   * Secret used to sign/verify offline license JWTs (POS). Production/staging must set
   * LICENSE_SIGNING_SECRET (≥32 chars). Development/test fall back to a fixed local value.
   */
  get licenseSigningSecret() {
    const raw = env.LICENSE_SIGNING_SECRET?.trim();
    if (raw && raw.length >= 32) return raw;
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
      return "local-dev-license-signing-secret-min-32!";
    }
    throw new Error(
      "[config] LICENSE_SIGNING_SECRET is required (min 32 characters) outside development/test",
    );
  },
  get authTokenSecret() {
    return env.AUTH_TOKEN_SECRET ?? env.SESSION_SECRET ?? readRequiredString("AUTH_TOKEN_SECRET");
  },
  get platformJwtSecret() {
    return env.PLATFORM_JWT_SECRET;
  },
  get allowBootstrapLogin() {
    return env.ALLOW_BOOTSTRAP_LOGIN === "true" || env.ALLOW_BOOTSTRAP_LOGIN === "1";
  },
  get signupDisabled(): boolean {
    const val = env.SIGNUP_DISABLED;
    if (val === undefined || val === null) return true;
    return val === "true" || val === "1";
  },
  get signupAllowedDomains(): string {
    return env.SIGNUP_ALLOWED_DOMAINS ?? "";
  },
  /** Platform-wide email allowlist appended to each tenant admin email at provision time. */
  get signupAllowedEmailsOverride(): string {
    return env.SIGNUP_ALLOWED_EMAILS ?? "";
  },
  get hostname() {
    return env.HOSTNAME;
  },
  get workerJobId() {
    return env.WORKER_JOB_ID;
  },
  get workerJobExecutionTimeoutMs() {
    return env.WORKER_JOB_EXECUTION_TIMEOUT_MS;
  },
  get dockerComposeUpTimeoutMs() {
    return env.DOCKER_COMPOSE_UP_TIMEOUT_MS;
  },
  get dockerComposeRunTimeoutMs() {
    return env.DOCKER_COMPOSE_RUN_TIMEOUT_MS;
  },
  get dockerComposeDefaultTimeoutMs() {
    return env.DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS;
  },
  get metricsEndpoint() {
    return env.METRICS_ENDPOINT;
  },
  get metricsAuthToken() {
    return env.METRICS_AUTH_TOKEN;
  },
  get deploymentSecretKey() {
    const raw = env.DEPLOYMENT_SECRET_KEY ?? readRequiredString("DEPLOYMENT_SECRET_KEY");
    if (raw.length < 32) {
      throw new Error("[config] DEPLOYMENT_SECRET_KEY must be at least 32 characters");
    }
    return createHash("sha256").update(raw).digest("hex");
  },
  get tenantDbNamePrefix() {
    return env.TENANT_DB_NAME_PREFIX ?? env.TENANT_DB_NAME_PERFIX;
  },
  /** Control-plane API URL used in worker/org-provision payloads. */
  get stockixApiUrl() {
    return env.STOCKIX_API_URL;
  },
  /** NEXT_PUBLIC variant of the API URL (used by dashboard and org-provision). */
  get nextPublicStockixApiUrl() {
    return env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  /** When true, finance license sync failures are non-fatal (dev only). */
  get financeLicenseSyncOptional(): boolean {
    const flag = env.FINANCE_LICENSE_SYNC_OPTIONAL?.trim().toLowerCase();
    if (flag === "1" || flag === "true") {
      return env.NODE_ENV === "development";
    }
    return false;
  },
  /** Brand display name (default: "Stockix"). */
  get brandName() {
    return env.BRAND_NAME;
  },
  /** Public URL for POS frontend (used in proxy error messages). */
  get posFrontendUrl() {
    return env.POS_FRONTEND_URL;
  },
  /** DSN for Sentry error reporting (optional). */
  get sentryDsn() {
    return env.SENTRY_DSN;
  },
  get controlPlaneRedisUrl() {
    const raw = env.CONTROL_PLANE_REDIS_URL?.trim();
    return raw && raw.length > 0 ? raw : undefined;
  },
  get workerHeartbeatStaleMs() {
    return env.WORKER_HEARTBEAT_STALE_MS;
  },
  get workerStaleLeaseThresholdMs() {
    return env.WORKER_STALE_LEASE_THRESHOLD_MS;
  },
  get sentryEnvironment() {
    return env.SENTRY_ENVIRONMENT;
  },
  get releaseVersion() {
    return env.RELEASE_VERSION;
  },
  get workerHealthPort() {
    return env.WORKER_HEALTH_PORT;
  },
  get workerStartupGraceMs() {
    return env.WORKER_STARTUP_GRACE_MS;
  },
  get chatwootBaseUrl() {
    return env.CHATWOOT_BASE_URL;
  },
  get chatwootApiAccessToken() {
    return env.CHATWOOT_API_ACCESS_TOKEN;
  },
  get tenantPortRangeMax() {
    return env.TENANT_PORT_RANGE_MAX;
  },
  get tenantPortRangeMin() {
    return env.TENANT_PORT_RANGE_MIN;
  },
  get proxysqlStatsUrl() {
    return env.PROXYSQL_STATS_URL;
  },
  get fieldEncryptionKey() {
    return env.FIELD_ENCRYPTION_KEY;
  },
  get resendApiKey() {
    return env.RESEND_API_KEY;
  },
  get posHostPort() {
    return env.POS_HOST_PORT;
  },
  get posFrontendHostPort() {
    return env.POS_FRONTEND_HOST_PORT;
  },
  get posAppRoot() {
    return env.POS_APP_ROOT;
  },
  get pmsAppRoot() {
    return env.PMS_APP_ROOT;
  },
  get resendFromEmail() {
    return env.RESEND_FROM_EMAIL;
  },
  get dockerHost() {
    return env.DOCKER_HOST;
  },
  get posFinanceInternalUrlTemplate() {
    return env.POS_FINANCE_INTERNAL_URL_TEMPLATE;
  },
  get posFinanceUseTraefikUrl() {
    return env.POS_FINANCE_USE_TRAEFIK_URL;
  },
  get posFinanceInternalHost() {
    return env.POS_FINANCE_INTERNAL_HOST;
  },
  validateRequiredEnv() {
    validateRequiredEnvForProfile(env.NODE_ENV);
    validateWorkerSecret(env.NODE_ENV, env.WORKER_SECRET);
    if (env.NODE_ENV === "production") {
      const platformSecret = env.PLATFORM_API_SECRET?.trim();
      if (!platformSecret || platformSecret === "__MUST_OVERRIDE__") {
        throw new Error("[config] PLATFORM_API_SECRET must be set in production");
      }
      const redisPassword = env.TENANT_REDIS_PASSWORD?.trim();
      if (!redisPassword || redisPassword === "__MUST_OVERRIDE__") {
        throw new Error("[config] TENANT_REDIS_PASSWORD must be set in production");
      }
      const platformJwtSecret = env.PLATFORM_JWT_SECRET?.trim();
      if (!platformJwtSecret || platformJwtSecret === "__MUST_OVERRIDE__") {
        throw new Error("[config] PLATFORM_JWT_SECRET must be set in production");
      }
      const posPlatformApiKey = env.POS_PLATFORM_API_KEY?.trim();
      if (!posPlatformApiKey || posPlatformApiKey === "__MUST_OVERRIDE__") {
        throw new Error("[config] POS_PLATFORM_API_KEY must be set in production");
      }
    }
  },
  /** Missing recommended vars for the current NODE_ENV (non-fatal). */
  getMissingRecommendedEnv(): string[] {
    return validateRecommendedEnvForProfile(env.NODE_ENV);
  },
} as const;
