# Stockix — Missing & Empty Env Variables Report

**Date:** 2026-05-27  
**Files checked:** 8 real `.env` files (read line-by-line; values classified as SET / EMPTY / PLACEHOLDER / MISSING)  
**Purpose:** Find every gap before production; no secret values appear in this document.

---

## SECTION 1 — SUMMARY DASHBOARD

| File | Total vars | Empty | Placeholder | SET | Status |
|------|----------:|------:|------------:|----:|--------|
| `.env` (root) | 155 | 54 | 8 | 93 | ⚠️ Many gaps; mail SET but auth placeholders |
| `infra/prod/.env` | 109 | 9 | 0 | 100 | ⚠️ Only optional/ops gaps |
| `services/stockix-finance/packages/server/.env` | 60 | 8 | 0 | 52 | ⚠️ **S3 block empty** |
| `services/stockix-finance/.env` | 36 | 2 | 0 | 34 | ✅ Mostly complete |
| `services/posnew/apps/pos-backend/.env` | 29 | 0 | 0 | 29 | ⚠️ All SET but **LICENSE_SIGNING_SECRET ≠ prod** |
| `pos-backend/.env.local` | 2 | 0 | 0 | 2 | ✅ |
| `pos-frontend2/.env.local` | 2 | 0 | 0 | 2 | ✅ |
| `pms/frontend/.env.local` | 2 | 0 | 0 | 2 | ✅ |

**Legend:** EMPTY = `KEY=` · PLACEHOLDER = `__MUST_OVERRIDE__`, `yourdomain`, `{slug}` template, etc. · MISSING = key absent from that file.

---

## SECTION 2 — FILE-BY-FILE: EMPTY & PLACEHOLDER VARS

### File 1: Root `.env` (65 gaps)

#### Critical — copy from `infra/prod/.env` before full-stack local dev

| Variable | Status | Can copy from | Notes |
|----------|--------|---------------|-------|
| `INTERNAL_API_SECRET` | EMPTY | `infra/prod/.env` | Finance internal API ↔ control-plane |
| `SESSION_SECRET` | PLACEHOLDER | `infra/prod/.env` | Owner sessions |
| `AUTH_TOKEN_SECRET` | PLACEHOLDER | `infra/prod/.env` | API auth (POS has separate `AUTH_TOKEN_SECRET`) |
| `DEPLOYMENT_SECRET_KEY` | PLACEHOLDER | `infra/prod/.env` | Tenant secret encryption |
| `LICENSE_SIGNING_SECRET` | PLACEHOLDER | `infra/prod/.env` | **Must match prod** for POS STXI (not POS local value) |
| `POS_PLATFORM_API_KEY` | EMPTY | `infra/prod/.env`, `pos-backend/.env` | POS provision |
| `POSTGRES_PASSWORD` | PLACEHOLDER | `infra/prod/.env` | Only if using prod-like Postgres locally |
| `PLATFORM_ADMIN_PASSWORD` | PLACEHOLDER | `infra/prod/.env` | Dashboard bootstrap |
| `BOOTSTRAP_ADMIN_PASSWORD` | PLACEHOLDER | `infra/prod/.env` | Break-glass login |

#### Storage — copy from prod (worker uses root for tenant provision)

| Variable | Status | Can copy from | Notes |
|----------|--------|---------------|-------|
| `S3_ACCESS_KEY_ID` | EMPTY | `infra/prod/.env` (`S3_*` or `BACKUP_B2_KEY_ID`) | Same B2 app key ID in prod |
| `S3_SECRET_ACCESS_KEY` | EMPTY | `infra/prod/.env` (`S3_*` or `BACKUP_B2_APP_KEY`) | Same B2 app key in prod |
| `S3_BUCKET` | EMPTY | `infra/prod/.env` | Or dedicated Finance upload bucket |
| `S3_ENDPOINT` | SET | — | Already `https://s3.us-east-005.backblazeb2.com` in root |

#### Mail — already SET in root (evidence: non-empty `MAIL_PASSWORD`, `RESEND_*`)

| Variable | Status | Notes |
|----------|--------|-------|
| `MAIL_PASSWORD` | SET | Same material as prod (security: use dev Resend key locally) |
| `MAIL_FROM_ADDRESS` | SET | `noreply@stockix.cloud` |
| `RESEND_API_KEY` | SET | Aligned with mail |
| `RESEND_FROM_EMAIL` | SET | Aligned |
| `RESEND_WEBHOOK_SECRET` | SET | Present |

#### Truly missing — manual / external service

| Variable | Status | Can copy from | Notes |
|----------|--------|---------------|-------|
| `SENTRY_DSN` | EMPTY | sentry.io project | Recommended prod + root |
| `CHATWOOT_API_ACCESS_TOKEN` | EMPTY | Chatwoot admin UI | After Chatwoot boots |
| `CONTROL_PLANE_REDIS_URL` | MISSING | `infra/prod/.env` | Add key to root if testing BullMQ locally |
| `CF_DNS_API_TOKEN` | EMPTY | `infra/prod/.env` | Only for Traefik DNS challenge locally |

#### Optional / dev-only empty (safe to leave empty locally)

`AGENDA_*`, `EASY_SMS_TOKEN`, `GEMINI_API_KEY`, `METRICS_*`, `MONOREPO_VERSION`, `OWNER_ID`, `POSTHOG_API_KEY`, `PUBLIC_URL`, `SMOKE_OWNER_ID`, `WORKER_JOB_ID`, `BROWSER_WS_ENDPOINT`, `npm_package_*`, legacy `DB_*` / `TENANT_DB_*` stubs (Finance server has real MySQL values), `CHATWOOT_*` branding URLs, `SIGNUP_ALLOWED_*`, `CORS_ORIGINS` (prod has value), `REPO_ROOT` / `TENANT_ENV_ROOT` / `STOCKIX_TENANT_APP_ROOT` (prod paths).

#### Placeholder templates (not secrets)

| Variable | Status | Notes |
|----------|--------|-------|
| `BASE_URL` | PLACEHOLDER | `https://{slug}.{ROOT_DOMAIN}` — template, not a literal URL |

---

### File 2: `infra/prod/.env` (9 empty — all optional)

| Variable | Status | Can copy from | Notes |
|----------|--------|---------------|-------|
| `SENTRY_DSN` | EMPTY | sentry.io | Recommended before launch |
| `NEXT_PUBLIC_SENTRY_DSN` | EMPTY | Same DSN (public) | Dashboard browser reporting |
| `CHATWOOT_API_ACCESS_TOKEN` | EMPTY | Chatwoot → Profile → Access Token | Chat module API |
| `POSTHOG_API_KEY` | EMPTY | posthog.com | Optional analytics |
| `GEMINI_API_KEY` | EMPTY | Google AI Studio | PMS passport OCR only |
| `METRICS_ENDPOINT` | EMPTY | Your metrics sink | Optional |
| `METRICS_AUTH_TOKEN` | EMPTY | Metrics sink | Optional |
| `SIGNUP_ALLOWED_DOMAINS` | EMPTY | Intentional (empty allowlist) | Policy |
| `SIGNUP_ALLOWED_EMAILS` | EMPTY | Intentional | Policy |

**Prod has no PLACEHOLDER values** (verified: 0 `__MUST_OVERRIDE__` in file).

---

### File 3: `services/stockix-finance/packages/server/.env` (8 empty)

| Variable | Status | Can copy from | Notes |
|----------|--------|---------------|-------|
| `S3_ACCESS_KEY_ID` | EMPTY | `infra/prod/.env` → `S3_ACCESS_KEY_ID` or `BACKUP_B2_KEY_ID` | **Required for attachments** |
| `S3_SECRET_ACCESS_KEY` | EMPTY | `infra/prod/.env` → `S3_SECRET_ACCESS_KEY` or `BACKUP_B2_APP_KEY` | Same |
| `S3_BUCKET` | EMPTY | `infra/prod/.env` → `S3_BUCKET` (`sharkix`) or new bucket | Document uploads |
| `S3_ENDPOINT` | EMPTY | `infra/prod/.env` → `S3_ENDPOINT` | B2 S3-compatible URL |
| `REDIS_PASSWORD` | EMPTY | OK if local Redis has no password | Matches empty local Redis |
| `POSTHOG_API_KEY` | EMPTY | Optional | |
| `SIGNUP_ALLOWED_DOMAINS` | EMPTY | Copy from root/prod if needed | Policy alignment |
| `SIGNUP_ALLOWED_EMAILS` | EMPTY | Copy from root/prod if needed | Policy alignment |

**Already SET (evidence):** `MAIL_*`, `RESEND_*`, `INTERNAL_API_SECRET`, `JWT_SECRET`, MySQL `DB_*`, `GOTENBERG_*`, `S3_REGION`, `S3_FORCE_PATH_STYLE`.

---

### File 4: `services/stockix-finance/.env` (2 empty)

| Variable | Status | Can copy from | Notes |
|----------|--------|---------------|-------|
| `SIGNUP_ALLOWED_DOMAINS` | EMPTY | root / prod | Policy |
| `SIGNUP_ALLOWED_EMAILS` | EMPTY | root / prod | Policy |

No `S3_*` keys in this file (server `.env` is what Nest loads).

---

### File 5: `services/posnew/apps/pos-backend/.env`

**No EMPTY or PLACEHOLDER keys** (29/29 SET).

| Variable | Status | Notes |
|----------|--------|-------|
| `LICENSE_SIGNING_SECRET` | SET | **Conflicts with prod** — different value than `infra/prod/.env` |
| `MONGODB_URI` | SET | Atlas URI (rotate if leaked) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | SET | Stockix sender (aligned with control-plane) |
| `B2_*` | SET | POS-specific bucket (`zerowix-pos` naming) — separate from prod `sharkix` |

---

### Files 6–8: `.env.local` overrides

| File | Vars | Notes |
|------|------|-------|
| `pos-backend/.env.local` | `NODE_ENV`, `REDIS_URL` | Local Redis override |
| `pos-frontend2/.env.local` | `NEXT_PUBLIC_POS_API_ORIGIN`, debug flag | |
| `pms/frontend/.env.local` | `NEXT_PUBLIC_PMS_API_URL`, cookie name | |

---

## SECTION 3 — S3 STORAGE DEEP ANALYSIS

### Does Finance actually need S3?

**Yes — for core document features**, not optional at runtime.

| Evidence | Location |
|----------|----------|
| `S3Module` registered in `App.module.ts` | Always loaded |
| `AttachmentsModule` imports `S3Module` | File uploads on invoices, estimates, receipts, vendor credits |
| `GetAttachmentPresignedUrl` | PDF templates, branding |
| `S3Client` factory reads `configService.get('s3')` | `S3.module.ts` |
| Config from `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET` | `common/config/s3.ts` |

**If S3 vars are empty:** Nest still boots, but S3 client gets `undefined` credentials — **uploads and attachment URLs fail** at runtime (errors on attach/PDF/branding), not a clean “feature off” mode.

### What it stores

- Sale invoice / estimate / receipt **attachments**
- **Organization branding** assets (logos via presigned URLs)
- PDF generation paths that pull attachment URLs

### Can it use Backblaze B2?

**Yes.** Prod already uses B2 S3-compatible API:

| Prod var | Role |
|----------|------|
| `S3_ENDPOINT` | `https://s3.us-east-005.backblazeb2.com` |
| `S3_FORCE_PATH_STYLE` | `true` (required for B2) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | B2 application key |
| `S3_BUCKET` | `sharkix` |
| `BACKUP_B2_*` | Same key material for backups |

Finance `packages/server/.env` has `S3_REGION=us-east-1` while prod uses `us-east-005` — **prefer prod’s `S3_REGION=us-east-005`** when copying.

### Recommended Finance server `.env` S3 block (copy sources only)

| Variable | Copy from |
|----------|-----------|
| `S3_ACCESS_KEY_ID` | `infra/prod/.env` → `S3_ACCESS_KEY_ID` |
| `S3_SECRET_ACCESS_KEY` | `infra/prod/.env` → `S3_SECRET_ACCESS_KEY` |
| `S3_ENDPOINT` | `infra/prod/.env` → `S3_ENDPOINT` |
| `S3_BUCKET` | `infra/prod/.env` → `S3_BUCKET` (or create `stockix-finance-uploads` in B2) |
| `S3_REGION` | `infra/prod/.env` → `S3_REGION` |
| `S3_FORCE_PATH_STYLE` | `true` (already SET in finance server `.env`) |

---

## SECTION 4 — MASTER COPY PLAN

| Variable | Empty in | Copy from | Value type |
|----------|----------|-----------|------------|
| `INTERNAL_API_SECRET` | root `.env` | `infra/prod/.env` | 128-char hex |
| `SESSION_SECRET` | root `.env` | `infra/prod/.env` | hex |
| `AUTH_TOKEN_SECRET` | root `.env` | `infra/prod/.env` | hex |
| `DEPLOYMENT_SECRET_KEY` | root `.env` | `infra/prod/.env` | hex |
| `LICENSE_SIGNING_SECRET` | root `.env` | `infra/prod/.env` | hex — **overwrite POS dev value** |
| `LICENSE_SIGNING_SECRET` | `pos-backend/.env` | `infra/prod/.env` | **Must match prod** |
| `POS_PLATFORM_API_KEY` | root `.env` | `infra/prod/.env` | hex string |
| `S3_ACCESS_KEY_ID` | root `.env`, finance server | `infra/prod/.env` | B2 key ID |
| `S3_SECRET_ACCESS_KEY` | root `.env`, finance server | `infra/prod/.env` | B2 app key |
| `S3_BUCKET` | root `.env`, finance server | `infra/prod/.env` | bucket name |
| `S3_ENDPOINT` | finance server | `infra/prod/.env` | B2 HTTPS endpoint |
| `S3_REGION` | finance server | `infra/prod/.env` | `us-east-005` |
| `CONTROL_PLANE_REDIS_URL` | root `.env` (missing) | `infra/prod/.env` | Redis URL |
| `CF_DNS_API_TOKEN` | root `.env` | `infra/prod/.env` | CF token |
| `AGENDASH_AUTH_PASSWORD` | root `.env` | `infra/prod/.env` | If using Agendash locally |

---

## SECTION 5 — TRULY MISSING (cannot copy from any real env file)

| Variable | Where needed | How to get it | Urgency |
|----------|-------------|---------------|---------|
| `SENTRY_DSN` | root + prod | [sentry.io](https://sentry.io) → project DSN | Before launch (recommended) |
| `NEXT_PUBLIC_SENTRY_DSN` | prod | Same project (browser) | Optional |
| `CHATWOOT_API_ACCESS_TOKEN` | root + prod | Chatwoot → Settings → Profile → Access Token | After Chatwoot is up |
| `POSTHOG_API_KEY` | root + prod | PostHog | Optional |
| `GEMINI_API_KEY` | root + prod | Google AI | Only if using PMS OCR |
| `METRICS_ENDPOINT` / `METRICS_AUTH_TOKEN` | root + prod | Your observability stack | Optional |

---

## SECTION 6 — CONFLICT RESOLUTION PLAN

| Variable | Root | Prod | POS | Finance server | Correct for prod | Action |
|----------|:----:|:----:|:---:|:--------------:|------------------|--------|
| `LICENSE_SIGNING_SECRET` | PLACEHOLDER | SET | SET (**≠ prod**) | MISSING | **Prod value only** | Copy prod → root + **overwrite** `pos-backend/.env`; re-sync all tenant POS envs |
| `INTERNAL_API_SECRET` | EMPTY | SET | — | SET (**≠ prod**) | Prod for prod; one dev value for local | Copy prod → root; align finance server if testing against prod API |
| `JWT_SECRET` | EMPTY | SET | different | SET (= prod) | Prod for Finance stacks | Root optional; POS uses own JWT |
| `PLATFORM_API_SECRET` | SET (dev) | SET (prod) | — | — | Environment-specific | Do not copy prod into root on shared laptop |
| `WORKER_SECRET` | SET (dev) | SET (prod) | — | — | Environment-specific | Same |
| `MONGODB_URI` | — | — | SET (Atlas) | — | Per-environment | POS dev DB; not control-plane |
| `B2_BUCKET_NAME` (POS) | — | — | `zerowix-pos` | — | Rename when rebranding | Cosmetic / CORS still has zerowix hosts |

**STOP — LICENSE_SIGNING_SECRET:** If any POS tenant already received offline licenses signed with the **old POS-local** secret, rotating to prod will **invalidate** those tokens. Reconcile with ops before mass-updating tenant POS env files.

---

## SECTION 7 — ACTION CHECKLIST

### Copy now (from `infra/prod/.env` → other real files)

- [ ] `LICENSE_SIGNING_SECRET` → root `.env` + `pos-backend/.env` (confirm STXI impact)
- [ ] `INTERNAL_API_SECRET` → root `.env`
- [ ] `SESSION_SECRET`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY` → root `.env`
- [ ] `POS_PLATFORM_API_KEY` → root `.env`
- [ ] `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION` → `finance/packages/server/.env`
- [ ] Same `S3_*` → root `.env` (for worker tenant provisioning)
- [ ] `CONTROL_PLANE_REDIS_URL` → add to root `.env` if testing license queue locally

### External services

- [ ] `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`
- [ ] `CHATWOOT_API_ACCESS_TOKEN` after Chatwoot boot

### Security

- [ ] Rotate Atlas password if `MONGODB_URI` in POS `.env` was exposed
- [ ] Use **dev** Resend keys in root `.env` (prod keys currently SET in root — see `docs/env-audit.md`)
- [ ] Never commit any `.env` (gitignored — verified)

---

## SECTION 8 — VERIFICATION COMMANDS

```powershell
cd <repo-root>

# Empty lines in prod (expect only optional keys)
(Select-String -Path infra/prod/.env -Pattern '^[A-Z_][A-Z0-9_]*=\s*$').Count

# LICENSE_SIGNING_SECRET: distinct non-placeholder values (target: 1 after fix)
@('.env','infra/prod/.env','services/posnew/apps/pos-backend/.env') |
  ForEach-Object { (Select-String -Path $_ -Pattern '^LICENSE_SIGNING_SECRET=').Line } |
  ForEach-Object { ($_ -split '=',2)[1].Trim() } |
  Where-Object { $_ -and $_ -ne '__MUST_OVERRIDE__' } |
  Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count

# INTERNAL_API_SECRET set in root
Select-String -Path .env -Pattern '^INTERNAL_API_SECRET=.+' 

# Finance S3 trio filled
@('S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_BUCKET') |
  ForEach-Object { Select-String -Path services/stockix-finance/packages/server/.env -Pattern "^$_=.+$" }

# No placeholders in prod
(Select-String -Path infra/prod/.env -Pattern '__MUST_OVERRIDE__|yourdomain').Count
```

---

## SECTION 9 — STAGING

| Item | Status |
|------|--------|
| `infra/staging/.env` | **NOT FOUND** (expected) |
| `infra/staging/.env.example` | 8 vars — points to `staging.stockix.cloud`; says copy secrets from prod |
| Gap vs prod | Staging needs full secret set copied from prod with hostname overrides only |

---

## SECTION 10 — VARS IN `@repo/config` BUT ABSENT FROM `infra/prod/.env`

These are read by control-plane config but **not present** as keys in prod `.env` (may use defaults or optional reads):

| Variable | Notes |
|----------|-------|
| `CONTROL_PLANE_REDIS_URL` | **Required in production** per `validateRequiredEnvForProfile` — present in prod ✅ |
| `BRAND_NAME` | Defaults to `Stockix` |
| `FINANCE_LICENSE_SYNC_OPTIONAL` | Dev-only optional |
| `LICENSE_SYNC_STRICT` | Optional flag |
| `PROVISION_RECONCILE_INTERVAL_MS` | Has default |
| Many `DB_*` / legacy tenant keys | Optional strings; worker builds tenant env separately |

Prod file is **complete for production validator** (all required keys SET).

---

## Audit checklist

| Requirement | Done |
|-------------|:----:|
| Every real env file read completely | ✅ |
| Every empty variable found | ✅ |
| Cross-file copy sources identified | ✅ |
| Finance S3 required vs optional determined | ✅ **Required** |
| Copy plan for fillable vars | ✅ |
| Manual setup list | ✅ |
| `docs/env-missing.md` complete | ✅ |
| No secret values in document | ✅ |

---

*Related: [env-audit.md](./env-audit.md) (system-wide env inventory), [email-audit.md](./email-audit.md) (mail paths).*
