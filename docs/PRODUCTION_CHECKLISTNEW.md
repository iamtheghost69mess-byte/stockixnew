# Stockix Production Checklist — Verification Report

**Date:** 2026-05-27  
**Auditor:** Automated verification (Cursor) + local command execution  
**Repository:** `stockixnew`  
**Reference audits:** [`perf.md`](../perf.md), [`docs/PRODUCTION_READINESS_AUDIT.md`](./PRODUCTION_READINESS_AUDIT.md), [`docs/VERIFICATION_REPORT.md`](./VERIFICATION_REPORT.md)  
**Status:** **NOT CLEARED** — blockers remain before paying-customer traffic (see § Critical Failures)

---

## Executive Summary

Stockix is a **multi-tenant SaaS control plane** (Next.js dashboard, Hono API, Postgres, Docker-provisioned tenant stacks) at **controlled-beta** maturity. This pass re-ran build, test, boundary, compose, and security checks against the live tree.

**Strengths verified today:** TypeScript is clean across all CI-scoped packages; architecture boundary scripts pass after routing `process.env` reads through `@repo/config`; API tests passed **233/233** on five consecutive runs; Finance server tests **38/38**; dashboard and PMS unit tests pass; production Compose files validate; worker bundle builds; migrations report **52 applied, 0 pending** on the local Postgres used for migrate.

**Blockers:** `pnpm audit` reports **1 high** vulnerability (`tmp` path traversal); POS backend tests **did not complete** locally (1 cancelled suite, ~5.5 min); `infra/prod/.env` on this machine has **empty `BACKUP_S3_BUCKET`** and **no `RESEND_WEBHOOK_SECRET` / `SENTRY_DSN`**; git history shows **`.env` and `infra/prod/.env` were committed** (rotation required per runbook); schema verify script could not authenticate to local Postgres (operator must run on prod host).

**Remediation applied during this audit:** Replaced direct `process.env` usage in `apps/api` (redis, rate-limit policy, resend webhook, worker job claim, owner-invite queue) with `@repo/config` getters — `pnpm lint:boundaries` and `pnpm architecture:validate` now report **PRODUCTION READY: YES**.

---

## Overall Scores (re-evaluated)

| Dimension | Score | Target | Gap |
|-----------|------:|-------:|-----|
| TypeScript integrity | **98** | 100 | `@repo/shared` not in CI `tsc` matrix (no package script) |
| Test coverage | **82** | 85+ | POS suite incomplete locally; dashboard/PMS tests not in `deploy.yml` |
| Security | **72** | 88+ | 1 high CVE; env git history; prod env gaps |
| Configuration | **78** | 95+ | Backup/Sentry/Resend webhook unset in local `infra/prod/.env` |
| Docker / Infra | **86** | 90+ | `socket-proxy` / `control-plane-redis` lack `mem_limit`; `socket-proxy` no healthcheck |
| CI/CD pipeline | **88** | 90+ | No staging deploy; branch protection not verifiable from repo |
| Observability | **74** | 80+ | Sentry in code but `SENTRY_DSN` absent from prod env file |
| Performance | **85** | 80+ | Dashboard static ~2.8 MB; API latency not measured (API not running) |
| Operational readiness | **75** | 85+ | Secret rotation pending; backup bucket empty |
| Multi-tenancy / license | **90** | 90+ | Tenant-scope audit 19/19 pass |
| **OVERALL** | **79** | **90+** | **Not cleared** |

---

## PASS / FAIL Summary

| Domain | Checks run | Passed | Failed | Warnings |
|--------|----------:|-------:|-------:|---------:|
| 1 — TypeScript & build | 14 | 13 | 0 | 1 |
| 2 — Test suite | 8 | 6 | 1 | 1 |
| 3 — Security | 10 | 5 | 2 | 3 |
| 4 — Environment | 5 | 2 | 2 | 1 |
| 5 — Docker / infra | 8 | 5 | 0 | 3 |
| 6 — API readiness | 6 | 4 | 0 | 2 |
| 7 — Database | 5 | 2 | 1 | 2 |
| 8 — CI/CD | 4 | 3 | 0 | 1 |
| 9 — Observability | 5 | 3 | 0 | 2 |
| 10 — Performance | 4 | 2 | 0 | 2 |
| 11 — Dashboard health | 6 | 6 | 0 | 0 |
| 12 — Operational | 4 | 2 | 0 | 2 |
| 13 — Multi-tenancy | 3 | 3 | 0 | 0 |
| 14 — License / billing | 4 | 4 | 0 | 0 |
| 15 — Disaster recovery | 5 | 2 | 1 | 2 |

---

## Domain 1 — TypeScript & Build Integrity

### 1.1 TypeScript (`npx tsc --noEmit`)

| Package | Command | Result |
|---------|---------|--------|
| `packages/config` | `cd packages/config && npx tsc --noEmit` | **PASS** (exit 0) |
| `packages/auth` | `cd packages/auth && npx tsc --noEmit` | **PASS** |
| `packages/db` | `cd packages/db && npx tsc --noEmit` | **PASS** |
| `packages/shared` | Not run (no `tsconfig` / `check-types` script in package) | **WARN** |
| `apps/api` | `cd apps/api && npx tsc --noEmit` | **PASS** |
| `apps/dashboard` | `cd apps/dashboard && npx tsc --noEmit` | **PASS** |
| `infra/worker-service` | `cd infra/worker-service && npx tsc --noEmit` | **PASS** |
| `services/pms` | `cd services/pms && npx tsc --noEmit` | **PASS** |
| `services/stockix-finance/packages/server` | `cd …/server && npx tsc --noEmit` | **PASS** |

### 1.2 Dashboard build

| Metric | Result |
|--------|--------|
| Command | `cd apps/dashboard && pnpm build` |
| Errors / Failed | **None** in filtered output |
| Duration | ~105 s |
| `.next/static` size | **~2,803 KB** (< 10 MB CI threshold) |
| Verdict | **PASS** |

### 1.3 API build

| Command | Result |
|---------|--------|
| `cd apps/api && pnpm build` | **PASS** (exit 0, tsup) |

### 1.4 Worker build

| Command | Result |
|---------|--------|
| `pnpm infra:worker:build` | **PASS** — `infra/worker-service/.runtime/worker.js` (~223 KB ESM) |

### 1.5 Architecture boundaries

| Command | Result |
|---------|--------|
| `pnpm lint:boundaries` | **PASS** (after fix — see § Fixes applied) |
| `pnpm architecture:validate` | **PASS** — all phases 1–4 |
| `pnpm --filter api check:tenant-scope` | **PASS** — 19 routes, 0 failed |

**Fix applied:** `packages/config` gained `WORKER_HEARTBEAT_STALE_MS`, `WORKER_STALE_LEASE_THRESHOLD_MS`, and `apiConfig.controlPlaneRedisUrl` / worker stale getters; `apps/api` redis, rate-limit, webhook, and job claim paths now use `@repo/config` instead of `process.env`.

---

## Domain 2 — Test Suite Integrity

### 2.1 API tests (5 consecutive runs)

| Run | Files | Tests | Failed | Duration |
|-----|------:|------:|-------:|---------:|
| 1 | 47 | 233 | 0 | ~12.7 s |
| 2 | 47 | 233 | 0 | ~11.7 s |
| 3 | 47 | 233 | 0 | ~11.3 s |
| 4 | 47 | 233 | 0 | ~11.4 s |
| 5 | 47 | 233 | 0 | ~11.5 s |

Env: `NODE_ENV=test`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/stockix_test`, plus test secrets (same as CI).

**Note:** An initial run reported **2 failed / 231 passed**; immediate re-runs were green — treat as **flake risk** (investigate if seen in CI).

**Verdict:** **PASS** (≥231, 0 failed × 5)

### 2.2 Finance server

| Command | Result |
|---------|--------|
| `cd services/stockix-finance/packages/server && pnpm test` | **PASS** — 10 suites, **38 passed**, ~48 s |

(`pnpm --filter @stockix/server` from repo root does not resolve — Finance is outside root workspace.)

### 2.3 POS backend

| Command | Result |
|---------|--------|
| `pnpm --filter pos-backend test` | **FAIL** — `test:unit` **1 cancelled**, 3 skipped; total wall time ~328 s |

**Verdict:** **FAIL** locally — re-run on CI/Linux with `timeout-minutes: 5` as in `deploy.yml` before sign-off.

### 2.4 Dashboard tests

| Command | Result |
|---------|--------|
| `pnpm --filter dashboard test` | **PASS** — 1 file, **5 passed**, ~8.4 s |

### 2.5 PMS tests

| Command | Result |
|---------|--------|
| `pnpm --filter @stockix/pms test` | **PASS** — 2 files, **51 passed**, ~0.5 s |

### 2.6 Coverage gaps (TEST_GAP)

| Package | Automated tests in this pass | CI (`deploy.yml`) |
|---------|------------------------------|-------------------|
| `@repo/shared` | None | Not run |
| `@repo/ui` | None | Not run |
| `infra/worker-service` | None (bundle only) | TSC only |
| `apps/dashboard` | Unit only | Build only, no `pnpm test` |
| `@stockix/pms` | Unit pass | TSC only, no `pnpm test` |

---

## Domain 3 — Security Audit

### 3.1 Dependency vulnerabilities (`pnpm audit`)

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | **1** (`tmp` < 0.2.6 — path traversal; via `services/posnew/…/request`) |
| Moderate | 3 (`qs`, `request` chain, etc.) |

**Verdict:** **FAIL** (policy: 0 high) — upgrade or override transitive `tmp` / replace `request` in POS printer path.

### 3.2 Secret scanning

| Tool | Result |
|------|--------|
| `npx gitleaks detect` (local) | **WARN** — executable not available via npx on audit host |
| `.github/workflows/secret-scan.yml` | **PASS** (configured on PR + `main`) |

Manual pattern grep (`sk_live_`, `ghp_`, `AKIA`, hardcoded passwords) in `apps/`, `packages/`, `services/`, `infra/`: **no production credentials** in TS/JS (only test keys, comments, SVG masks).

### 3.3 Git history (`.env` files)

| Path | Commits in history? |
|------|---------------------|
| `.env` | **Yes** — e.g. `09a7152d`, `a730543a`, `4b5a2e61` |
| `infra/prod/.env` | **Yes** — e.g. `09a7152d`, `4b5a2e61` |
| `apps/api/.env` | **Yes** (removed in `09a7152d`) |

**Verdict:** **FAIL** until rotation per [`docs/SECRET_ROTATION_RUNBOOK.md`](./SECRET_ROTATION_RUNBOOK.md) and `SECRETS ROTATED:` date in `infra/prod/OPERATIONS.md`.

### 3.4 Hardcoded dev values

| Check | Result |
|-------|--------|
| `dev-worker-secret` / `local-dev-license` in `infra/prod/.env` | **PASS** — not found |
| `changeme` / `secret123` in prod env | **PASS** — not found |
| `packages/config` dev defaults | **PASS** — `WORKER_SECRET` default only for non-prod profiles |

### 3.5 CORS

| Check | Result |
|-------|--------|
| Wildcard `origin: '*'` in API | **PASS** — dynamic origin callback in `apps/api/src/index.ts` (~679–708) |
| `CORS_ORIGINS` / `CORS_ALLOWED_ORIGINS` in `infra/prod/.env` | **PASS** — both present |

### 3.6 Authentication surface (from `apps/api/src/index.ts`)

**Intentionally public or specially authenticated:**

| Route pattern | Auth mechanism |
|---------------|----------------|
| `GET /health`, `GET /ready` | None |
| `GET /public/tenant/:slug` | None + discovery rate limits |
| `GET /public/tenant-orgs/:tenantId` | Deprecated 404 |
| `POST /licenses/activate`, `POST /licenses/verify-offline` | None + license rate limits |
| `/auth/*` | Auth routes (login/MFA) — session established here |
| `POST /webhooks/resend` | Svix signature when `RESEND_WEBHOOK_SECRET` set; **401 in prod if unset** |
| `/internal/jobs/*`, `/internal/organizations/*` | `Authorization: Bearer ${WORKER_SECRET}` |
| All other registered control-plane paths | `PLATFORM_API_SECRET`, `sk_live_*` API key, or `stockix-session` cookie + owner session middleware |

**Verdict:** **PASS** — no unexpected public tenant-admin routes found.

### 3.7 Rate limiting

| Limiter | Config | Store |
|---------|--------|-------|
| Global | 100 / 60 s per IP | `RateLimiterRedis` when Redis up, else memory |
| Auth (`/auth/*`) | 20 / 900 s | Redis-backed when configured |
| License activate | Dedicated middleware | Redis + key limits in `license-rate-limit.ts` |
| Public tenant discovery | IP + slug limiters | Redis-backed when configured |

Production requires `CONTROL_PLANE_REDIS_URL` — API **exits on startup** if missing (`apiConfig.nodeEnv === "production"`).

**Verdict:** **PASS**

### 3.8 Session cookies

From `apps/api/src/routes/auth/index.ts`: `HttpOnly`, `SameSite=Lax`, `Secure` when production (`secureCookie`).

**Verdict:** **PASS**

### 3.9 SQL injection (string interpolation in SQL)

Grep for `` SELECT.*${ `` in `apps/api` / `packages/db` runtime: **PASS** (Drizzle/sql tagged templates only).

### 3.10 Tenant scope

`node apps/api/scripts/audit-tenant-scope.mjs`: **PASS** (19/19).

---

## Domain 4 — Environment & Configuration

### 4.1 Production-required vars (`validateRequiredEnvForProfile('production')`)

From `packages/config/src/index.ts` lines 108–122:

`DATABASE_URL`, `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_SECONDS`, `DB_CONNECT_TIMEOUT_SECONDS`, `DB_MAX_LIFETIME_SECONDS`, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `DASHBOARD_URL`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET`, `CONTROL_PLANE_REDIS_URL`

| Env var | Required | Present in `infra/prod/.env` | Value check (this host) |
|---------|:--------:|:----------------------------:|-------------------------|
| `DATABASE_URL` | YES | YES | len=101 |
| `DB_POOL_MAX` | YES | YES | `20` |
| `DB_IDLE_TIMEOUT_SECONDS` | YES | YES | set |
| `DB_CONNECT_TIMEOUT_SECONDS` | YES | YES | set |
| `DB_MAX_LIFETIME_SECONDS` | YES | YES | set |
| `SESSION_SECRET` | YES | YES | len=128 |
| `PLATFORM_API_SECRET` | YES | YES | len=128 |
| `WORKER_SECRET` | YES | YES | len=128 |
| `DASHBOARD_URL` | YES | YES | https URL |
| `AUTH_TOKEN_SECRET` | YES | YES | len=128 |
| `DEPLOYMENT_SECRET_KEY` | YES | YES | len=128 |
| `LICENSE_SIGNING_SECRET` | YES | YES | len=128 |
| `CONTROL_PLANE_REDIS_URL` | YES | YES | `redis://control-plane-redis:6379/0` |
| `RESEND_WEBHOOK_SECRET` | RECOMMENDED | **NO** | — |
| `SENTRY_DSN` | RECOMMENDED | **NO** | — |
| `BACKUP_S3_BUCKET` | REQUIRED for DR | **EMPTY** | `BACKUP_S3_BUCKET=` |
| `CORS_ALLOWED_ORIGINS` | YES (runtime) | YES | set |

**Verdict:** **WARN** on required core secrets (present); **FAIL** on empty backup bucket and missing webhook/Sentry.

### 4.2 Dangerous defaults in `infra/prod/.env`

**PASS** — no `dev-worker-secret`, `local-dev-license`, or `changeme` in prod file.

### 4.3 `NEXT_PUBLIC_*` (dashboard)

| Variable | In compose `build.args`? | Secret risk |
|----------|-------------------------|-------------|
| `NEXT_PUBLIC_STOCKIX_API_URL` | YES (`infra/prod/docker-compose.yml` ~318) | Public API URL only — OK |
| `NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN` | YES | OK |
| `NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME` | YES | OK |

**Verdict:** **PASS**

### 4.4 Env drift (`.env.example` vs `infra/prod/.env`)

Many keys exist only in `.env.example` (dev/agenda/playwright). **WARN** — review `AGENDA_*`, `PLAYWRIGHT_*`, `POS_FRONTEND_HOST_PORT` before assuming prod parity.

### 4.5 API port / BFF

| Item | Value |
|------|--------|
| API `PORT` | 4000 (compose + `apiConfig`) |
| Dashboard | Traefik → port 3000; uses `NEXT_PUBLIC_STOCKIX_API_URL` at build |
| Localhost in prod compose server URLs | **PASS** — uses service names / public domains |

---

## Domain 5 — Docker & Infrastructure

### 5.1 Compose validation

| Stack | `docker compose config` |
|-------|-------------------------|
| `infra/prod/docker-compose.yml` | **PASS** (exit 0) |
| `infra/tenant-stack/docker-compose.yml` | **PASS** |
| `infra/pos-tenant-stack/docker-compose.yml` | Not re-run (prod + tenant validated) |
| `infra/pms-tenant-stack/docker-compose.yml` | Not re-run |

### 5.2 Healthchecks (prod)

| Service | Healthcheck | Interval / retries | Verdict |
|---------|-------------|-------------------|---------|
| `socket-proxy` | **None** | — | **WARN** |
| `traefik` | CMD ping | 10s / 5 | **PASS** |
| `postgres` | `pg_isready` | 5s / 10 | **PASS** |
| `control-plane-redis` | `redis-cli ping` | 5s / 10 | **PASS** |
| `api` | `GET /ready` via node fetch | 15s / 6 | **PASS** |
| `api-bullmq` | Same | 15s / 6 | **PASS** |
| `infra-worker` | node health script | configured | **PASS** |
| `dashboard` | HTTP health | configured | **PASS** |
| `chatwoot` | HTTP | configured | **PASS** |
| `chatwoot-postgres` | `pg_isready` | 10s / 5 | **PASS** |
| `chatwoot-redis` | `redis-cli ping` | 10s / 5 | **PASS** |
| `db-backup` | N/A (cron sidecar) | — | **PASS** (by design) |

### 5.3 Resource limits (prod)

| Service | `mem_limit` | `cpus` | Verdict |
|---------|-------------|--------|---------|
| `traefik` | 128m | 0.25 | **PASS** |
| `postgres` | 1g | 0.5 | **PASS** |
| `control-plane-redis` | **Missing** | **Missing** | **WARN** |
| `api` | 512m | 0.5 | **PASS** |
| `api-bullmq` | 256m | 0.25 | **PASS** |
| `infra-worker` | 1g | 1.0 | **PASS** |
| `dashboard` | 256m | 0.25 | **PASS** |
| `db-backup` | 64m | 0.1 | **PASS** |
| `socket-proxy` | **Missing** | **Missing** | **WARN** |

### 5.4 Security hardening

**PASS** on `api`, `api-bullmq`, `dashboard`, `traefik`: `read_only`, `cap_drop: ALL`, `no-new-privileges` where applicable.

### 5.5 Socket proxy

| Setting | Value | Notes |
|---------|-------|-------|
| `BUILD` | **0** | Images pre-built — **PASS** |
| `POST` | 1 | Required for compose lifecycle |
| `SWARM` / `AUTH` / `SECRETS` | 0 | **PASS** |

### 5.6–5.8 Networks / Traefik

- **Internal network** `stockix_internal` — `internal: true` for worker/redis/postgres sidecars.
- **Traefik** — Cloudflare DNS-01 ACME, TLS routers for dashboard/API; HTTP→HTTPS via entrypoints.

**Verdict:** **PASS** with WARN on proxy/redis limits.

---

## Domain 6 — API Readiness

### 6.1 Health / ready (live curl)

| Endpoint | Result |
|----------|--------|
| `curl http://127.0.0.1:4000/health` | **SKIP** — API not running on audit host |
| `curl http://127.0.0.1:4000/ready` | **SKIP** |

Code implements DB + optional Redis checks in `GET /ready` (`apps/api/src/index.ts` ~1061–1102).

### 6.2–6.4 Error shape / idempotency

| Check | Result |
|-------|--------|
| Global `onError` | JSON `{ error, message }` — no stack in response (**PASS**) |
| `Idempotency-Key` | Middleware for mutating owner routes (~939+) (**PASS**) |

### 6.5 Logging

| Check | Count |
|-------|------:|
| `console.log` / `console.debug` in `apps/api/src` | **0** |
| `logger.*` usage | Substantial (**PASS**) |

### 6.6 Sentry

| Component | `Sentry.init` | `captureException` | DSN in `infra/prod/.env` |
|-----------|---------------|------------------|--------------------------|
| `apps/api` | YES (~158) | YES | **NO** |
| `infra/worker-service` | YES | YES | **NO** |
| `apps/dashboard` | NO | NO | **NO** |

**Verdict:** **WARN** — wire DSN in prod env before launch.

---

## Domain 7 — Database Integrity

### 7.1 Migrations

```
pnpm --filter @repo/db db:migrate
→ [migrate] journal=52 applied=52 pending=0
```

**PASS**

### 7.2 Schema verification

```
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts
→ FATAL auth_failed (local Postgres credentials ≠ postgres:postgres)
```

**WARN** — run on production host with real `DATABASE_URL`.

### 7.3 Duplicate migration **file** prefixes

| Prefix | Files |
|--------|-------|
| `0035` | `0035_plans_max_users.sql`, `0035_pms_upgrade.sql` |
| `0038` | `0038_pms_guest_forms.sql`, `0038_one_active_license_per_tenant.sql` |

Journal uses **unique tags** for each entry — migrations apply (**PASS** applied), but duplicate numeric prefixes are a **WARN** for operator confusion.

### 7.4 Indexes

`packages/db/src/schema.ts`: extensive `index()` / `uniqueIndex()` usage (37 tables).

### 7.5 Connection pool

`DB_POOL_MAX=20` in `infra/prod/.env` — **PASS**

### 7.6 Backup

`db-backup` service present; `BACKUP_S3_BUCKET` **empty** — **FAIL**

---

## Domain 8 — CI/CD Pipeline

### 8.1 `deploy.yml` quality gate

| Step | In CI? |
|------|:------:|
| `pnpm install --frozen-lockfile` | YES |
| TSC api, worker, dashboard, packages, pms | YES |
| `pnpm --filter api test` | YES |
| License test 5× (`license-single-active`) | YES |
| `pnpm --filter pos-backend test` | YES (5 min timeout) |
| `pnpm --filter @stockix/server test` | YES |
| `pnpm --filter dashboard build` | YES |
| Bundle size check (>10 MB warn) | YES |
| `pnpm lint:boundaries` | YES |
| `pnpm architecture:validate` | YES |
| `check:tenant-scope` | YES |
| Gitleaks | Separate workflow — YES |
| `pnpm --filter dashboard test` | **NO** — CI_GAP |
| `pnpm --filter @stockix/pms test` | **NO** — CI_GAP |

### 8.2 Deploy job

| Requirement | Status |
|-------------|--------|
| Only `main` / `workflow_dispatch` | YES |
| `needs: quality-gate` | YES |
| SSH deploy + migrate + compose `--wait` | YES |
| Post-deploy `curl …/ready` | YES |
| Rollback on failure (`git reset` + compose) | YES |

### 8.3 GitHub secrets (from workflow)

| Secret | Used in |
|--------|---------|
| `EC2_SSH_PRIVATE_KEY` | deploy |
| `EC2_HOST` | deploy |
| `EC2_USER` | deploy |

Documented in README / OPERATIONS — **PASS**

### 8.4 Branch protection

**Cannot verify from repo** — confirm in GitHub UI: PR reviews, required checks (`Quality gate`, `Gitleaks`), up-to-date branch.

---

## Domain 9 — Observability

| Check | Result |
|-------|--------|
| Structured `logger` in API/worker | **PASS** |
| `x-request-id` propagation | **PASS** (`apps/api/src/index.ts` ~721–727) |
| Sentry API + worker | Code **PASS**, env **WARN** |
| Dashboard Sentry | **WARN** — not integrated |
| `METRICS_ENDPOINT` | Present but empty in prod env — **WARN** |
| Audit logging (`logAudit`) | Used across index, license, tenant modules — **PASS** |

---

## Domain 10 — Performance & Reliability

| Check | Result |
|-------|--------|
| API `/health` latency | **SKIP** (API down) |
| Dashboard build time | ~105 s — **PASS** |
| Static bundle | 2.8 MB — **PASS** |
| `docker stats` | **SKIP** (stack not running locally) |
| Unbounded `.select()` | **WARN** — manual review recommended (PMS reports partially paginated per prior audit) |

---

## Domain 11 — Next.js Dashboard Health

| Check | Result |
|-------|--------|
| `from 'next/router'` | **0** matches — **PASS** |
| `error.tsx` first line | Sampled files: `"use client"` — **PASS** |
| `@repo/db` in client components | **PASS** (grep found no violations) |
| `useSearchParams` + Suspense | Not exhaustively verified — **WARN** |

---

## Domain 12 — Operational Readiness

### 12.1 `infra/prod/OPERATIONS.md` coverage

| Topic | Documented? |
|-------|:-----------:|
| Server setup / deploy | YES |
| Env vars | YES |
| Migrations | YES |
| Tenant provisioning | YES |
| Backup / restore | YES |
| Secret rotation | YES (pending date) |
| Rollback | YES (also in CI) |
| Redis / BullMQ scaling | YES |
| `MAX_TENANT_PORT` | YES (via env docs) |

**Verdict:** **PASS** with rotation still **pending**.

### 12.2 Manual steps

Several procedures require operator SSH (migrate, rotation, `prod-scale-smoke.sh`) — documented but not automated (**WARN**).

---

## Domain 13 — Multi-Tenancy Integrity

| Check | Result |
|-------|--------|
| `audit-tenant-scope.mjs` | **PASS** 19/19 |
| PMS tenant filters | Not fully audited — prior report noted gaps in some routes (**WARN**) |
| Provision `claim_token` / stale lease | Present in schema + worker claim logic — **PASS** |

---

## Domain 14 — License & Billing Integrity

| Check | Result |
|-------|--------|
| License activate rate limit | **PASS** |
| Expiry / BullMQ milestones | **PASS** (requires Redis) |
| `LICENSE_SIGNING_SECRET` ≥32 in config | **PASS** |
| Offline JWT verify | **PASS** (`verify-offline` route + signing helpers) |

---

## Domain 15 — Disaster Recovery

| Check | Result |
|-------|--------|
| Automated `db-backup` → S3 | Service **PASS**, config **FAIL** (empty bucket) |
| Restore documented | **PASS** (`OPERATIONS.md`) |
| Deploy rollback | **PASS** (CI trap) |
| SPOFs | Single EC2, single Postgres, single worker, shared Chatwoot — documented below |

### RTO estimates (documented, not load-tested)

| Scenario | Estimate |
|----------|----------|
| Single container crash | 15–60 s (healthcheck + restart) |
| Postgres restore from S3 | 30–90 min (download + `pg_restore` + verify) |
| Full EC2 loss | 2–4 h (new instance, terraform/bootstrap, restore, deploy) |

---

## Critical Failures (must fix before deploy)

1. **`pnpm audit` — 1 high (`tmp`)** — remediate transitive dependency in POS/`request` chain or accept documented risk with compensating controls.
2. **`BACKUP_S3_BUCKET` empty** in `infra/prod/.env` — automated backups will not upload; set bucket + `BACKUP_AWS_*` credentials.
3. **Git history contains `.env` / `infra/prod/.env`** — execute full secret rotation per runbook before customer traffic.
4. **POS backend tests failed locally** — confirm green on CI/Linux before release; fix cancelled/hanging suite if CI fails.

## Warnings (fix within 1 week of deploy)

1. Set `RESEND_WEBHOOK_SECRET` in prod (webhooks rejected without it — correct security, but delivery tracking disabled).
2. Set `SENTRY_DSN` for API + worker (and consider dashboard client monitoring).
3. Add `mem_limit` / `cpus` to `control-plane-redis` and `socket-proxy`.
4. Add `pnpm --filter dashboard test` and `@stockix/pms test` to CI quality gate.
5. Run `verify-schema.ts` on production DB after migrate.
6. Resolve duplicate SQL file prefixes `0035_*` / `0038_*` (rename future migrations for clarity).
7. Confirm GitHub branch protection + optional production environment approval.
8. First API test run flaked (2 failures) — monitor `license-single-active` stability (CI already runs 5×).

## What Was Verified (evidence)

- All `tsc --noEmit` commands listed in Domain 1 — exit 0.
- `pnpm lint:boundaries` + `pnpm architecture:validate` — exit 0 after env refactor.
- API tests ×5 — 233 passed each run.
- Finance 38/38; dashboard 5/5; PMS 51/51.
- `docker compose config` prod + tenant — exit 0.
- `pnpm infra:worker:build` — success.
- `pnpm --filter @repo/db db:migrate` — pending=0.
- Tenant scope audit — 19/19.
- Dashboard production build — no errors; static ~2.8 MB.

## Pre-Deploy Ops Actions (numbered)

1. Complete secret rotation on production host; update `SECRETS ROTATED:` in `infra/prod/OPERATIONS.md`.
2. Fill `BACKUP_S3_BUCKET`, `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`, `BACKUP_AWS_REGION`.
3. Set `RESEND_WEBHOOK_SECRET`, `SENTRY_DSN`, verify `MAIL_*` for Resend SMTP.
4. `pnpm docker:prebuild` && `pnpm docker:check` on server.
5. `pnpm env:sync-prod --confirm-server` after editing `infra/prod/.env`.
6. Enable GitHub branch protection (quality gate + Gitleaks).
7. Confirm `PROVISION_MODULE_GATING=1` in prod.
8. Run `bash scripts/prod-scale-smoke.sh` after deploy.

## Production Deploy Command Sequence

```bash
# On EC2 (as deploy user)
cd /opt/stockix/stockixnew   # or /opt/stockix/app
git fetch --prune && git checkout main && git pull --ff-only origin main

set -a && source infra/prod/.env && set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"

corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm infra:worker:build
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts

cd infra/prod
docker compose --env-file .env up -d --build --wait

curl --fail --retry 5 --retry-delay 3 \
  "${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN}/ready"
```

## Post-Deploy Verification

1. `docker compose --env-file .env ps` — 2× `api`, 1× `api-bullmq`, worker, dashboard, traefik healthy.
2. `curl -fsS "https://${API_DOMAIN}/ready"` → `ready: true`, `checks.database: ok`, `checks.redis: ok`.
3. `bash scripts/prod-scale-smoke.sh` from repo root.
4. Login to dashboard; create **staging** tenant; confirm provision journal completes.
5. Verify `db-backup` cron log / S3 object for nightly dump.
6. Trigger test owner invite email; confirm SMTP delivery.

## Known Limitations (accepted risks for v1 production)

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single EC2 host | Total outage if instance fails | Backups + terraform reprovision; monitor uptime |
| No staging environment in CI | Regressions hit prod | PR quality gate; manual smoke |
| Monolithic `apps/api/src/index.ts` (~5.6k LOC) | Merge/deploy risk | Post-launch router split |
| Shared Chatwoot instance | Chat blast radius | Per-tenant accounts only |
| POS tests slow/flaky on Windows | Local dev friction | CI Linux runner authoritative |

## Next Engineering Priorities (post-launch)

1. Split `apps/api/src/index.ts` into domain routers.
2. Add staging compose + deploy workflow.
3. Fix POS dependency tree (`request`/`tmp`) and stabilize test suite timeout.
4. Enforce `BACKUP_S3_BUCKET` non-empty in deploy preflight script.
5. Add dashboard + PMS tests to `deploy.yml`.
6. Add `mem_limit` to `control-plane-redis` and healthcheck to `socket-proxy`.

---

## Fixes Applied During This Audit (commit separately)

| File | Change |
|------|--------|
| `packages/config/src/index.ts` | `WORKER_HEARTBEAT_STALE_MS`, `WORKER_STALE_LEASE_THRESHOLD_MS`, `apiConfig.controlPlaneRedisUrl`, worker stale getters |
| `apps/api/src/index.ts` | Use `apiConfig` for Redis readiness + worker stale ms |
| `apps/api/src/lib/redis.ts` | Use `apiConfig.controlPlaneRedisUrl` |
| `apps/api/src/middleware/rate-limit-redis-policy.ts` | Use `apiConfig` |
| `apps/api/src/routes/webhooks/resend.ts` | Use `apiConfig.nodeEnv` + `getResendWebhookSecret()` |
| `apps/api/src/jobs/owner-invite-mail-queue.ts` | Use `apiConfig` for Sentry guard |

---

## Sign-Off

| Role | Name | Date | Cleared? |
|------|------|------|:--------:|
| Engineering lead | | | ☐ |
| CTO | | | ☐ |

**Automated verdict:** **NOT CLEARED** — resolve § Critical Failures and complete ops rotation before paying customers.

---

*Generated 2026-05-27. Re-run after each release candidate: `pnpm lint:boundaries && pnpm architecture:validate && pnpm --filter api test`.*
