# ENV Consolidation Report

Date: 2026-05-22  
**Last reviewed:** 2026-05-23 (docs aligned with `packages/config` and `.env.example` inventory)

## Status After Consolidation Fix

| Item | Before | After (current) |
|------|--------|-----------------|
| Local `.env` multi-product vars | ❌ Missing | ⚠️ Operator must merge from `.env.example` (not auto-synced) |
| `services/pms/.env.example` | ❌ Missing | ✅ Created |
| `services/pms/frontend/.env.example` | ❌ Missing | ✅ Created |
| POS `.env.example` `AUTH_TOKEN_SECRET` | ❌ Missing | ✅ Documented |
| `@repo/config` `posConfig` | ❌ Missing | ✅ Exported (`packages/config/src/index.ts`) |
| `@repo/config` `pmsConfig` | ❌ Missing | ✅ Exported |
| `@repo/config` `chatwootConfig` | ❌ Missing | ✅ Exported |
| `@repo/config` `moduleGatingConfig` | ❌ Missing | ✅ Exported |
| `pos-proxy` / `pms-proxy` use typed config | ❌ raw `process.env` | ⏸️ Still `process.env` in `apps/api/src/*-proxy.ts` |
| `chatwoot-provision` uses typed config | ❌ raw `process.env` | ⏸️ Still raw env in worker |
| S3/PostHog in root `.env.example` | ❌ Missing | ✅ Present (lines ~256–265) |
| `NEXT_PUBLIC_PMS_API_URL` in `infra/prod/.env.example` | ❌ Missing | ✅ Present (line ~110) |
| `infra/prod/.env.example` multi-product block | ❌ Missing | ✅ POS / PMS / Chatwoot / `PROVISION_MODULE_GATING` |
| Finance `INTERNAL_API_SECRET` in tenant `.env` | — | ✅ Written by `tenant-env.ts` from worker |
| Finance users auto-link (`resolve-tenant`) | — | ✅ API uses `INTERNAL_API_SECRET` + `TENANT_INTERNAL_HOST` |

## Still Manual (Cannot Be Done by Code)

- `CHATWOOT_API_ACCESS_TOKEN` — set after Chatwoot first boot
- `POS_PLATFORM_API_KEY` — generate on POS platform first run
- `CHATWOOT_SECRET_KEY_BASE` — `openssl rand -hex 64`
- `CHATWOOT_DB_PASSWORD` — strong password for Chatwoot Postgres
- `AUTH_TOKEN_SECRET` on POS/PMS — must match root (auto on tenant provision)

---

## Summary (original audit)

| Metric | Value |
|--------|-------|
| Root `.env.example` keys (`^[A-Z_]+=`) | **138** |
| Root `.env` keys (local) | Varies — merge missing blocks from `.env.example` |
| `.env.example` files in repo | **16** (incl. `services/pms/*`, duplicate `chatlive` under `pms/`) |
| `@repo/config` product configs | ✅ `posConfig`, `pmsConfig`, `chatwootConfig`, `moduleGatingConfig` |
| Conflicts (same concept, different names) | **6** major groups (see below) |
| Services needing own `.env` (Strategy B) | Finance server, POS backend, POS frontend (local dev) |

---

## Root env snapshot

### `.env.example`

Canonical schema at repo root with sections: NODE, DATABASE, API, AUTH, DASHBOARD PUBLIC, SECURITY, INFRA, TENANT STACK, MAIL, WORKER, TEST, **MULTI-PRODUCT PLATFORM** (lines 238–258).

Product block includes:

- `POS_PLATFORM_BASE_URL`, `POS_PLATFORM_API_KEY`
- `PMS_PORT`, `PMS_BASE_URL`, `NEXT_PUBLIC_PMS_API_URL`, `PMS_APP_ROOT`, `POS_APP_ROOT`
- `CHATWOOT_*` (6 vars + brand/installation)
- `PROVISION_MODULE_GATING`

### Local `.env` (masked audit)

Present and aligned with control plane: `DATABASE_URL`, `SESSION_SECRET`, `AUTH_TOKEN_SECRET`, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `INTERNAL_API_SECRET`, Finance legacy `DB_*`, `REPO_ROOT`, dashboard `NEXT_PUBLIC_*`.

**Missing from local `.env` (present in `.env.example`):**

| Variable | In `.env.example` | In local `.env` |
|----------|-------------------|-----------------|
| `POS_PLATFORM_BASE_URL` | ✅ | ❌ |
| `POS_PLATFORM_API_KEY` | ✅ | ❌ |
| `PMS_PORT` / `PMS_BASE_URL` | ✅ | ❌ |
| `NEXT_PUBLIC_PMS_API_URL` | ✅ | ❌ |
| `PMS_APP_ROOT` / `POS_APP_ROOT` | ✅ | ❌ |
| `CHATWOOT_*` (all) | ✅ | ❌ |
| `PROVISION_MODULE_GATING` | ✅ | ❌ |

**Action:** Merge the MULTI-PRODUCT block from `.env.example` into your `.env` (empty values OK for local until POS/PMS/Chatwoot run).

---

## All `.env.example` files found

```
.env.example
apps/api/.env.example
apps/dashboard/.env.example
infra/prod/.env.example
services/pms/.env.example
services/pms/frontend/.env.example
services/chatlive/.env.example
services/chatlive/tests/playwright/.env.example
services/pms/chatlive/.env.example                    # duplicate upstream tree
services/pmsfull/RentTools.io/.env.example            # legacy reference only
services/posnew/apps/pos-backend/.env.example
services/posnew/apps/pos-frontend2/.env.example
services/stockix-finance/.env.example
services/stockix-finance/packages/server/.env.example
services/stockix-finance/packages/webapp/.env.example
```

**Still optional / missing:**

- `services/posnew/.env.example` (monorepo root only; per-app examples exist)
- `infra/dev/.env.example` (dev Postgres credentials are in compose file)

**Legacy / out of scope for consolidation:**

- `services/pmsfull/RentTools.io/.env.example` — old RentTools app (SQLite/Turso, `JWT_SECRET`, `GOOGLE_GEMINI_API_KEY`); replaced by `services/pms` + control-plane Postgres.
- `services/chatlive/.env.example` — upstream Chatwoot template; production uses `infra/prod/docker-compose.yml` + `CHATWOOT_*` in `infra/prod/.env`, not this file at runtime.

---

## Service ENV loading strategy

| Service | Strategy | Env file location | Uses `@repo/config`? | How vars are read |
|---------|----------|-------------------|----------------------|-------------------|
| **apps/api** | A | Repo root `.env` / `.env.local` | ✅ (import side-effect) | `apiConfig`, `process.env` for POS/PMS proxies |
| **apps/dashboard** | A | Repo root (via `next.config.ts` → `@repo/config`) | ✅ | `dashboardConfig`, BFF uses same root env |
| **infra worker** | A | Repo root (bundled with API tsup) | ✅ | `apiConfig`, `process.env` for POS/PMS/Chatwoot provision |
| **packages/db** | A | Repo root | ✅ | `dbConfig.databaseUrl` |
| **services/pms** | A | Repo root | ✅ | `apiConfig.authTokenSecret`, `dbConfig`, `process.env.PMS_PORT` |
| **services/pms/frontend** | A/B | Root for build; runtime `NEXT_PUBLIC_PMS_API_URL` | ❌ (Next only) | `process.env.NEXT_PUBLIC_PMS_API_URL` in `lib/pms-client.ts` |
| **services/stockix-finance** (tenant stack) | C | **Generated** `{TENANT_ENV_ROOT}/{slug}/.env` | Partial (worker uses `@repo/config` to build file) | Docker `--env-file` on `infra/tenant-stack` |
| **Finance server** (standalone dev) | B | `packages/server/.env` or monorepo root copy | ❌ | NestJS `ConfigModule.forRoot({ envFilePath: '.env' })` cwd-relative |
| **Finance webapp** | B/C | Tenant `.env` → `REACT_APP_*` | ❌ | Create React App env at build time |
| **POS backend** | B/C | `apps/pos-backend/.env` locally; compose injects at provision | ❌ | `config/config.js` + `process.env`; **also** `AUTH_TOKEN_SECRET` for Stockix JWT |
| **POS frontend2** | B | `apps/pos-frontend2/.env.local` | ❌ | `NEXT_PUBLIC_POS_API_ORIGIN` |
| **Chatwoot** | D | `infra/prod/.env` → compose `environment:` | ❌ | Rails env (`SECRET_KEY_BASE` ← `CHATWOOT_SECRET_KEY_BASE`) |

### Loading details

**`@repo/config` (`packages/config/src/index.ts`)**

- Loads `<monorepoRoot>/.env` then `.env.local` (override) unless `STOCKIX_LOAD_ROOT_ENV=0` or Vitest without `STOCKIX_LOAD_ROOT_ENV=1`.
- Exports `env`, `apiConfig`, `dashboardConfig`, `dbConfig`, `mailConfig`, `infraConfig`.
- Also exports **`posConfig`**, **`pmsConfig`**, **`chatwootConfig`**, **`moduleGatingConfig`** (worker and services should prefer these).
- **`apps/api` POS/PMS proxies** still read `process.env` directly (not migrated to `posConfig`/`pmsConfig` yet).

**apps/api POS/PMS proxies**

- `apps/api/src/pos-proxy.ts`: `POS_PLATFORM_BASE_URL`, `POS_PLATFORM_API_KEY`
- `apps/api/src/pms-proxy.ts`: `PMS_BASE_URL`

**PMS service**

- `services/pms/src/index.ts`: `@repo/config` + `PMS_PORT` + `PLATFORM_API_SECRET` for internal proxy routes
- DB: `dbConfig.databaseUrl` → same `DATABASE_URL` as control plane (no separate `PMS_DATABASE_URL` in code today)

**POS backend**

- `app.js` → `config/config.js` (no dotenv in app entry; relies on shell/compose env)
- Stockix product JWT: `AUTH_TOKEN_SECRET` in `tokenVerification.js` / `verifyStockixJWT.js`
- Legacy POS JWT: `JWT_SECRET`, `PLATFORM_JWT_SECRET` per `.env.example`

---

## Per-tenant env generation (Strategy C)

**Source:** `infra/worker-service/domain/provisioning/tenant-env.ts` → `buildTenantEnvMap()`.

Written to: `{TENANT_ENV_ROOT}/{slug}/.env` (atomic write).

| Source | Variables copied into tenant `.env` |
|--------|-------------------------------------|
| **Generated at provision** | `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `JWT_SECRET` (per-tenant random), `BASE_URL`, `PUBLIC_PROXY_PORT`, `MYSQL_VOLUME_NAME`, `STOCKIX_TENANT_APP_ROOT` |
| **Root `@repo/config` / worker env** | `MAIL_*`, `MONGODB_DATABASE_URL`, `S3_*`, `AGENDASH_*`, `INTERNAL_API_SECRET`, `REACT_APP_STOCKIX_API_URL`, `REACT_APP_STOCKIX_TENANT_ID` |
| **Fixed in map** | `SIGNUP_DISABLED=true`, `REDIS_HOST=redis`, `DB_HOST=mysql`, tenant DB naming prefixes |

**Not written to Finance tenant `.env`:** `AUTH_TOKEN_SECRET`, `POS_*`, `PMS_*`, `CHATWOOT_*` (those apply to control plane or separate product stacks).

**POS tenant stack** (`provisionPosStack`): passes `AUTH_TOKEN_SECRET` from `apiConfig.authTokenSecret`, `TENANT_ID`, `POS_APP_ROOT` into compose — must match root.

**PMS tenant stack** (`provisionPmsStack`): passes `AUTH_TOKEN_SECRET`, `PLATFORM_API_SECRET`, `DATABASE_URL`, `TENANT_ID`, `PMS_APP_ROOT`.

---

## Master variable map (selected)

| Variable | Root `.env.example` | Root `.env` (local) | Finance tenant | POS backend | PMS | Chatwoot (prod compose) | Category |
|----------|--------------------|---------------------|----------------|-------------|-----|-------------------------|----------|
| `DATABASE_URL` | ✅ Postgres | ✅ | ❌ (uses MySQL `DB_*`) | ❌ | ✅ (control plane) | ❌ | SHARED (platform) |
| `AUTH_TOKEN_SECRET` | ✅ | ✅ | ❌ | ✅ (compose + middleware) | ✅ (via config) | ❌ | **SHARED — must match across root, POS, PMS** |
| `SESSION_SECRET` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ROOT ONLY (owner HMAC) |
| `JWT_SECRET` | ✅ (legacy) | ✅ | ✅ per-tenant | ✅ POS legacy JWT | ❌ | ❌ | DUPLICATE (Finance vs POS vs root legacy) |
| `PLATFORM_JWT_SECRET` | ❌ | ❌ | ❌ | ✅ POS platform plane | ❌ | ❌ | POS ONLY |
| `LICENSE_SIGNING_SECRET` | ✅ | ✅ | ❌ | ❌ (offline license in API) | ❌ | ❌ | ROOT/API |
| `INTERNAL_API_SECRET` | ✅ | ✅ | ✅ tenant file | ❌ | ✅ internal routes | ❌ | **SHARED (API/worker ↔ Finance)** — required for provision, finance users, resolve-tenant |
| `TENANT_INTERNAL_HOST` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | API/worker reach tenant stacks (`apiConfig.tenantInternalHost`) |
| `PLATFORM_API_SECRET` | ✅ | ✅ | ❌ | ❌ | ✅ proxy | ❌ | ROOT + PMS internal |
| `POS_PLATFORM_BASE_URL` | ✅ | ❌ local | ❌ | ❌ | ❌ | ❌ | ROOT ONLY (API proxy) |
| `POS_PLATFORM_API_KEY` | ✅ | ❌ local | ❌ | ❌ (server validates X-Api-Key) | ❌ | ❌ | ROOT + POS platform API |
| `PMS_BASE_URL` / `PMS_PORT` | ✅ | ❌ local | ❌ | ❌ | ✅ | ❌ | ROOT + PMS |
| `NEXT_PUBLIC_PMS_API_URL` | ✅ | ❌ local | ❌ | ❌ | ✅ frontend | ❌ | PMS frontend |
| `MONGODB_URI` / `MONGODB_DATABASE_URL` | ✅ tenant stack | partial | ✅ `MONGODB_DATABASE_URL` | ✅ `MONGODB_URI` | ❌ | ❌ | DUPLICATE naming |
| `REDIS_HOST`+`PORT` | ❌ root | ❌ | ✅ tenant | optional `REDIS_URL` | ❌ | `REDIS_URL` | DUPLICATE |
| `MAIL_*` | ✅ | ✅ | ✅ from root | optional Resend | ❌ | SMTP from root | SHARED |
| `CHATWOOT_*` | ✅ | ❌ local | ❌ | ❌ | ❌ | ✅ mapped to Rails | ROOT → compose |
| `PROVISION_MODULE_GATING` | ✅ | ❌ local | ❌ | ❌ | ❌ | ✅ prod example | ROOT / worker |
| `GEMINI_API_KEY` | ❌ | ❌ | ❌ | ❌ | ❌ (not implemented) | ❌ | MISSING (was RentTools only) |
| `PMS_DATABASE_URL` | ❌ | ❌ | ❌ | ❌ | uses `DATABASE_URL` | ❌ | OPTIONAL (not used) |
| `S3_*` / `POSTHOG_*` | ✅ root + prod | optional local | via tenant map | B2 optional | ❌ | ✅ prod compose | Worker copies `S3_*` into tenant `.env` |

---

## Conflicts found

### 1. JWT / auth secrets (critical)

| Name | Where | Purpose |
|------|-------|---------|
| `SESSION_SECRET` | Root | Owner dashboard HMAC session (`tokens.ts`) |
| `AUTH_TOKEN_SECRET` | Root, POS compose, PMS | Stockix **product** JWT (Jose, `@repo/auth`) |
| `JWT_SECRET` | Root (legacy), Finance tenant `.env`, POS `.env` | Finance app auth; POS **legacy** access tokens |
| `APP_JWT_SECRET` | Finance `.env.example` | Finance monorepo template (often same role as `JWT_SECRET`) |
| `PLATFORM_JWT_SECRET` | POS `.env.example` | POS platform/admin plane JWT |
| `LICENSE_SIGNING_SECRET` | Root | Offline license file JWT (API `license-utils.ts`) |

**Rule:** `AUTH_TOKEN_SECRET` must be **identical** on root `.env`, POS tenant/backend compose, and PMS — already enforced in `provisionPosStack` / `provisionPmsStack`.

**Do not** conflate `JWT_SECRET` (Finance/POS legacy) with `AUTH_TOKEN_SECRET` (Stockix product modules).

### 2. Database URLs

- **Control plane:** `DATABASE_URL` (Postgres)
- **Finance tenant:** `DB_HOST`, `DB_USER`, `DB_PASSWORD`, … (MySQL in compose)
- **POS:** `MONGODB_URI`
- **Legacy RentTools:** `DATABASE_URL=file:./data/prod.db`

### 3. Redis

- Finance tenant: `REDIS_HOST` + `REDIS_PORT`
- POS: `REDIS_URL` (optional)
- Chatwoot: `REDIS_URL`

### 4. Mail

- Root `MAIL_*` → worker copies into tenant `.env`
- POS: `RESEND_*` commented in `.env.example` (different names)
- Chatwoot: `SMTP_*` / `MAILER_*` in compose from root `MAIL_*`

### 5. Public API URLs

- Dashboard: `NEXT_PUBLIC_STOCKIX_API_URL`
- Finance webapp: `REACT_APP_STOCKIX_API_URL` (injected in tenant env)
- POS frontend: `NEXT_PUBLIC_POS_API_ORIGIN`
- PMS frontend: `NEXT_PUBLIC_PMS_API_URL`

### 6. POS platform API key naming

- Root / API proxy: `POS_PLATFORM_API_KEY`
- POS backend `.env.example` does not document this key; platform API validates `X-Api-Key` separately from Stockix JWT.

---

## Variables in root `.env.example` vs `infra/prod/.env.example`

Both files now include **S3_***, **POSTHOG_***, **POS/PMS/Chatwoot** blocks, and **`PROVISION_MODULE_GATING`**. Prod uses different hostnames (`host.docker.internal`, public URLs) and **`PROVISION_MODULE_GATING=1`** by default.

| Mostly root `.env.example` only | Notes |
|----------------------------------|--------|
| Full legacy `DB_*` / `SYSTEM_DB_*` / `TENANT_DB_*` | Isolated Finance server dev |
| `PLAYWRIGHT_*`, `SMOKE_*`, `BROWSER_WS_ENDPOINT` | Tooling |
| `NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST` | Local dashboard tenant links |
| `DOCKER_COMPOSE_*_TIMEOUT_MS` | Worker compose timeouts (also set in prod example) |

| Prod-specific values | Notes |
|---------------------|--------|
| `TENANT_INTERNAL_HOST=host.docker.internal` | Required for API → tenant Finance on same host |
| `STOCKIX_LOAD_ROOT_ENV=0` | Set in compose, not in `.env.example` |

---

## `@repo/config` product configs

**Implemented** in `packages/config/src/index.ts`:

- `posConfig` — `POS_PLATFORM_BASE_URL`, `POS_PLATFORM_API_KEY`, `POS_APP_ROOT`
- `pmsConfig` — `PMS_PORT`, `PMS_BASE_URL`, `PMS_APP_ROOT`, `PMS_ICAL_SYNC_INTERVAL_MS`, `GEMINI_API_KEY`
- `chatwootConfig` — `CHATWOOT_*` (base URL, token, brand)
- `moduleGatingConfig.enabled` — `PROVISION_MODULE_GATING === '1'`

**Still using raw `process.env`:** `apps/api/src/pos-proxy.ts`, `pms-proxy.ts` (optional cleanup).

**`apiConfig.internalApiSecret`:** uses `INTERNAL_API_SECRET`, or falls back to `WORKER_SECRET` in development/test only — production must set `INTERNAL_API_SECRET` explicitly.

---

## Per-service `.env` files needed (Strategy B)

| File | Status | Recommendation |
|------|--------|----------------|
| `services/pms/.env.example` | ✅ Exists | Pointer to root; documents `AUTH_TOKEN_SECRET` + `INTERNAL_API_SECRET` |
| `services/pms/frontend/.env.example` | ✅ Exists | `NEXT_PUBLIC_PMS_API_URL=http://localhost:3003` |
| `services/posnew/apps/pos-backend/.env.example` | Exists | **Add** `AUTH_TOKEN_SECRET=` with comment “must match root” |
| `apps/api/.env.example` | Exists | OK — points to root |
| `apps/dashboard/.env.example` | Exists | OK — points to root |
| Finance `packages/server/.env.example` | Exists | OK for isolated Nest dev; tenant stack uses generated file |

---

## Optional / future additions

| Variable | Purpose | Status |
|----------|---------|--------|
| `PMS_DATABASE_URL` | Dedicated PMS Postgres | Documented in `services/pms/.env.example`; code uses `DATABASE_URL` |
| `PMS_ICAL_SYNC_INTERVAL_MS` | iCal sync interval | ✅ In root + `pmsConfig` |
| `GEMINI_API_KEY` | Passport OCR | ✅ In root + `pmsConfig` |
| Migrate API proxies to `posConfig`/`pmsConfig` | Consistency | Low priority |

---

## Manual steps before production

1. Copy MULTI-PRODUCT block from `.env.example` → local `.env` and `infra/prod/.env`.
2. Set **`AUTH_TOKEN_SECRET`** once; verify POS/PMS stacks receive the same value on provision.
3. After Chatwoot first boot: set **`CHATWOOT_API_ACCESS_TOKEN`** (super admin).
4. Create POS platform API key → **`POS_PLATFORM_API_KEY`** on control-plane API.
5. Set **`PROVISION_MODULE_GATING=1`** in prod when module-only tenants are validated; keep **`0`** locally unless testing gating.
6. Set **`INTERNAL_API_SECRET`** on prod and verify it matches each tenant Finance container (Finance users panel and internal provision routes).
7. Do **not** manually edit `{TENANT_ENV_ROOT}/{slug}/.env` except for emergencies — worker regenerates on provision.

---

## Consolidation verdict

| Area | Status |
|------|--------|
| Root `.env.example` as canonical schema | ✅ Good; product block present |
| Local `.env` synced with example | ⚠️ Missing POS/PMS/Chatwoot keys |
| Turborepo workspace services (api, dashboard, pms) | ✅ Strategy A — root only |
| Standalone POS / Finance dev | ⚠️ Strategy B — separate files; document `AUTH_TOKEN_SECRET` sync |
| Tenant Finance stack | ✅ Strategy C — worker-generated |
| Chatwoot | ✅ Strategy D — `infra/prod` compose |
| `@repo/config` typed product configs | ✅ Done |
| Legacy `pmsfull` / `chatlive` examples | ℹ️ Reference only; do not consolidate into root |

**Suggested follow-up (low priority):**

1. Merge any missing keys from `.env.example` into your local `.env` (no secrets in git).
2. Switch `apps/api/src/pos-proxy.ts` and `pms-proxy.ts` to `posConfig` / `pmsConfig`.
3. After deploy, use dashboard **Repair Finance link** or re-open Finance users if `finance_tenant_id` was missing on old tenants.
