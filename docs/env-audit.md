# Stockix — Environment Audit
**Date:** 2026-06-07
**Branch:** architecture

---

## Summary

| File | Issues found | Issues fixed | Status |
|------|-------------|-------------|--------|
| `.env` (local) | 5 (placeholders / empty, see below) | 5 | ✅ READY |
| `infra/prod/.env` | 0 | 0 | ✅ READY |

The Step 2 required-variable audit script reported **0 issues** for both files before and after fixes. Additional manual review found five local-only placeholder or empty values (not in the script’s `REQUIRED_LOCAL` list) that were corrected.

---

## Audit script output (before fixes)

```
=== LOCAL .env AUDIT ===
✅ ALL REQUIRED LOCAL VARS PRESENT AND VALID

=== PRODUCTION infra/prod/.env AUDIT ===
✅ ALL REQUIRED PROD VARS PRESENT AND VALID

=== SUMMARY ===
Local issues: 0
Prod issues:  0
Total:        0
STATUS: BOTH ENV FILES READY
```

## Audit script output (after fixes)

Same result — **0 local issues, 0 prod issues**, `STATUS: BOTH ENV FILES READY`.

---

## Local .env — Variables Checked

| Variable | Status | Value (masked if secret) | Notes |
|----------|--------|--------------------------|-------|
| DATABASE_URL | ✅ | `postgresql://postgres:***@127.0.0.1:54330/stockix_platform` | Matches local Postgres compose |
| SESSION_SECRET | ✅ | `[128 hex chars]` | |
| AUTH_TOKEN_SECRET | ✅ | `[128 hex chars]` | Aligned with POS backend |
| DEPLOYMENT_SECRET_KEY | ✅ | `[64 hex chars]` | |
| JWT_SECRET | ✅ | `[64 hex chars]` | Shared with `SHARED_MYSQL_ROOT_PASSWORD` locally |
| LICENSE_SIGNING_SECRET | ✅ | `[64 hex chars]` | |
| PLATFORM_API_SECRET | ✅ | `[128 hex chars]` | |
| WORKER_SECRET | ✅ | `[64 hex chars]` | |
| INTERNAL_API_SECRET | ✅ | `[64 hex chars]` | |
| DASHBOARD_URL | ✅ | `http://localhost:3000` | |
| SHARED_MYSQL_HOST | ✅ | `stockix-mysql` | Canonical Docker DNS name |
| SHARED_MONGO_HOST | ✅ | `stockix-mongo` | Canonical Docker DNS name |
| TENANT_REDIS_HOST | ✅ | `stockix-redis` | Canonical Docker DNS name |
| SHARED_MYSQL_ROOT_PASSWORD | ✅ | `[64 hex chars]` | |
| TENANT_ENV_ROOT | ✅ | `C:/Users/Jad/Desktop/stokcix/tenants` | Absolute Windows path |
| REPO_ROOT | ✅ | `C:/Users/Jad/Desktop/stokcix/stockixnew` | Absolute Windows path |
| STOCKIX_TENANT_APP_ROOT | ✅ | `C:/Users/Jad/Desktop/stokcix/stockixnew/services/stockix-finance` | Was empty; now explicit |
| POSTGRES_PASSWORD | ✅ | `postgres` | Was `__MUST_OVERRIDE__`; aligned with `DATABASE_URL` |
| ACME_EMAIL | ✅ | `jad.haidar.***@gmail.com` | Was `ops@example.com` placeholder |
| AGENDASH_AUTH_PASSWORD | ✅ | `[16 chars base64url]` | Was empty |
| CF_DNS_API_TOKEN | ⏭️ | empty | Optional for localhost dev (Traefik DNS challenge not used locally) |
| CONTROL_PLANE_REDIS_URL | ✅ | `redis://127.0.0.1:6379/0` | Local BullMQ |
| BACKUP_B2_* | ✅ | Mapped from S3 vars | Added for backup script parity with prod |

---

## Production infra/prod/.env — Variables Checked

| Variable | Status | Notes |
|----------|--------|-------|
| DATABASE_URL | ✅ | `postgresql://postgres:***@postgres:5432/stockix_platform` |
| SESSION_SECRET | ✅ | Rotated 128-char hex |
| AUTH_TOKEN_SECRET | ✅ | Rotated 128-char hex (differs from local — expected) |
| DEPLOYMENT_SECRET_KEY | ✅ | Rotated 128-char hex |
| JWT_SECRET | ✅ | Set |
| LICENSE_SIGNING_SECRET | ✅ | STXI key for all POS stacks |
| PLATFORM_API_SECRET | ✅ | Set |
| WORKER_SECRET | ✅ | Set |
| INTERNAL_API_SECRET | ✅ | Set |
| POSTGRES_USER | ✅ | `postgres` |
| POSTGRES_PASSWORD | ✅ | Rotated |
| POSTGRES_DB | ✅ | `stockix_platform` |
| SHARED_MYSQL_HOST | ✅ | `stockix-mysql` |
| SHARED_MONGO_HOST | ✅ | `stockix-mongo` |
| TENANT_REDIS_HOST | ✅ | `stockix-redis` |
| SHARED_MYSQL_ROOT_PASSWORD | ✅ | Set |
| TENANT_ENV_ROOT | ✅ | `/opt/stockix/tenants` |
| REPO_ROOT | ✅ | `/opt/stockix/stockixnew` |
| STOCKIX_TENANT_APP_ROOT | ✅ | `/opt/stockix/stockixnew/services/stockix-finance` |
| TRAEFIK_DYNAMIC_DIR | ✅ | `/opt/stockix/traefik-dynamic` |
| CF_DNS_API_TOKEN | ✅ | Cloudflare DNS token set |
| ACME_EMAIL | ✅ | Ops email set |
| MAIL_HOST | ✅ | `smtp.resend.com` |
| MAIL_PASSWORD | ✅ | `re_***` Resend API key |
| MAIL_FROM_ADDRESS | ✅ | `noreply@send.stockix.cloud` |
| PLATFORM_ADMIN_EMAIL | ✅ | Set |
| PLATFORM_ADMIN_PASSWORD | ✅ | Set |
| BACKUP_B2_BUCKET | ✅ | `sharkix` |
| BACKUP_B2_KEY_ID | ✅ | Set (B2 application key ID) |
| BACKUP_B2_APP_KEY | ✅ | Set (B2 application key) |
| BACKUP_B2_ENDPOINT | ✅ | `https://s3.us-east-005.backblazeb2.com` |
| CONTROL_PLANE_REDIS_URL | ✅ | `redis://control-plane-redis:6379/0` |
| ROOT_DOMAIN | ✅ | `stockix.cloud` |

No production file changes were required — all required vars present, hostnames canonical, no `__MUST_OVERRIDE__` placeholders remain.

---

## Fixes Applied

1. **`.env` `STOCKIX_TENANT_APP_ROOT`:** empty → `C:/Users/Jad/Desktop/stokcix/stockixnew/services/stockix-finance` (explicit path; config fallback was implicit)
2. **`.env` `POSTGRES_PASSWORD`:** `__MUST_OVERRIDE__` → `postgres` (matches `DATABASE_URL` credentials for local compose)
3. **`.env` `ACME_EMAIL`:** `ops@example.com` → real ops email (removed `example.com` placeholder)
4. **`.env` `AGENDASH_AUTH_PASSWORD`:** empty → generated 16-char base64url secret
5. **`.env` `BACKUP_B2_*` block:** added 7 keys mapped from existing S3 credentials (`sharkix` bucket) for local backup-script parity with prod

**`infra/prod/.env`:** no edits — audit clean on first run.

---

## Remaining Manual Steps (server-side only)

1. **`CHATWOOT_API_ACCESS_TOKEN`** — empty in prod; fill after Chatwoot boot (documented in `scripts/audit-env.mjs` as post-boot token).
2. **`OWNER_ID`** — empty in local `.env`; set only when running provision smoke/diagnose scripts.
3. **`CF_DNS_API_TOKEN`** — intentionally empty in local `.env`; not needed unless testing Traefik DNS-01 locally.
4. **Secret rotation** — prod secrets differ from local (expected). Re-run server deploy after any prod secret rotation; do not sync prod secrets into git.

---

## Verification

| Check | Result |
|-------|--------|
| Audit script re-run — local issues | 0 |
| Audit script re-run — prod issues | 0 |
| `node scripts/audit-env.mjs` — local readiness | READY (root ↔ POS aligned) |
| `node scripts/audit-env.mjs` — prod readiness | READY (TLS ready; Chatwoot token post-boot) |
| GET /health | ✅ 200 — `{"status":"ok",...}` |
| GET /ready | ✅ 200 — `{"ready":true,"checks":{"database":"ok","redis":"ok"},...}` |
| `pnpm env:sync-prod` | N/A — prod `.env` unchanged |

---

## Config source reference

All runtime reads go through `packages/config/src/index.ts` (`env`, `apiConfig`, `dashboardConfig`, `infraConfig`, etc.). Worker-specific overrides (`WORKER_SHARED_MYSQL_HOST`, `SHARED_MYSQL_HOST`, `TENANT_REDIS_HOST`, etc.) are read directly in `infra/worker-service/` and default to canonical Docker service names when unset.

---

## Vars only in one environment (informational)

**Local-only (dev tooling):** `WORKER_SHARED_MYSQL_HOST`, `WORKER_SHARED_MONGO_HOST`, `HEALTH_*_CONTAINER`, `OWNER_ID`, throttle tuning, Playwright URLs, etc.

**Previously prod-only, now also in local:** `BACKUP_B2_*`, `BACKUP_POSTGRES_CONTAINER` (added during this audit).
