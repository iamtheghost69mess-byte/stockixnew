# Stockix — Environment Files State Report
**Date:** 2026-05-28  
**Context:** Cursor restored env files from git history and later synced env files  
**Purpose:** READ-ONLY audit — no env changes made in this prompt

## SECTION 1 — WHAT HAPPENED (Cursor's actions)

- Git history confirms commit `09a7152d` deleted `.env` and `apps/api/.env`.
- Earlier in this chat, files were restored from `09a7152d^` (small historical files), then later overwritten from `infra/prod/.env`.
- Current state is now **byte-identical** across:
  - `.env`
  - `infra/prod/.env`
  - `apps/api/.env`
  - `apps/dashboard/.env`
- Risk level: **HIGH** (production-style env copied into app-local env files and root dev env).

---

## SECTION 2 — CURRENT FILE STATE

| File | Lines | Vars | Empty | Placeholders | Identical to prod? |
|------|------:|-----:|------:|:------------:|:-----------------:|
| `.env` | 248 | 110 | 7 | 0 | YES |
| `infra/prod/.env` | 248 | 110 | 7 | 0 | — |
| `apps/api/.env` | 248 | 110 | 7 | 0 | YES |
| `apps/dashboard/.env` | 248 | 110 | 7 | 0 | YES |

Supporting env files:
- `services/stockix-finance/packages/server/.env`: 86 lines, 60 vars
- `services/posnew/apps/pos-backend/.env`: 51 lines, 29 vars

---

## SECTION 3 — CRITICAL FINDINGS

### 🔴 DANGEROUS (must address before any deploy)

- All 4 main env files are identical (same MD5): `.env`, `infra/prod/.env`, `apps/api/.env`, `apps/dashboard/.env`.
- Root `.env` has `NODE_ENV=production` (dev root env expected to be development-oriented).
- Root/API/dashboard `DATABASE_URL` all point to docker service-style prod compose endpoint (`@postgres:5432`), not localhost dev URL.
- Many critical secrets are exactly the same across root/prod/api/dashboard (session, worker, deployment, API secret, etc.), indicating broad secret duplication into wrong files.

### 🟠 WRONG (incorrect values for file purpose)

- `apps/api/.env` is fully populated with production-style values instead of being minimal/optional.
- `apps/dashboard/.env` is fully populated with production-style values instead of mostly `NEXT_PUBLIC_*` (or absent).
- Root `.env` appears to be production payload rather than local development payload.

### 🟡 SUSPICIOUS (needs verification)

- `infra/prod/.env` has no git history (`git log -- infra/prod/.env` empty), so it is local-only state and cannot be provenance-verified from tracked commits.
- `STOCKIX_LOAD_ROOT_ENV` is missing across audited files, while loader behavior depends on default/flag logic.

### ✅ CORRECT (confirmed right)

- `.env` files are gitignored (`.env`, `infra/prod/.env`, `apps/api/.env`, `apps/dashboard/.env` all ignored).
- Git index contains only `.env.example` files (no tracked live secret `.env` files).
- Deletion provenance is clear for `09a7152d` (`D .env`, `D apps/api/.env`).

---

## SECTION 4 — VARIABLE STATUS TABLE

Legend: `SET(n)` = set with length n chars; `EMPTY` = key exists empty; `MISSING` = key absent.

| Variable | root `.env` | `infra/prod/.env` | `apps/api/.env` | `apps/dashboard/.env` | finance server `.env` | pos-backend `.env` |
|---|---|---|---|---|---|---|
| DATABASE_URL | SET(101) | SET(101) | SET(101) | SET(101) | MISSING | MISSING |
| SESSION_SECRET | SET(128) | SET(128) | SET(128) | SET(128) | MISSING | MISSING |
| PLATFORM_API_SECRET | SET(128) | SET(128) | SET(128) | SET(128) | MISSING | MISSING |
| WORKER_SECRET | SET(128) | SET(128) | SET(128) | SET(128) | MISSING | MISSING |
| AUTH_TOKEN_SECRET | SET(128) | SET(128) | SET(128) | SET(128) | MISSING | SET(128) |
| DEPLOYMENT_SECRET_KEY | SET(128) | SET(128) | SET(128) | SET(128) | MISSING | MISSING |
| LICENSE_SIGNING_SECRET | SET(128) | SET(128) | SET(128) | SET(128) | MISSING | SET(128) |
| INTERNAL_API_SECRET | SET(128) | SET(128) | SET(128) | SET(128) | SET(64) | MISSING |
| MAIL_PASSWORD | SET(36) | SET(36) | SET(36) | SET(36) | SET(36) | MISSING |
| MAIL_FROM_ADDRESS | SET(26) | SET(26) | SET(26) | SET(26) | SET(26) | MISSING |
| RESEND_API_KEY | SET(36) | SET(36) | SET(36) | SET(36) | SET(36) | SET(36) |
| RESEND_FROM_EMAIL | SET(26) | SET(26) | SET(26) | SET(26) | SET(26) | SET(26) |
| RESEND_WEBHOOK_SECRET | SET(38) | SET(38) | SET(38) | SET(38) | MISSING | MISSING |
| CONTROL_PLANE_REDIS_URL | SET(34) | SET(34) | SET(34) | SET(34) | MISSING | MISSING |
| NODE_ENV | SET(10) | SET(10) | SET(10) | SET(10) | MISSING | SET(11) |
| STOCKIX_LOAD_ROOT_ENV | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| API_DOMAIN | SET(17) | SET(17) | SET(17) | SET(17) | MISSING | MISSING |
| ROOT_DOMAIN | SET(13) | SET(13) | SET(13) | SET(13) | MISSING | MISSING |
| DASHBOARD_URL | SET(21) | SET(21) | SET(21) | SET(21) | MISSING | MISSING |
| S3_ACCESS_KEY_ID | SET(25) | SET(25) | SET(25) | SET(25) | SET(25) | MISSING |
| S3_BUCKET | SET(7) | SET(7) | SET(7) | SET(7) | SET(7) | MISSING |
| BACKUP_B2_BUCKET | SET(7) | SET(7) | SET(7) | SET(7) | MISSING | MISSING |
| SENTRY_DSN | SET(95) | SET(95) | SET(95) | SET(95) | MISSING | MISSING |
| CF_DNS_API_TOKEN | SET(53) | SET(53) | SET(53) | SET(53) | MISSING | MISSING |
| POS_PLATFORM_API_KEY | SET(32) | SET(32) | SET(32) | SET(32) | MISSING | SET(32) |
| JWT_SECRET | SET(64) | SET(64) | SET(64) | SET(64) | SET(64) | SET(64) |

---

## SECTION 5 — IDENTICAL VALUE ANALYSIS

Byte-level file identity:
- `.env` = `infra/prod/.env` = `apps/api/.env` = `apps/dashboard/.env` (same MD5).

Critical vars with identical values across 4+ files:
- `DATABASE_URL`, `SESSION_SECRET`, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `DEPLOYMENT_SECRET_KEY`
- `LICENSE_SIGNING_SECRET`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`
- `CONTROL_PLANE_REDIS_URL`, `API_DOMAIN`, `ROOT_DOMAIN`, `DASHBOARD_URL`
- `S3_ACCESS_KEY_ID`, `S3_BUCKET`, `BACKUP_B2_BUCKET`, `SENTRY_DSN`, `CF_DNS_API_TOKEN`, `POS_PLATFORM_API_KEY`

Risk assessment:
- This is consistent with a direct copy/sync from one file to all others, not role-specific env separation.

---

## SECTION 6 — GIT HISTORY ANALYSIS

- `.env` history exists and shows delete at `09a7152d`.
- `apps/api/.env` history exists and also shows delete at `09a7152d`.
- `apps/dashboard/.env` has no git history (not tracked).
- `infra/prod/.env` has no git history (not tracked).
- In tracked history, parent of deletion commit (`09a7152d^`) had small `.env` (~11 lines), not the current 248-line structure.

Interpretation:
- Current large files are local/runtime state, not recoverable as a large tracked root `.env` from git commit history in this repo.

---

## SECTION 7 — WHAT EACH FILE SHOULD LOOK LIKE

| File | Expected Purpose | Expected Lines | Current Lines | Status |
|------|------------------|:--------------:|:-------------:|--------|
| `.env` | Dev env | ~100-160 | 248 | WRONG |
| `infra/prod/.env` | Prod env | ~100-120 | 248 | REVIEW NEEDED |
| `apps/api/.env` | Minimal/empty | 0-10 | 248 | WRONG |
| `apps/dashboard/.env` | NEXT_PUBLIC only / minimal | 0-20 | 248 | WRONG |

Notes:
- Repo comments in `.env.example` and `apps/dashboard/.env.example` indicate root-loading pattern, not full duplicated per-app secret files.

---

## SECTION 8 — RECOMMENDED NEXT STEPS

**Before any code changes or deploy:**
1. Freeze env syncing and treat current state as incident evidence.
2. Decide source-of-truth policy (root-dev vs infra/prod vs per-service env ownership).
3. Rebuild role-specific files from policy, not by cloning one file everywhere.
4. Re-issue secrets if any were copied into broader blast-radius files by mistake.
5. Validate app boot paths against `@repo/config` and expected dev/prod modes.

**Priority 1 (immediate danger):**
- Remove production-equivalent secret duplication from `apps/api/.env` and `apps/dashboard/.env`.
- Ensure dev workflows do not run with prod DB target and prod secret set.

**Priority 2 (correctness):**
- Set correct `NODE_ENV` and `DATABASE_URL` per environment purpose.
- Verify `INTERNAL_API_SECRET` alignment where cross-service auth is required, but scoped correctly.

**Priority 3 (cleanup):**
- Keep app-level `.env` minimal or absent if root config loader is canonical.
- Add/clarify env governance docs and checks to prevent identical-file sync regression.

---

## SECTION 9 — DO NOT DO UNTIL THIS IS RESOLVED

- Do NOT deploy to production
- Do NOT run local dev with these copied production-style files as-is
- Do NOT commit any non-example env file
- Do NOT run any env sync script again without ownership mapping and verification

---

## SECTION 10 — SERVICE-BY-SERVICE ENV AUDIT

### How to read this section
Each service shows:
- **Current .env**: what exists today
- **Missing**: in `.env.example` but not in `.env`
- **Empty**: key present but no value
- **Required**: must be set for service to work
- **Optional**: third-party integrations (can be empty)
- **Dev value**: what to use locally
- **Prod value**: what to use on production server

### Complete env file map

Detected env files (`.env`, `.env.local`, `.env.production`, `.env.development`, `.env.staging`, `.env.test`):

- `.env` | 248 lines | 110 vars | 7 empty
- `infra/prod/.env` | 248 lines | 110 vars | 7 empty
- `apps/api/.env` | 248 lines | 110 vars | 7 empty
- `apps/dashboard/.env` | 248 lines | 110 vars | 7 empty
- `services/stockix-finance/.env` | 56 lines | 36 vars | 2 empty
- `services/stockix-finance/packages/server/.env` | 86 lines | 60 vars | 4 empty
- `services/posnew/apps/pos-backend/.env` | 51 lines | 29 vars | 0 empty
- `services/pms/.env` | not found
- `services/pms/frontend/.env.local` | 3 lines | 2 vars | 0 empty
- `services/posnew/apps/pos-frontend2/.env.local` | 3 lines | 2 vars | 0 empty
- `services/posnew/apps/pos-backend/.env.local` | 4 lines | 2 vars | 0 empty

Detected `.env.example` files include:
- `.env.example` (153 vars)
- `infra/prod/.env.example` (117 vars)
- `apps/api/.env.example` (0 vars; guidance-only)
- `apps/dashboard/.env.example` (0 vars; guidance-only)
- `services/stockix-finance/.env.example` (56 vars)
- `services/stockix-finance/packages/server/.env.example` (60 vars)
- `services/stockix-finance/packages/webapp/.env.example` (7 vars)
- `services/posnew/apps/pos-backend/.env.example` (15 vars)
- `services/posnew/apps/pos-frontend2/.env.example` (1 var)
- `services/pms/.env.example` (16 vars)
- `services/pms/frontend/.env.example` (2 vars)
- `services/chatlive/.env.example` (59 vars)
- `services/chatlive/tests/playwright/.env.example` (3 vars)

### Finance Root (`services/stockix-finance/.env`)

Status:
- Current: 56 lines, 36 vars
- Example: 56 vars
- Missing: 30 keys
- Empty: `SIGNUP_ALLOWED_DOMAINS`, `SIGNUP_ALLOWED_EMAILS`
- Extra: 10 keys (`DB_CLIENT`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SYSTEM_DB_HOST`, `SYSTEM_DB_PASSWORD`, `SYSTEM_DB_USER`, `TENANT_DB_HOST`, `TENANT_DB_NAME_PREFIX`, `TENANT_DB_PASSWORD`, `TENANT_DB_USER`)

Missing keys:
- `API_RATE_LIMIT`, `APP_JWT_SECRET`, `EXCHANGE_RATE_SERVICE`
- `FINANCE_PROVISION_PASSWORD`, `FINANCE_PROVISION_SECRET`
- `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`
- `OPEN_EXCHANGE_RATE_APP_ID`
- `PLAID_CLIENT_ID`, `PLAID_ENV`, `PLAID_LINK_WEBHOOK`, `PLAID_SECRET`
- `POSTHOG_API_KEY`, `POSTHOG_HOST`
- `PUBLIC_PROXY_PORT`, `PUBLIC_PROXY_SSL_PORT`
- `REDIS_DB`, `REDIS_PASSWORD`
- `S3_ACCESS_KEY_ID`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_SECRET_ACCESS_KEY`
- `SOCKET_ALLOWED_ORIGINS`
- `STRIPE_PAYMENT_CLIENT_ID`, `STRIPE_PAYMENT_PUBLISHABLE_KEY`, `STRIPE_PAYMENT_REDIRECT_URL`, `STRIPE_PAYMENT_SECRET_KEY`, `STRIPE_PAYMENT_WEBHOOKS_SECRET`

### Finance Server (`services/stockix-finance/packages/server/.env`)

Status:
- Current: 86 lines, 60 vars
- Example: 60 vars
- Missing: 17 keys
- Empty: `POSTHOG_API_KEY`, `REDIS_PASSWORD`, `SIGNUP_ALLOWED_DOMAINS`, `SIGNUP_ALLOWED_EMAILS`

Missing keys:
- `BULL_BOARD_PASSWORD`, `BULL_BOARD_USERNAME`
- `EXCHANGE_RATE_SERVICE`, `OPEN_EXCHANGE_RATE_APP_ID`
- `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`
- `PLAID_CLIENT_ID`, `PLAID_ENV`, `PLAID_LINK_WEBHOOK`, `PLAID_SECRET`
- `SOCKET_ALLOWED_ORIGINS`
- `STRIPE_PAYMENT_CLIENT_ID`, `STRIPE_PAYMENT_PUBLISHABLE_KEY`, `STRIPE_PAYMENT_REDIRECT_URL`, `STRIPE_PAYMENT_SECRET_KEY`, `STRIPE_PAYMENT_WEBHOOKS_SECRET`

Runtime evidence:
- `SOCKET_ALLOWED_ORIGINS` is checked in `Socket.gateway.ts`; production path throws if missing.
- Stripe module/webhook code exists and reads Stripe config at runtime.

### Finance Webapp (`services/stockix-finance/packages/webapp/`)

Status:
- `.env` file: missing
- `.env.example`: 7 vars

Missing from current (because `.env` absent):
- `ESLINT_NO_DEV_ERRORS`
- `REACT_APP_STOCKIX_API_URL`
- `REACT_APP_STOCKIX_DISCOVERY_SLUG`
- `REACT_APP_STOCKIX_TENANT_ID`
- `REACT_APP_VERSION`
- `TSC_COMPILE_ON_ERROR`
- `VITE_STOCKIX_LOGO_URL`

### POS Backend (`services/posnew/apps/pos-backend/.env`)

Status:
- Current: 51 lines, 29 vars
- Example: 15 vars
- Missing: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Empty: none

Critical check:
- `LICENSE_SIGNING_SECRET` **matches** `infra/prod/.env` (same prefix and full value match).

### POS Frontend (`services/posnew/apps/pos-frontend2/`)

Status:
- `.env.local` exists with 2 vars:
  - `NEXT_PUBLIC_POS_API_ORIGIN`
  - `NEXT_PUBLIC_POS_DEBUG_AUTH`
- `.env.example` contains expected local origin guidance.

### PMS (`services/pms/`)

Status:
- `.env`: missing
- `.env.example`: 16 vars

Missing due to absent file:
- `NODE_ENV`, `DATABASE_URL`, `AUTH_TOKEN_SECRET`
- `PMS_PORT`, `CORS_ALLOWED_ORIGINS`
- `INTERNAL_API_SECRET`, `PLATFORM_API_SECRET`
- `PMS_ICAL_SYNC_INTERVAL_MS`, `GEMINI_API_KEY`
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SECURE`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`

### PMS Frontend (`services/pms/frontend/`)

Status:
- `.env.local` exists and aligns with `.env.example` keys:
  - `NEXT_PUBLIC_PMS_API_URL`
  - `NEXT_PUBLIC_SESSION_COOKIE`

### Chatwoot (`services/chatlive/`)

Status:
- `services/chatlive/.env`: missing
- `.env.example` exists (59 vars)
- Chatwoot runtime env is primarily injected via compose/deployment env wiring, not local tracked `.env`.

### Control Plane API (`apps/api/`)

Status:
- `apps/api/.env` exists with 248 lines / 110 vars.
- `apps/api/.env.example` is guidance-only and states root env is canonical.
- `packages/config/src/index.ts` loads root `.env` and `.env.local` from monorepo root.

Conclusion:
- `apps/api/.env` should be minimal/optional, not a full 248-line mirrored secret file.

### Dashboard (`apps/dashboard/`)

Status:
- `apps/dashboard/.env` exists with 248 lines / 110 vars.
- `apps/dashboard/.env.example` is guidance-only and says root env is preferred.
- `apps/dashboard/next.config.ts` imports `@repo/config` (root env loader).
- `NEXT_PUBLIC_*` usage exists in dashboard files; server-only secrets should not be broadly duplicated here.

### Infra Worker (`infra/worker-service/`)

Status:
- No dedicated `infra/worker-service/.env` found.
- Worker relies on shared config/environment (`@repo/config` pattern and injected env).

---

## SECTION 11 — COMPLETE MISSING VARS MASTER LIST

### 🔴 Missing & Required (service breaks without these in relevant deployments)

| Service | Variable | Why Required | Where to Get Value |
|---------|---------|-------------|-------------------|
| Finance server | `SOCKET_ALLOWED_ORIGINS` | WebSocket CORS guard; production check enforced | Env policy per domain (`http://localhost:3000` dev / prod domain) |
| Finance root/server | `S3_ACCESS_KEY_ID` | Storage/attachments path | Storage/B2 credentials source |
| Finance root/server | `S3_SECRET_ACCESS_KEY` | Storage/attachments path | Storage/B2 credentials source |
| Finance root/server | `S3_BUCKET` | Storage/attachments path | Storage/B2 credentials source |
| Finance root/server | `S3_ENDPOINT` | Storage/attachments path | Storage/B2 endpoint |
| Finance root/server | `S3_REGION` | Storage/attachments path | Storage region config |
| Finance root | `APP_JWT_SECRET` | Finance auth consistency | Finance auth secret policy |

### 🟡 Missing & Optional (feature disabled without these)

| Service | Variable group | Feature Disabled | Priority |
|---------|----------------|-----------------|---------|
| Finance root/server | `STRIPE_PAYMENT_*` | Stripe payments/webhooks/OAuth | High if Stripe used |
| Finance root/server | `OPEN_EXCHANGE_RATE_APP_ID`, `EXCHANGE_RATE_SERVICE` | External FX rate integration | Medium/High if multi-currency |
| Finance root/server | `PLAID_*` | Plaid bank sync | Medium if banking sync used |
| Finance root/server | `LEMONSQUEEZY_*` | LemonSqueezy billing path | Medium if used |
| Finance server | `BULL_BOARD_USERNAME`, `BULL_BOARD_PASSWORD` | Bull Board admin auth | Low (ops tooling) |
| Finance root/server | `POSTHOG_*` | Analytics telemetry | Low |
| POS backend | `RAZORPAY_*` | Razorpay flows | Optional unless Razorpay enabled |

### 🔵 Empty (key exists, currently blank)

| Service | Variable | Notes |
|---------|---------|-------|
| Finance root | `SIGNUP_ALLOWED_DOMAINS`, `SIGNUP_ALLOWED_EMAILS` | Policy values; may intentionally be empty |
| Finance server | `POSTHOG_API_KEY` | Optional analytics |
| Finance server | `REDIS_PASSWORD` | Empty can be valid if Redis has no auth |
| Finance server | `SIGNUP_ALLOWED_DOMAINS`, `SIGNUP_ALLOWED_EMAILS` | Policy values; may intentionally be empty |

---

## SECTION 12 — ENV FILE OWNERSHIP MAP

| File | Owner | Contains | Lines Expected |
|------|-------|---------|---------------|
| `.env` | Root — DEV ONLY | Local dev values, localhost DBs | ~150 |
| `infra/prod/.env` | Server only | Production secrets | ~120 |
| `apps/api/.env` | Should be minimal/absent | API reads root env via `@repo/config` | 0–10 |
| `apps/dashboard/.env` | Minimal | `NEXT_PUBLIC_*` and minimal dashboard-only overrides | 0–20 |
| `services/stockix-finance/.env` | Finance dev layer | Finance local integration values | ~56 |
| `services/stockix-finance/packages/server/.env` | Finance server runtime | NestJS runtime config | ~60 |
| `services/stockix-finance/packages/webapp/.env` | Finance webapp runtime | `REACT_APP_*`/Vite values | ~7 |
| `services/posnew/apps/pos-backend/.env` | POS dev/runtime | POS backend values | ~30+ |
| `services/pms/.env` | PMS runtime | PMS service config | ~16 |

---

## SECTION 13 — NEXT STEPS BEFORE ANY FIX

1. Confirm canonical load path:
   - `packages/config/src/index.ts` (root `.env` / `.env.local` loader)
2. Confirm `apps/api/.env` and `apps/dashboard/.env` ownership:
   - Keep minimal or remove if root remains canonical
3. Confirm local/dev baseline values:
   - `NODE_ENV=development` in local root flow
   - `DATABASE_URL` local target for dev stacks
4. Confirm production baseline values:
   - `NODE_ENV=production` in production env files only
   - production DB/hostnames only in production env files
5. For Finance service specifically:
   - decide required integration set (Stripe/Plaid/LemonSqueezy/OpenExchangeRates)
   - fill required missing runtime/security keys first (`SOCKET_ALLOWED_ORIGINS`, storage keys)


