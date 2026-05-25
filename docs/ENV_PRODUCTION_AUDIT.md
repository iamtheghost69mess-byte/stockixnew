# ENV Production Audit

**Date:** 2026-05-25 (re-verified with live audit)  
**Scope:** Root `.env`, `infra/prod/.env`, per-service env files, and `process.env` usage across the monorepo. No secrets are printed in this document.

**Re-run audit anytime:**

```bash
pnpm env:audit
pnpm env:align-local    # add missing root host/port keys + sync POS secrets from root
pnpm env:sync-pos       # sync AUTH_TOKEN_SECRET + POS_PLATFORM_API_KEY → POS backend only
pnpm env:fill-prod-gaps # fill empty prod keys (POS API key, internal hosts) without overwriting secrets
```

---

## Score (live)

| Profile | Status | Notes |
|---------|--------|-------|
| **Local dev (root + POS)** | ✅ **READY** | `AUTH_TOKEN_SECRET` and `POS_PLATFORM_API_KEY` aligned root ↔ POS backend |
| **Root `.env` (dev profile)** | ✅ Expected | `PUBLIC_BASE_URL_SCHEME=http`, `ROOT_DOMAIN=localhost` |
| **`infra/prod/.env` (compose)** | ⚠️ **Almost ready** | 2 manual items remain (TLS token, Chatwoot API token post-boot) |

**Overall production status:** ⚠️ **NOT FULLY DEPLOYABLE** until `CF_DNS_API_TOKEN` is set. Everything else required for POS provisioning and secret alignment is in place.

---

## What Was Fixed (this pass)

| Issue | Before | After |
|-------|--------|-------|
| POS backend missing `AUTH_TOKEN_SECRET` / `POS_PLATFORM_API_KEY` | Keys absent from `services/posnew/apps/pos-backend/.env` | ✅ Synced from root via `pnpm env:sync-pos` |
| Root missing internal host keys | `POS_FINANCE_INTERNAL_HOST`, `STOCKIX_FINANCE_INTERNAL_HOST` unset | ✅ Added (`host.docker.internal`, `127.0.0.1`) |
| Root missing `POS_HOST_PORT` | Unset (code defaulted to 8010) | ✅ Explicit `8010` |
| `infra/prod/.env` empty `POS_PLATFORM_API_KEY` | Empty — blocked POS module provisioning | ✅ Filled from root (empty-only merge) |
| `infra/prod/.env` missing finance internal hosts | Missing | ✅ `host.docker.internal` for both |
| Undocumented vars in `.env.example` | `STOCKIX_FINANCE_INTERNAL_HOST`, POS ports/frontend URL | ✅ Documented |
| No repeatable audit script | Manual doc only | ✅ `scripts/audit-env.mjs` + `pnpm env:audit` |

---

## Root `.env` Status

| Metric | Count |
|--------|------:|
| Keys in `.env.example` | 143 |
| Keys in root `.env` | 158 |
| Keys in `infra/prod/.env` | 88 |

### Missing from root `.env` (present in `.env.example`)

| Variable | Impact |
|----------|--------|
| `npm_package_json`, `npm_package_type` | npm runtime injection — **do not add manually** |

All operator-relevant example keys are now present in root `.env`.

### Extra in root `.env` (not in `.env.example`)

These 17 keys exist only in root `.env`:

```
DB_ROOT_PASSWORD, SIGNUP_EMAIL_CONFIRMATION,
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB,
QUEUE_HOST, QUEUE_PORT,
PMS_FRONTEND_URL, PESAN_PMS_URL, RENTTOOLS_PMS_URL,
NEXT_PUBLIC_SITE_URL,
RENTTOOLS_JWT_SECRET, RENTTOOLS_CRON_SECRET,
RENTTOOLS_DATABASE_URL, RENTTOOLS_TURSO_DATABASE_URL,
GOOGLE_GEMINI_API_KEY
```

**Recommendation:** `RENTTOOLS_*`, `PESAN_PMS_URL`, `PMS_FRONTEND_URL`, `NEXT_PUBLIC_SITE_URL`, and `GOOGLE_GEMINI_API_KEY` have **zero code references** in the active monorepo — safe to remove after confirming no external tooling depends on them. Keep `REDIS_*` / `QUEUE_*` for local Finance server.

### Empty critical vars (expected / manual)

| Variable | Status | Notes |
|----------|--------|-------|
| `CF_DNS_API_TOKEN` | Empty (root + prod) | **Required for production Traefik DNS-01 TLS** — set in Cloudflare dashboard |
| `CHATWOOT_API_ACCESS_TOKEN` | Empty | Set after Chatwoot first boot |
| `OWNER_ID`, `WORKER_JOB_ID` | Empty | Script/tooling only |
| `METRICS_*`, `POSTHOG_API_KEY` | Empty | Optional |
| `GEMINI_API_KEY` | Empty | Optional PMS OCR |

### Dev vs production profile

| Variable | Root `.env` | `infra/prod/.env` |
|----------|-------------|-------------------|
| `NODE_ENV` | `development` | `production` |
| `ROOT_DOMAIN` | `localhost` | `stockix.cloud` |
| `PUBLIC_BASE_URL_SCHEME` | `http` | `https` |
| `TENANT_ENV_ROOT` | Windows user path | `/opt/stockix/tenants` |
| `STOCKIX_FINANCE_INTERNAL_HOST` | `127.0.0.1` (host API→tenant Finance) | `host.docker.internal` (Docker gateway) |

Auth secrets are **set and ≥32 chars** in both files.

**Note:** Root and prod use **different** `AUTH_TOKEN_SECRET` / `SESSION_SECRET` values (128 chars each). This is **correct** — dev and production are separate environments. Local POS uses the **root** secret (now aligned). Production server uses prod secrets via `pnpm env:sync-prod` on the host.

---

## Per-Service ENV Status

| Service | Strategy | Status |
|---------|----------|--------|
| `apps/api` | Root via `@repo/config` | ✅ OK |
| `apps/dashboard` | Root | ✅ OK |
| `infra/worker-service` | Root | ✅ OK |
| `services/pms` | Root | ✅ OK |
| `services/posnew` | Own `.env` | ✅ Aligned with root |
| `services/stockix-finance` | Monorepo + tenant generated | ✅ OK |
| Chatwoot | Compose / prod `.env` | ⚠️ API token post-boot |

### Secret alignment (verified)

| Pair | Status |
|------|--------|
| root `AUTH_TOKEN_SECRET` ↔ POS | ✅ **MATCH** |
| root `POS_PLATFORM_API_KEY` ↔ POS | ✅ **MATCH** |
| root `POS_PLATFORM_API_KEY` ↔ prod | ✅ **MATCH** |
| root `AUTH_TOKEN_SECRET` ↔ prod | ⚠️ Different (intentional) |

---

## Critical Vars Status

| Var | Root | Prod | Notes |
|-----|:----:|:----:|-------|
| `DATABASE_URL` | ✅ | ✅ | |
| `AUTH_TOKEN_SECRET` | ✅ | ✅ | POS aligned locally |
| `POS_PLATFORM_API_KEY` | ✅ | ✅ | Fixed this pass |
| `POS_FINANCE_INTERNAL_HOST` | ✅ | ✅ | |
| `STOCKIX_FINANCE_INTERNAL_HOST` | ✅ | ✅ | |
| `MAIL_PASSWORD` (Resend) | ✅ | ✅ | |
| `CF_DNS_API_TOKEN` | ❌ | ❌ | **Production blocker** |
| `CHATWOOT_API_ACCESS_TOKEN` | ❌ | ❌ | Post-boot |

---

## Manual Steps Before Production Deploy

1. [ ] Set **`CF_DNS_API_TOKEN`** in `infra/prod/.env`
2. [ ] Boot Chatwoot → set **`CHATWOOT_API_ACCESS_TOKEN`**
3. [ ] Verify **`MAIL_FROM_ADDRESS`** in Resend
4. [ ] On server: **`pnpm env:sync-prod --confirm-server`**
5. [ ] **`pnpm docker:prebuild`** on deploy host

**Already done locally:**

- [x] POS backend secrets aligned (`pnpm env:sync-pos`)
- [x] `POS_PLATFORM_API_KEY` in prod env
- [x] Internal finance host vars in root + prod

---

## Scripts & Methodology

| Script | Purpose |
|--------|---------|
| `scripts/audit-env.mjs` | Masked env audit + readiness summary |
| `scripts/sync-pos-env-from-root.mjs` | Align POS backend with root secrets |
| `scripts/align-root-env-gaps.mjs` | Add missing documented root keys |
| `scripts/fill-prod-env-gaps.mjs` | Fill empty prod keys without overwriting |

Run `pnpm env:audit` after any env change.
