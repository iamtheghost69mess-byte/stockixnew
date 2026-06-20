import { env } from "./env.js";

export const infraConfig = {
  /** Redis URL for control-plane queues (BullMQ). Optional — queues disabled when unset. */
  get controlPlaneRedisUrl() {
    return env.CONTROL_PLANE_REDIS_URL;
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
  /** How often the stuck-provisioning reconciler runs in ms (default: 60 000). */
  get provisionReconcileIntervalMs() {
    return env.PROVISION_RECONCILE_INTERVAL_MS;
  },
  get rootDomain() {
    return env.ROOT_DOMAIN;
  },
  get nextPublicStockixApiUrl() {
    return env.NEXT_PUBLIC_STOCKIX_API_URL;
  },
  get postgresUser() {
    return env.POSTGRES_USER;
  },
  get postgresPassword() {
    return env.POSTGRES_PASSWORD;
  },
  get postgresDb() {
    return env.POSTGRES_DB;
  },
  get postgresHostPort() {
    return env.POSTGRES_HOST_PORT;
  },
  get acmeEmail() {
    return env.ACME_EMAIL;
  },
  get cloudflareDnsToken() {
    return env.CF_DNS_API_TOKEN;
  },
  get stockixRepo() {
    return env.STOCKIX_REPO;
  },
} as const;
