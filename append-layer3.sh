#!/bin/bash
set -e

cat << 'EOF' >> layer3.md

## 5. Boot Validation — Read the Actual Entry Points

### apps/api/src/index.ts
- Validation mechanism: None at boot. It relies on `@repo/config` exporting `apiConfig`.
- Only checks `if (apiConfig.nodeEnv === "production")` and waits for Redis. Missing `PLATFORM_JWT_SECRET` does not explicitly crash it at boot unless `apiConfig` throws.

### apps/pos-backend/app.js
- Validation mechanism: Custom manual checks.
- Code: `if (!config.accessTokenSecret || !config.refreshTokenSecret) { logger.error(...); process.exit(1); }`
- Code: `if (config.nodeEnv === "production" && !process.env.PLATFORM_JWT_SECRET) { ... process.exit(1); }`
- No centralized schema validation.

### services/pms/src/server.ts
- Validation mechanism: None at boot.
- It logs a warning if `dbConfig.databaseUrl` is missing, but does not crash.

### services/stockix-finance/packages/server/src/main.ts
- Validation mechanism: None at boot.
- Mostly falls back to defaults or logs warnings: `process.env.NODE_ENV ?? 'production'`, `process.env.PORT ?? 3000`. No explicit required check that crashes the app.

### infra/worker-service/src/worker.ts
- Validation mechanism: Checks `apiConfig.sentryDsn` and logs a warning if missing. Zod is used for payload validation (e.g. `provisionPayloadSchema`), but not for boot environment variables.

## 7. Env Vars Per Service in Compose Files

### infra/prod/docker-compose.yml
**Service: traefik**
- CF_DNS_API_TOKEN: `${CF_DNS_API_TOKEN}` (reference)

**Service: postgres**
- POSTGRES_USER: `postgres` (hardcoded)
- POSTGRES_PASSWORD: `${POSTGRES_PASSWORD}` (reference)
- POSTGRES_DB: `stockix_platform` (hardcoded)

**Service: pgbouncer**
- DATABASES_HOST: `postgres` (hardcoded)
- DATABASES_PASSWORD: `${POSTGRES_PASSWORD}` (reference)
... and others hardcoded.

**Service: api**
- Uses `*stockix-platform-env` anchor which injects ~35 platform variables (SENTRY_DSN, ROOT_DOMAIN, CONTROL_PLANE_REDIS_URL, etc) all via references like `${VAR}` or `${VAR:-default}`.
- DATABASE_URL: `postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform` (hybrid)
- PORT: `"4000"` (hardcoded)
- RUN_BULLMQ_CONSUMERS: `"false"` (hardcoded)

**Service: infra-worker**
- Uses `*stockix-worker-env` anchor which extends platform-env and injects worker specific vars (API_HOST, REPO_ROOT, TENANT_ENV_ROOT, etc) via references like `${VAR:-default}`.
- DATABASE_URL: `postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform` (hybrid)

### infra/tenant-stack/docker-compose.yml
**Service: server (Finance)**
- NODE_ENV: `production` (hardcoded)
- SENTRY_DSN: `${SENTRY_DSN:-}` (reference)
- DB_HOST: `${DB_HOST:-stockix-mysql-proxy}` (reference)
- DB_USER: `${DB_USER}` (reference)
- DB_PASSWORD: `${DB_PASSWORD}` (reference)
- REDIS_HOST: `${TENANT_REDIS_HOST:-stockix-redis}` (reference)
- JWT_SECRET: `${JWT_SECRET}` (reference)
- BASE_URL: `${BASE_URL}` (reference)
- REACT_APP_STOCKIX_API_URL: `${REACT_APP_STOCKIX_API_URL:-}` (reference)
*(Over 50 variables mapped via references for DB, S3, Auth, Branding)*

### infra/pos-tenant-stack/docker-compose.yml
- Contains `pos-backend` with similar explicit mapping from `.env` overrides:
- MONGODB_URI: `${MONGODB_URI}`
- REDIS_URL: `${REDIS_URL}`
- JWT_SECRET: `${JWT_SECRET}`
- PLATFORM_JWT_SECRET: `${PLATFORM_JWT_SECRET}`
- PORT: `"8010"` (hardcoded)

### infra/pms-tenant-stack/docker-compose.yml
- Contains `pms-backend` explicitly mapped:
- PMS_PORT: `"3003"` (hardcoded)
- DATABASE_URL: `${PMS_DATABASE_URL}` (reference)
- PMS_JWT_SECRET: `${PMS_JWT_SECRET}` (reference)

## 8. Summary Table

| Metric | Count / Status | Notes |
| :--- | :--- | :--- |
| **Direct `process.env` references** | > 1,500+ | Pervasive across all codebases, especially in POS, Finance, and Worker. |
| **Inline fallbacks (`??` or `\|\|`)** | > 500+ | Very common in POS app.js, Worker tenant provisioning, Finance config. |
| **`requireEnv` helper uses** | ~20 | Used sparsely in shared packages, but not universally adopted. |
| **`dotenv` or `.config()` calls** | ~50 | Present in many scripts, entry points, and test files. |
| **Services with Zod boot validation** | 0 | No service currently validates its entire process.env at boot using Zod. |
| **`.env` files checked in repo** | Multiple | Examples, test envs, and some local overrides exist. No secrets committed. |

EOF

echo "Done appending to layer3.md"
