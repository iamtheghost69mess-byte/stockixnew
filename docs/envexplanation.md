# Environment Variables — Explanation Guide

Last updated: 2026-05-23

> Variable-by-variable reference for the **repo-root** canonical schema (`.env.example`, ~138 keys).
> For file locations and ownership see [ENV_MAP.md](./ENV_MAP.md).
> For setup steps see [LOCAL_SETUP.md](./LOCAL_SETUP.md).

---

## NODE

### NODE_ENV
- **What:** Runtime profile. Controls logging verbosity, error detail, and build behavior.
- **Local:** `development`
- **Production:** `production`
- **Required:** Yes
- **Used by:** API (`apps/api`), Dashboard (`apps/dashboard`), Worker (`infra/worker-service`)

### HOSTNAME
- **What:** Process identity label in logs and health metadata.
- **Local:** `server`
- **Production:** `server`
- **Required:** No
- **Used by:** API

---

## DATABASE

### DATABASE_URL
- **What:** PostgreSQL connection string for the Stockix **control-plane** database (owners, tenants, jobs).
- **Local:** `postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform`
- **Production:** `postgresql://postgres:[PASSWORD]@postgres:5432/stockix_platform` (Docker service hostname `postgres`)
- **Required:** Yes
- **Used by:** API, Dashboard, Worker, Drizzle migrations (`packages/db`)

### DB_WAIT_TIMEOUT_MS
- **What:** Milliseconds to wait for Postgres to accept connections on startup/scripts.
- **Local:** `90000`
- **Production:** `90000`
- **Required:** No (defaults to 90000 in `@repo/config`)
- **Used by:** DB bootstrap scripts

### DB_CLIENT, DB_HOST, DB_USER, DB_PASSWORD, DB_CHARSET
- **What:** Legacy Stockix finance runtime database overrides (MySQL-era). Often empty when using `DATABASE_URL` only at platform level.
- **Local:** Empty
- **Production:** Empty at platform layer; tenant stacks set their own in provisioned `.env`
- **Required:** No (platform)
- **Used by:** Legacy finance paths if tenant `.env` sets them

### SYSTEM_DB_CLIENT, SYSTEM_DB_HOST, SYSTEM_DB_USER, SYSTEM_DB_PASSWORD, SYSTEM_DB_NAME, SYSTEM_DB_CHARSET
- **What:** Finance **system** catalog database connection pieces (orgs, global settings).
- **Local:** `SYSTEM_DB_NAME=stockix_system`; others often empty (inherit `DB_*`)
- **Production:** Set in tenant/provisioner env as needed
- **Required:** For isolated finance server dev
- **Used by:** Finance server (`packages/server` NestJS `system-database` config)

### TENANT_DB_CLIENT, TENANT_DB_NAME_PREFIX, TENANT_DB_NAME_PERFIX, TENANT_DB_HOST, TENANT_DB_USER, TENANT_DB_PASSWORD, TENANT_DB_CHARSET
- **What:** Per-tenant database naming and connection. `TENANT_DB_NAME_PERFIX` is a legacy typo alias kept for compatibility.
- **Local:** `TENANT_DB_NAME_PREFIX=stockix_tenant_`
- **Production:** `stockix_tenant_` (must match provisioner)
- **Required:** Yes for finance tenant DB creation
- **Used by:** Finance server (`tenant-database` config), provisioner

---

## API

### PORT
- **What:** HTTP port the platform API listens on.
- **Local:** `4000`
- **Production:** `4000` (internal; Traefik routes public 443 → API)
- **Required:** Yes
- **Used by:** API

### PLATFORM_API_SECRET
- **What:** Shared secret for Dashboard→API privileged routes and internal auth headers.
- **Local:** 64-byte hex (generate — never commit)
- **Production:** Different 64-byte hex from dev
- **Required:** Yes
- **Used by:** API, Dashboard

### WORKER_SECRET
- **What:** Authenticates infra worker job claim/complete and internal worker callbacks to the control-plane API.
- **Local:** 32+ byte hex
- **Production:** Different value from dev; **do not** reuse as `INTERNAL_API_SECRET` in production
- **Required:** Yes
- **Used by:** API, Worker

### INTERNAL_API_SECRET
- **What:** Shared secret for Finance server internal routes (`x-internal-secret` header): provision attach-user, warehouse activation, license sync, **`GET /api/internal/resolve-tenant`**, and finance user proxy from the API.
- **Local:** Optional — `@repo/config` falls back to `WORKER_SECRET` in `development`/`test` when unset
- **Production:** **Required** — generate separately from `WORKER_SECRET`; must match value in each tenant `{TENANT_ENV_ROOT}/{slug}/.env` (worker copies it via `tenant-env.ts`)
- **Required:** Yes in production
- **Used by:** API (`apiConfig.internalApiSecret`), Worker, Finance server (`InternalSecretGuard`), tenant Finance containers
- **Troubleshooting:** Dashboard “Finance tenant id is not set” often means this secret or `TENANT_INTERNAL_HOST` does not match the running Finance stack

### DASHBOARD_URL
- **What:** Public URL of the operator dashboard (redirects, CSRF origin checks).
- **Local:** `http://localhost:3000`
- **Production:** `https://[your-domain]`
- **Required:** Yes (staging/production)
- **Used by:** API

### ROOT_DOMAIN
- **What:** Base domain for tenant hostnames (`{slug}.ROOT_DOMAIN`).
- **Local:** `localhost`
- **Production:** e.g. `stockix.cloud`
- **Required:** Yes for multi-tenant routing
- **Used by:** API, Worker, Traefik labels

### PUBLIC_BASE_URL_SCHEME
- **What:** `http` or `https` when building external URLs.
- **Local:** `http`
- **Production:** `https`
- **Required:** Yes
- **Used by:** API, Worker

### MAX_TENANT_PORT
- **What:** Upper bound for dynamically assigned tenant proxy ports in local dev.
- **Local:** `4999`
- **Production:** Often unused (Traefik handles routing)
- **Required:** No
- **Used by:** API provisioning (dev)

### STOCKIX_TENANT_APP_ROOT, REPO_ROOT, TENANT_ENV_ROOT
- **What:** Absolute paths: finance app checkout, monorepo root, generated per-tenant env directory.
- **Local:** Often empty (auto-resolved relative to repo)
- **Production:** e.g. `/opt/stockix/stockixnew`, `/opt/stockix/tenants`
- **Required:** For provisioning on server
- **Used by:** Worker, provision scripts

### TRAEFIK_DYNAMIC_DIR, TRAEFIK_TENANT_UPSTREAM_HOST
- **What:** Where Traefik dynamic config is written; upstream host for tenant containers.
- **Local:** Default `/opt/stockix/traefik-dynamic`, `host.docker.internal`
- **Production:** Same pattern on Linux host
- **Required:** For Traefik-based deploy
- **Used by:** Worker

### TENANT_INTERNAL_HOST
- **What:** Hostname the API and worker use to reach tenant Finance/POS containers on the host (health checks, finance users proxy, internal resolve).
- **Local:** `127.0.0.1`
- **Production:** `host.docker.internal` (see `infra/prod/.env.example`)
- **Required:** Yes for provisioning and finance user management
- **Used by:** Worker, API (`apiConfig.tenantInternalHost` → `http://{host}:{internalPort}`)

### CORS_ORIGINS
- **What:** Comma-separated allowed browser origins for API CORS.
- **Local:** Empty (permissive dev) or `http://localhost:3000`
- **Production:** `https://your-domain.com,https://www.your-domain.com`
- **Required:** Recommended in production
- **Used by:** API

### STOCKIX_API_URL
- **What:** Base URL for CLI/smoke scripts hitting the API.
- **Local:** `http://localhost:4000`
- **Production:** `https://api.[domain]`
- **Required:** For scripts
- **Used by:** Smoke/provision scripts

### PROVISION_POLL_MS, PROVISION_MAX_MS
- **What:** Polling interval and max wait for tenant provision jobs.
- **Local:** `2000`, `2700000` (45 min)
- **Production:** Same defaults unless builds are slower
- **Required:** No
- **Used by:** Worker, scripts

### OWNER_ID, PROVISION_ADMIN_EMAIL
- **What:** Target owner and default admin email for provision/smoke tooling.
- **Local:** Empty / `admin@localhost`
- **Production:** Set per operator workflow
- **Required:** No
- **Used by:** Provision scripts

### WORKER_JOB_ID, WORKER_JOB_EXECUTION_TIMEOUT_MS
- **What:** Optional single-job override and per-job timeout cap.
- **Local:** Empty / `2700000`
- **Production:** Same
- **Required:** No
- **Used by:** Worker

### METRICS_ENDPOINT, METRICS_AUTH_TOKEN
- **What:** Optional telemetry export sink and bearer token.
- **Local:** Empty
- **Production:** Empty unless using external metrics
- **Required:** No
- **Used by:** API, Worker

---

## AUTH

### SESSION_SECRET
- **What:** Signs session cookies for Dashboard and API session middleware.
- **Local:** 64-byte hex (rotated if ever leaked in git)
- **Production:** Different 64-byte hex
- **Required:** Yes
- **Used by:** API, Dashboard

### AUTH_TOKEN_SECRET
- **What:** Signs and verifies **Stockix product** JWTs (`@repo/auth` / Jose). Must be identical on control plane, POS tenant stacks, and PMS.
- **Local:** 64-byte hex
- **Production:** Different 64-byte hex from dev
- **Required:** Yes
- **Used by:** API, PMS (`services/pms`), POS (`verifyStockixJWT` / compose at provision)
- **Not the same as:** `JWT_SECRET` (Finance/POS legacy app tokens) or `SESSION_SECRET` (dashboard cookies)

### LICENSE_SIGNING_SECRET
- **What:** HS256 secret for POS offline license JWTs (min 32 chars).
- **Local:** 32-byte hex
- **Production:** Different 32-byte hex
- **Required:** Yes outside dev/test
- **Used by:** API (`apiConfig.licenseSigningSecret`)

### ALLOW_BOOTSTRAP_LOGIN
- **What:** Enables break-glass bootstrap login endpoint.
- **Local:** `false`
- **Production:** `false`
- **Required:** No
- **Used by:** API

### BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD
- **What:** Credentials for one-time bootstrap admin creation.
- **Local:** Generated password
- **Production:** Strong unique password
- **Required:** If using bootstrap flow
- **Used by:** API bootstrap scripts

### PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD
- **What:** Dashboard operator login (session auth helper).
- **Local:** Your email + generated password
- **Production:** Operator email + strong password
- **Required:** Yes for dashboard login
- **Used by:** Dashboard

### DEPLOYMENT_SECRET_KEY
- **What:** Input to derive deterministic per-tenant deployment secrets (hashed in config).
- **Local:** 32+ byte hex
- **Production:** Different 32+ byte hex
- **Required:** Yes
- **Used by:** API, Worker

### JWT_SECRET
- **What:** Legacy finance JWT env (superseded by `APP_JWT_SECRET` in finance server).
- **Local:** Empty at root
- **Production:** Empty at root
- **Required:** No at platform root
- **Used by:** Legacy references only

### SIGNUP_DISABLED
- **What:** Disables public self-service signup on finance tenants when propagated.
- **Local:** `true`
- **Production:** `true`
- **Required:** Yes (operator-provisioned model)
- **Used by:** API → tenant env; finance `signup-restrictions` config

### SIGNUP_ALLOWED_DOMAINS, SIGNUP_ALLOWED_EMAILS
- **What:** Optional allowlists appended to tenant signup policy.
- **Local:** Empty
- **Production:** Empty or operator-defined
- **Required:** No
- **Used by:** API, finance server

---

## DASHBOARD PUBLIC

### NEXT_PUBLIC_STOCKIX_API_URL
- **What:** Browser-visible API base URL (baked at build for production images).
- **Local:** `http://localhost:4000`
- **Production:** `https://api.[domain]`
- **Required:** Yes
- **Used by:** Dashboard (Next.js)

### NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME
- **What:** Scheme for constructing tenant URLs in the browser.
- **Local:** `http`
- **Production:** `https`
- **Required:** Yes
- **Used by:** Dashboard

### NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN
- **What:** Root domain shown in tenant URL helpers.
- **Local:** `localhost`
- **Production:** Your apex domain
- **Required:** Yes
- **Used by:** Dashboard

### NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST
- **What:** Host override for tenant links in local dev (`127.0.0.1` vs `localhost`).
- **Local:** `127.0.0.1`
- **Production:** N/A (use real DNS)
- **Required:** Local only
- **Used by:** Dashboard

---

## SECURITY HEADERS

### SECURITY_HSTS, SECURITY_X_FRAME_OPTIONS, SECURITY_REFERRER_POLICY, SECURITY_X_CONTENT_TYPE_OPTIONS, SECURITY_CSP_BASE
- **What:** HTTP security headers applied by the Dashboard proxy/middleware.
- **Local:** Defaults from `.env.example`
- **Production:** Tighten CSP if you add third-party scripts
- **Required:** No (defaults exist)
- **Used by:** Dashboard

---

## INFRA / DEPLOY

### POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST_PORT
- **What:** Postgres container credentials and host-published port for ops/backup.
- **Local:** `postgres` / `postgres` / `stockix_platform` / `54330`
- **Production:** Strong `POSTGRES_PASSWORD`; port `54330` bound to localhost only in compose
- **Required:** Yes for `infra/prod` compose
- **Used by:** `infra/prod/docker-compose.yml`, `infra/dev/docker-compose.yml`

### ACME_EMAIL
- **What:** Contact email for Let's Encrypt certificate registration.
- **Local:** `ops@example.com` (unused locally)
- **Production:** Real mailbox you monitor
- **Required:** Yes for production HTTPS
- **Used by:** Traefik ACME resolver

### CF_DNS_API_TOKEN
- **What:** Cloudflare DNS API token. Used by Traefik for ACME DNS challenge to issue SSL certificates.
- **Local:** Empty (no SSL locally)
- **Production:** Create at cloudflare.com → Profile → API Tokens → Create Token → "Edit zone DNS"
- **Required:** Yes for production HTTPS
- **⚠️ Fill manually — do not generate, get from Cloudflare dashboard**

### STOCKIX_REPO
- **What:** Absolute path to git checkout on the server (compose volume mount).
- **Local:** `/opt/stockix/stockixnew` (informational)
- **Production:** `/opt/stockix/stockixnew` on deploy host
- **Required:** Yes on server
- **Used by:** `infra/prod/docker-compose.yml` worker volume

---

## TENANT STACK

### BASE_URL
- **What:** Public URL template for a tenant finance deployment.
- **Local:** `https://{slug}.{ROOT_DOMAIN}` (logical)
- **Production:** Same pattern with real domain
- **Required:** Tenant compose
- **Used by:** Tenant stack templates

### PUBLIC_PROXY_PORT, PUBLIC_PROXY_SSL_PORT
- **What:** Ports published by tenant nginx front door.
- **Local:** `80` / `443`
- **Production:** `443` via Traefik (tenant internal)
- **Required:** Tenant compose
- **Used by:** `infra/tenant-stack`

### MONGODB_DATABASE_URL
- **What:** MongoDB URL for Agenda job scheduler in legacy finance stack.
- **Local:** `mongodb://mongo/stockix` (Docker network)
- **Production:** Same pattern in tenant compose
- **Required:** If using Agenda features
- **Used by:** Tenant stack Mongo service

---

## MAIL

### MAIL_HOST
- **What:** SMTP server hostname for sending transactional email.
- **Local:** Leave empty — use [Mailpit](https://github.com/axllent/mailpit) on `localhost:1025`
- **Production:** `smtp.resend.com`
- **Required:** No (email features disabled when empty)
- **Used by:** Finance server Nodemailer (`mail` config)

### MAIL_USERNAME
- **What:** SMTP auth username. For Resend SMTP use `resend`.
- **Local:** Empty
- **Production:** `resend`
- **Required:** When SMTP enabled
- **Used by:** Finance server

### MAIL_PASSWORD
- **What:** SMTP password. For Resend, this is your Resend API key.
- **Local:** Empty
- **Production:** Your Resend API key from resend.com/api-keys
- **Required:** Yes for production email
- **⚠️ Fill manually — do not generate, get from Resend dashboard**

### MAIL_PORT
- **What:** SMTP port (`587` for Resend STARTTLS).
- **Local:** `1025` (Mailpit) or empty
- **Production:** `587`
- **Required:** When SMTP enabled
- **Used by:** Finance server

### MAIL_SECURE
- **What:** Enable TLS for SMTP (`true`/`false`).
- **Local:** `false` (Mailpit)
- **Production:** `false` for Resend on port 587
- **Required:** No
- **Used by:** Finance server

### MAIL_FROM_NAME, MAIL_FROM_ADDRESS
- **What:** Default sender display name and email address.
- **Local:** `Stockix` / `noreply@example.com`
- **Production:** `Stockix` / `noreply@[your-domain]`
- **Required:** When sending mail
- **Used by:** Finance server

---

## WORKER / JOBS

### AGENDASH_AUTH_USER, AGENDASH_AUTH_PASSWORD
- **What:** Basic auth for Bull/Agenda dashboard UI (legacy).
- **Local:** `agendash` / empty or generated
- **Production:** Strong password if exposed
- **Required:** No
- **Used by:** Legacy Agenda stack

### AGENDA_DB_COLLECTION, AGENDA_POOL_TIME, AGENDA_CONCURRENCY
- **What:** Mongo Agenda scheduler tuning.
- **Local:** Empty (defaults)
- **Production:** Empty
- **Required:** No
- **Used by:** Legacy finance Agenda

### EASY_SMS_TOKEN
- **What:** Third-party SMS provider token (legacy).
- **Local:** Empty
- **Production:** Empty
- **Required:** No
- **Used by:** Legacy SMS integration

---

## TEST / TOOLING

### PLAYWRIGHT_TEST_BASE_URL
- **What:** Base URL for E2E tests.
- **Local:** `http://localhost:4000`
- **Production:** Staging URL
- **Required:** For E2E only
- **Used by:** Playwright config

### SMOKE_OWNER_ID
- **What:** Fixed owner UUID for idempotency smoke scripts.
- **Local:** Empty
- **Production:** Empty
- **Required:** No
- **Used by:** `apps/api/scripts`

### BROWSER_WS_ENDPOINT, PUBLIC_URL
- **What:** Optional remote browser and legacy webapp URL overrides.
- **Local:** Empty
- **Production:** Empty
- **Required:** No
- **Used by:** Tests / legacy webapp

### npm_package_json, npm_package_type, MONOREPO_VERSION
- **What:** Injected by npm/runtime for build metadata.
- **Local:** Empty
- **Production:** Set in CI if needed
- **Required:** No
- **Used by:** Build tooling

---

## DOCKER COMPOSE TIMEOUTS (worker)

### DOCKER_COMPOSE_UP_TIMEOUT_MS
- **What:** Max wait for `docker compose up` / image pull during provision.
- **Local:** `1800000` (30 min)
- **Production:** Same unless slow registry
- **Required:** No
- **Used by:** Worker (`apiConfig.dockerComposeUpTimeoutMs`)

### DOCKER_COMPOSE_RUN_TIMEOUT_MS
- **What:** Max wait for one-off `docker compose run` (migrations).
- **Local:** `900000` (15 min)
- **Production:** Same
- **Required:** No
- **Used by:** Worker

### DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS
- **What:** Default timeout for other compose subcommands.
- **Local:** `600000` (10 min)
- **Production:** Same
- **Required:** No
- **Used by:** Worker

---

## RATE LIMITING (API)

### THROTTLE_GLOBAL_TTL, THROTTLE_GLOBAL_LIMIT
- **What:** Global request throttle window (ms) and max requests per window.
- **Local:** `60000`, `2000`
- **Production:** Tune per traffic
- **Required:** No (defaults in `@repo/config`)
- **Used by:** API

### THROTTLE_AUTH_TTL, THROTTLE_AUTH_LIMIT
- **What:** Stricter throttle for auth routes.
- **Local:** `60000`, `200`
- **Production:** Tune per traffic
- **Required:** No
- **Used by:** API

---

## OBJECT STORAGE (S3-compatible)

### S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_ENDPOINT, S3_FORCE_PATH_STYLE
- **What:** Backblaze B2 / S3-compatible storage for tenant uploads. Worker copies into per-tenant `.env` when set.
- **Local:** Empty or B2 dev bucket
- **Production:** Backblaze keys + bucket (see `infra/prod/.env.example`)
- **Required:** No until file uploads are enabled
- **Used by:** Worker → tenant env; Finance attachments when configured

---

## ANALYTICS

### POSTHOG_API_KEY, POSTHOG_HOST
- **What:** Optional product analytics.
- **Local:** Empty
- **Production:** Set in `infra/prod/.env` when using PostHog
- **Required:** No
- **Used by:** Prod compose / dashboard when wired

---

## MULTI-PRODUCT PLATFORM

### POS_PLATFORM_BASE_URL
- **What:** Base URL for the POS platform API (`/api/platform/v1`). Control-plane API proxies org bootstrap here.
- **Local:** `http://localhost:8010`
- **Production:** `http://host.docker.internal:8010` or internal service URL
- **Required:** When using POS platform proxy
- **Used by:** `apps/api/src/pos-proxy.ts`, `posConfig.platformBaseUrl`

### POS_PLATFORM_API_KEY
- **What:** `X-Api-Key` for Stockix → POS server-to-server calls. Created on POS platform first run.
- **Local:** Empty until POS platform is configured
- **Production:** Set after generating platform key
- **Required:** For POS org bootstrap via API
- **Used by:** POS proxy, `posConfig.platformApiKey`

### POS_APP_ROOT
- **What:** Absolute or repo-relative path to `services/posnew` for worker `provisionPosStack`.
- **Local:** `services/posnew`
- **Production:** `/opt/stockix/stockixnew/services/posnew`
- **Required:** When provisioning POS module
- **Used by:** Worker, `posConfig.appRoot`

### PMS_PORT, PMS_BASE_URL
- **What:** PMS Hono service listen port and URL for API proxy routes.
- **Local:** `3003`, `http://localhost:3003`
- **Production:** `3003`, `http://host.docker.internal:3003`
- **Required:** When running PMS
- **Used by:** PMS service, `pms-proxy.ts`, `pmsConfig`

### NEXT_PUBLIC_PMS_API_URL
- **What:** Browser-visible PMS API URL (Next.js public env).
- **Local:** `http://localhost:3003`
- **Production:** Public PMS API hostname (HTTPS)
- **Required:** For PMS frontend builds
- **Used by:** `services/pms/frontend`

### PMS_APP_ROOT
- **What:** Path to `services/pms` for worker provisioning.
- **Local:** `services/pms`
- **Production:** Host path under `/opt/stockix/...`
- **Required:** When provisioning PMS module
- **Used by:** Worker, `pmsConfig.appRoot`

### PMS_ICAL_SYNC_INTERVAL_MS
- **What:** How often PMS syncs iCal feeds (milliseconds).
- **Local:** `600000` (10 min)
- **Production:** Same unless overridden
- **Required:** No
- **Used by:** PMS jobs, `pmsConfig.icalSyncIntervalMs`

### GEMINI_API_KEY
- **What:** Google Gemini API key for optional passport OCR in PMS.
- **Local:** Empty
- **Production:** Empty until feature enabled
- **Required:** No
- **Used by:** PMS, `pmsConfig.geminiApiKey`

### CHATWOOT_BASE_URL, CHATWOOT_API_ACCESS_TOKEN, CHATWOOT_SECRET_KEY_BASE, CHATWOOT_DB_PASSWORD
- **What:** Shared Chatwoot instance URL, super-admin API token, Rails `SECRET_KEY_BASE`, and Postgres password.
- **Local:** `http://localhost:3200` + empty token until boot
- **Production:** `https://chat.[domain]` + strong secrets
- **Required:** When provisioning chat module
- **Used by:** `infra/prod/docker-compose.yml`, worker Chatwoot provision, `chatwootConfig`

### CHATWOOT_FRONTEND_URL, CHATWOOT_INSTALLATION_NAME, CHATWOOT_BRAND_NAME, CHATWOOT_BRAND_URL, CHATWOOT_WIDGET_BRAND_URL
- **What:** Public Chatwoot URL and white-label metadata.
- **Local:** Defaults in `.env.example`
- **Production:** Match public chat hostname
- **Required:** For branded Chatwoot
- **Used by:** Chatwoot compose env mapping

### CHATWOOT_LOGO_URL, CHATWOOT_LOGO_DARK_URL, CHATWOOT_LOGO_THUMBNAIL_URL, CHATWOOT_DISPLAY_MANIFEST, CHATWOOT_HELPCENTER_URL
- **What:** Brand asset paths and help center link for Chatwoot UI.
- **Local:** `/brand-assets/...`
- **Production:** Same or CDN URLs
- **Required:** No
- **Used by:** Chatwoot compose

### PROVISION_MODULE_GATING
- **What:** `0` = always provision Finance stack (safe local default). `1` = provision only stacks listed in tenant `modules[]` (`accounting`, `pos`, `pms`, `chat`).
- **Local:** `0`
- **Production:** `1` in `infra/prod/.env.example`
- **Required:** No (defaults to off)
- **Used by:** Worker (`moduleGatingConfig.enabled`)

---

## PRODUCTION RUNTIME

### STOCKIX_LOAD_ROOT_ENV
- **What:** When `0` or `false`, `@repo/config` does **not** load repo-root `.env` (Compose `environment:` wins). Set in `infra/prod/docker-compose.yml` for api/worker — not usually in `.env.example`.
- **Local:** Unset (root `.env` loads)
- **Production:** `0` inside containers
- **Required:** Implicit in prod compose
- **Used by:** `@repo/config` bootstrap
