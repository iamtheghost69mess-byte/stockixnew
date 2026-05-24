# ENV Production Audit

**Date:** 2026-05-25  
**Scope:** Read-only audit of root `.env`, `infra/prod/.env`, per-service env files, and `process.env` usage across the monorepo. No secrets are printed in this document.

---

## Score

| Profile | Pass | Total | Production ready |
|---------|------|-------|------------------|
| **Root `.env` (local dev)** | 20 | 21 | **NO** — expected for dev (`PUBLIC_BASE_URL_SCHEME=http`, `ROOT_DOMAIN=localhost`) |
| **`infra/prod/.env` (production compose)** | 21 | 23 | **NO** — 2 blockers remain |

**Overall production status:** ❌ **NOT READY** — fix 2 items in `infra/prod/.env` and 2 alignment issues in POS backend before deploy.

---

## Root `.env` Status

| Metric | Count |
|--------|------:|
| Keys in `.env.example` | 137 |
| Keys in root `.env` | 155 |
| Keys in `infra/prod/.env` | 86 |
| Unique vars read in scanned code | 225 |

### Missing from root `.env` (present in `.env.example`)

| Variable | Impact |
|----------|--------|
| `POS_FINANCE_INTERNAL_HOST` | Worker uses this (via `build-finance-internal-url.ts`) for POS→Finance internal URLs. Root falls back to `host.docker.internal` default from example only if set; currently **unset** — code defaults to `127.0.0.1` via `STOCKIX_FINANCE_INTERNAL_HOST` alias. |

### Extra in root `.env` (not in `.env.example`)

These 19 keys exist only in root `.env`:

```
DB_ROOT_PASSWORD, SIGNUP_EMAIL_CONFIRMATION,
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB,
QUEUE_HOST, QUEUE_PORT,
POS_FRONTEND_URL, POS_FRONTEND_HOST_PORT,
PMS_FRONTEND_URL, PESAN_PMS_URL, RENTTOOLS_PMS_URL,
NEXT_PUBLIC_SITE_URL,
RENTTOOLS_JWT_SECRET, RENTTOOLS_CRON_SECRET,
RENTTOOLS_DATABASE_URL, RENTTOOLS_TURSO_DATABASE_URL,
GOOGLE_GEMINI_API_KEY
```

**Recommendation:** `RENTTOOLS_*`, `PESAN_PMS_URL`, `PMS_FRONTEND_URL`, `NEXT_PUBLIC_SITE_URL`, and `GOOGLE_GEMINI_API_KEY` have **zero code references** in the active monorepo — safe candidates to remove from root `.env` after confirming no external tooling depends on them. Keep `REDIS_*` / `QUEUE_*` if used for local Finance server; consider adding to `.env.example` if retained.

### Empty critical vars (root `.env`)

| Variable | Status | Notes |
|----------|--------|-------|
| `CHATWOOT_API_ACCESS_TOKEN` | Empty | Expected until Chatwoot first boot; required for tenant Chatwoot provisioning |
| `CF_DNS_API_TOKEN` | Empty | Required for production Traefik DNS-01 TLS |
| `OWNER_ID`, `WORKER_JOB_ID` | Empty | Script/tooling only |
| `METRICS_*`, `POSTHOG_API_KEY` | Empty | Optional |
| `SIGNUP_ALLOWED_*` | Empty | OK if signup disabled |
| `GEMINI_API_KEY` | Empty | Optional PMS OCR |

### Dev vs production profile (root `.env`)

| Variable | Root `.env` | `infra/prod/.env` |
|----------|-------------|-------------------|
| `NODE_ENV` | `development` | `production` |
| `ROOT_DOMAIN` | `localhost` | `stockix.cloud` |
| `PUBLIC_BASE_URL_SCHEME` | `http` | `https` |
| `TENANT_ENV_ROOT` | `C:/Users/Jad/.stockix/tenants` | `/opt/stockix/tenants` |

Auth secrets (`SESSION_SECRET`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `INTERNAL_API_SECRET`, `LICENSE_SIGNING_SECRET`, `WORKER_SECRET`) are **set and ≥32 chars** in both files.

---

## Per-Service ENV Status

| Service | Strategy | `.env` file | Critical missing / misaligned |
|---------|----------|-------------|------------------------------|
| `apps/api` | A (root via `@repo/config`) | ✅ root | Direct `process.env` bypass for `POS_*`, `PMS_*`, `STOCKIX_FINANCE_INTERNAL_HOST`, `BRAND_NAME` — not in `@repo/config` |
| `apps/dashboard` | A (root) | ✅ root | Uses `@repo/config` + Next build-time public vars |
| `infra/worker-service` | A (root) | ✅ root | Uses `STOCKIX_FINANCE_INTERNAL_HOST`, `POS_FINANCE_INTERNAL_HOST`, `POS_HOST_PORT`, `POS_FRONTEND_HOST_PORT` directly |
| `services/pms` | A (root) | ✅ (no local `.env`; loads root) | `PLATFORM_API_SECRET` used for finance sync |
| `services/posnew` | B (own `.env`) | ⚠️ partial | **`AUTH_TOKEN_SECRET` EMPTY**, **`POS_PLATFORM_API_KEY` EMPTY** — must match root |
| `services/stockix-finance` | B + C (tenant generated) | ✅ monorepo + server `.env` | Tenant stacks get env from worker at provision; `INTERNAL_API_SECRET` must match root |
| Chatwoot | D (compose) | ✅ `infra/prod/.env` | `CHATWOOT_SECRET_KEY_BASE`, `CHATWOOT_DB_PASSWORD` set in prod; API token post-boot |

### Secret alignment check

| Pair | Status |
|------|--------|
| root `AUTH_TOKEN_SECRET` ↔ POS `AUTH_TOKEN_SECRET` | ❌ **MISMATCH** — root set (128 chars), POS `.env` **empty** |
| root `POS_PLATFORM_API_KEY` ↔ POS `POS_PLATFORM_API_KEY` | ❌ **MISMATCH** — root set (32 chars), POS `.env` **empty** |
| root `INTERNAL_API_SECRET` ↔ Finance tenant stack | ⚠️ Not verifiable locally — must match at provision time |
| root `AUTH_TOKEN_SECRET` ↔ `infra/prod/.env` | ✅ Match (same length) |

---

## Critical Vars Status

| Category | Var | Root `.env` | `infra/prod/.env` | Issue |
|----------|-----|:-----------:|:-----------------:|-------|
| Database | `DATABASE_URL` | ✅ | ✅ | Root uses local Postgres; prod uses `postgres:5432` |
| Auth | `SESSION_SECRET` | ✅ | ✅ | |
| Auth | `AUTH_TOKEN_SECRET` | ✅ | ✅ | POS backend not aligned |
| Auth | `DEPLOYMENT_SECRET_KEY` | ✅ | ✅ | |
| Auth | `INTERNAL_API_SECRET` | ✅ | ✅ | |
| Auth | `PLATFORM_API_SECRET` | ✅ | ✅ | |
| Auth | `LICENSE_SIGNING_SECRET` | ✅ | ✅ | |
| Email | `MAIL_PASSWORD` (Resend) | ✅ `re_*` | ✅ `re_*` | Platform uses SMTP via `MAIL_PASSWORD`, not `RESEND_API_KEY` |
| Email | `MAIL_FROM_ADDRESS` | ✅ | ✅ | `noreply@stockix.cloud` — verify domain in Resend |
| Domain | `ROOT_DOMAIN` | ⚠️ localhost | ✅ `stockix.cloud` | Root is dev-appropriate |
| Domain | `PUBLIC_BASE_URL_SCHEME` | ❌ `http` | ✅ `https` | Root fails prod check by design |
| POS | `POS_PLATFORM_API_KEY` | ✅ | ❌ **EMPTY** | Blocks POS module provisioning in prod |
| POS | `POS_PLATFORM_BASE_URL` | ✅ | ✅ | |
| Provision | `PROVISION_MODULE_GATING` | ✅ `1` | ✅ `1` | |
| Provision | `TRAEFIK_DYNAMIC_DIR` | ✅ | ✅ | |
| Provision | `TENANT_ENV_ROOT` | ✅ | ✅ | |
| Storage | `S3_FORCE_PATH_STYLE` | ✅ `true` | ✅ `true` | |
| Storage | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | ✅ set | ✅ set | Bucket name is short (7 chars) — verify B2 bucket exists |
| TLS | `CF_DNS_API_TOKEN` | ❌ empty | ❌ empty | Blocks automated TLS via Traefik DNS challenge |
| Chatwoot | `CHATWOOT_SECRET_KEY_BASE` | ✅ | ✅ | |
| Chatwoot | `CHATWOOT_DB_PASSWORD` | ✅ | ✅ | |
| Chatwoot | `CHATWOOT_API_ACCESS_TOKEN` | ❌ empty | ❌ empty | Set after first Chatwoot boot |
| Timeouts | `WORKER_JOB_EXECUTION_TIMEOUT_MS` | ✅ 2.7M | ✅ 2.7M | |
| Timeouts | `DOCKER_COMPOSE_UP_TIMEOUT_MS` | ✅ 1.8M | N/A in prod file | Prod inherits from root via `pnpm env:sync-prod` if needed |

---

## `@repo/config` Coverage

**Canonical source:** `packages/config/src/index.ts`

Exports: `env`, `apiConfig`, `dashboardConfig`, `dbConfig`, `mailConfig`, `infraConfig`, `posConfig`, `pmsConfig`, `chatwootConfig`, `moduleGatingConfig`.

### Vars used in `apps/api` but NOT in `@repo/config`

| Variable | Used in |
|----------|---------|
| `POS_FRONTEND_URL` | `pos-proxy-http.ts`, `pos-proxy.ts` |
| `STOCKIX_FINANCE_INTERNAL_HOST` | `finance-license.client.ts` |

**Gap:** `STOCKIX_FINANCE_INTERNAL_HOST` is an undeclared alias; `.env.example` documents `POS_FINANCE_INTERNAL_HOST` instead. Worker reads both names in different files.

---

## Docker Images Status

| Image | Status |
|-------|--------|
| `stockix-webapp:local` | ✅ present |
| `stockix-server:local` | ✅ present |
| `stockix-database-migration:local` | ✅ present |
| `stockix-nginx:local` | ✅ present |

Additional local images also present: `stockix-pos-backend:local`, `stockix-pos-frontend:local`, `stockix-chatlive:local`.

---

## Unused Vars (candidates to remove)

### From root `.env` — no code references found

- `RENTTOOLS_PMS_URL`, `RENTTOOLS_JWT_SECRET`, `RENTTOOLS_CRON_SECRET`, `RENTTOOLS_DATABASE_URL`, `RENTTOOLS_TURSO_DATABASE_URL`
- `PESAN_PMS_URL`, `PMS_FRONTEND_URL`, `NEXT_PUBLIC_SITE_URL`
- `GOOGLE_GEMINI_API_KEY` (code uses `GEMINI_API_KEY`)

**Do not remove yet:** `POS_FRONTEND_URL`, `POS_FRONTEND_HOST_PORT`, `POS_HOST_PORT` — used by worker/API. `REDIS_*` / `QUEUE_*` — used by Finance server when run locally.

### From `.env.example` — appear unused in TS/JS (may be compose/docs only)

These are referenced in `infra/prod/docker-compose.yml`, docs, or tenant provisioning — **keep in `.env.example`**:

- `CHATWOOT_FRONTEND_URL`, `CHATWOOT_DB_PASSWORD`, `CHATWOOT_BRAND_*`, logo URLs
- `NEXT_PUBLIC_PMS_API_URL` (used in `services/pms/frontend/lib/pms-client.ts`)
- `POS_FINANCE_INTERNAL_HOST` (used in worker)
- `PUBLIC_PROXY_PORT`, `PUBLIC_PROXY_SSL_PORT` (tenant stack / Finance deploy)

Likely safe to deprecate from `.env.example` if confirmed unused:

- `npm_package_json`, `npm_package_type` (npm runtime injection, not configured)
- `EASY_SMS_TOKEN` (legacy Stockix SMS)
- `AGENDA_*` (legacy scheduler unless tenant stack still reads them)

---

## Vars In Code Not In `.env.example` (undocumented)

High-priority additions for `.env.example`:

| Variable | Service | Purpose |
|----------|---------|---------|
| `STOCKIX_FINANCE_INTERNAL_HOST` | API, worker | Finance internal host for license/provision URLs |
| `POS_FRONTEND_URL` | API | POS UI URL in proxy error hints |
| `POS_HOST_PORT`, `POS_FRONTEND_HOST_PORT` | Worker | Local POS stack port mapping |
| `API_HOST` | Worker | Worker→API host for job callbacks |
| `BRAND_NAME` | API mail | Email brand name (defaults to Stockix) |
| `FINANCE_INTERNAL_BASE_URL` | PMS | PMS→Finance sync base URL |
| `APP_JWT_SECRET` | Finance server | NestJS JWT (distinct from `AUTH_TOKEN_SECRET`) |

Full list of 160+ undocumented vars includes POS-backend-only keys (`JWT_SECRET`, `PLATFORM_JWT_SECRET`, `MONGODB_URI`, test/selftest vars) and Finance optional integrations (`PLAID_*`, `STRIPE_*`, `LEMONSQUEEZY_*`, `GOTENBERG_*`). These belong in per-service `.env.example` files, not necessarily root.

---

## Production `.env` Gaps

### `infra/prod/.env` vs root `.env`

- **In root but NOT in `infra/prod/.env`:** 69 keys (mostly dev/tooling: legacy DB fields, Playwright, docker timeout tuning, throttle overrides, extra PMS legacy URLs).
- **In `infra/prod/.env` but NOT in root:** 0 keys (prod is a subset).

This is **expected** — prod compose file carries only deployment-necessary vars; dev extras stay in root.

### Localhost references in `infra/prod/.env`

✅ **None found** in active (non-comment) lines.

Note: `POS_PLATFORM_BASE_URL` and `PMS_BASE_URL` use `host.docker.internal` — correct for Docker-on-host prod layout, not localhost.

### Blockers in `infra/prod/.env`

| Variable | Status |
|----------|--------|
| `POS_PLATFORM_API_KEY` | ❌ Empty — required for POS tenant provisioning |
| `CF_DNS_API_TOKEN` | ❌ Empty — required for Traefik ACME DNS-01 |
| `CHATWOOT_API_ACCESS_TOKEN` | ⚠️ Empty — obtain after Chatwoot first run |

---

## Email (Resend)

| Check | Result |
|-------|--------|
| `MAIL_HOST=smtp.resend.com` | ✅ |
| `MAIL_USERNAME=resend` | ✅ |
| `MAIL_PASSWORD` starts with `re_` | ✅ (root + prod) |
| `RESEND_API_KEY` in root | Not set — platform uses SMTP path via `MAIL_PASSWORD` |
| `MAIL_FROM_ADDRESS` | ✅ `noreply@stockix.cloud` |

POS backend uses separate `RESEND_API_KEY` / `RESEND_FROM_EMAIL` when email queue is enabled — configure in POS `.env` independently.

---

## Storage (Backblaze B2)

| Check | Result |
|-------|--------|
| `S3_ENDPOINT` | ✅ Backblaze format |
| `S3_FORCE_PATH_STYLE` | ✅ `true` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | ✅ set |
| `S3_BUCKET` | ✅ set (verify bucket name matches B2 console) |
| `S3_REGION` | ✅ `us-east-005` |

---

## Manual Steps Required Before Production

1. [ ] Set `POS_PLATFORM_API_KEY` in `infra/prod/.env` (≥10 chars) and copy same value to POS backend `.env` / tenant POS stacks
2. [ ] Set `CF_DNS_API_TOKEN` in `infra/prod/.env` for Traefik DNS-01 certificates
3. [ ] Copy root `AUTH_TOKEN_SECRET` into `services/posnew/apps/pos-backend/.env` (currently **empty**)
4. [ ] Boot Chatwoot, create super-admin API token → set `CHATWOOT_API_ACCESS_TOKEN` in `infra/prod/.env`
5. [ ] Verify `MAIL_FROM_ADDRESS` domain is verified in Resend dashboard
6. [ ] Run `pnpm env:sync-prod` after editing `infra/prod/.env` (syncs to root for worker fallback)
7. [ ] Confirm B2 bucket `S3_BUCKET` exists and app keys have write access
8. [ ] Pre-build tenant images: `pnpm docker:prebuild` (images already present locally ✅)

---

## What To Fix Now

### Priority 1 — blocks deployment

1. **`infra/prod/.env` → `POS_PLATFORM_API_KEY`** — empty; POS module provisioning will fail
2. **`infra/prod/.env` → `CF_DNS_API_TOKEN`** — empty; TLS certificate issuance will fail
3. **POS backend alignment** — `AUTH_TOKEN_SECRET` and `POS_PLATFORM_API_KEY` empty in `services/posnew/apps/pos-backend/.env` while root has values; POS JWT validation will fail in local/dev POS runs

### Priority 2 — important

1. Add **`STOCKIX_FINANCE_INTERNAL_HOST`** to `.env.example` (or standardize on `POS_FINANCE_INTERNAL_HOST` everywhere)
2. Add **`POS_FINANCE_INTERNAL_HOST`** to root `.env` (currently missing from example sync)
3. Remove dead legacy vars from root `.env`: `RENTTOOLS_*`, `PESAN_PMS_URL`, `GOOGLE_GEMINI_API_KEY`
4. Set **`CHATWOOT_API_ACCESS_TOKEN`** after Chatwoot first boot (both root and prod)
5. Add **`POS_FRONTEND_URL`**, **`POS_HOST_PORT`**, **`POS_FRONTEND_HOST_PORT`** to `.env.example` (used by worker/API, currently undocumented)

### Priority 3 — optional

1. `POSTHOG_API_KEY`, `METRICS_*` — analytics
2. `GEMINI_API_KEY` — PMS passport OCR
3. Consolidate API direct `process.env` reads into `@repo/config` (`posConfig` extension)
4. Document Finance-only vars in `services/stockix-finance/packages/server/.env.example` (Plaid, Stripe, Gotenberg, etc.)

---

## Critical Rules Checklist

| Rule | Root `.env` | `infra/prod/.env` |
|------|:-----------:|:-----------------:|
| Never commit `.env` to git | ✅ gitignored | ✅ gitignored |
| Secrets ≥32 chars | ✅ | ✅ |
| `PUBLIC_BASE_URL_SCHEME=https` in prod | N/A (dev) | ✅ |
| `ROOT_DOMAIN` no localhost in prod | N/A (dev) | ✅ |
| `PROVISION_MODULE_GATING=1` | ✅ | ✅ |
| `S3_FORCE_PATH_STYLE=true` for B2 | ✅ | ✅ |
| `MAIL_PASSWORD` / Resend `re_*` format | ✅ | ✅ |
| `AUTH_TOKEN_SECRET` identical root ↔ POS | ❌ | ⚠️ POS file empty |
| `INTERNAL_API_SECRET` identical root ↔ Finance tenant | ⚠️ verify at provision | ✅ set |
| Docker images pre-built | ✅ all 4 core images | ✅ |
| Worker timeouts ≥900000ms | ✅ 2700000 | ✅ 2700000 |

---

## Methodology

Audit performed read-only per playbook:

1. Full read of `.env.example`, masked comparison of root `.env` and `infra/prod/.env`
2. Recursive `process.env` scan across API, dashboard, worker, config, PMS, Finance server, POS backend
3. `@repo/config` coverage analysis
4. Secret length / format validation via Node (no values logged)
5. Docker image presence check
6. Cross-file secret alignment (length/equality only)

**Next step:** Apply Priority 1 fixes, then re-run Step 8 production readiness check against `infra/prod/.env`.
