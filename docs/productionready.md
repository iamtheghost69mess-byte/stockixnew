# Stockix — Production Readiness: REMAINING GAPS ONLY

**Generated:** Tuesday, May 26, 2026  
**Based on cross-reference of:**
- `docs/VERIFICATION_REPORT.md` (post-fix verification, 86/100)
- `productionready.md` (prior phase audit A–J, 68/100 — superseded by this file)
- `PRODUCTION_READINESS_AUDIT.md` (master audit, 50 sections)

**Overall status:** NOT CLEARED FOR PRODUCTION (ops: secret rotation on prod host still required)  
**Scale-first (2026-05-27):** `api`×2 + `api-bullmq`, Redis-required `/ready`, fail-closed rate limits — see [docs/VERIFICATION_REPORT.md](docs/VERIFICATION_REPORT.md)  
**Items confirmed fixed:** 52+ ✅  
**Items still open:** ~40 ❌ (see sections below; several P1 items closed in code since May 26 audit)  
**Items partially fixed (residual gap):** 11 ⚠️

---

## HOW TO READ THIS DOCUMENT

- Every item below is **still open** or **partial** — confirmed fixes are only in [Section 13](#section-13--items-confirmed-fixed-reference-only).
- Each item includes: Severity | Domain | File(s) | Root Cause | Production Impact | Exact Fix Required
- Items are ordered P0 → P4 within each section.
- **Partial** items state what was fixed and what gap remains.
- Several P0 items from the May 2026 audits were **fixed in code after** `VERIFICATION_REPORT.md`; those appear in Section 13, not below.

---

## SECTION 1 — P0 CRITICAL (Deploy Blocker)

> These items will cause data loss, security breach, or complete outage in production.  
> Nothing ships until ALL P0 items are resolved.

### P0-1: Platform secrets may exist in git history (`.env` committed)

**Source:** `docs/VERIFICATION_REPORT.md`, `PRODUCTION_READINESS_AUDIT.md` §36, §50.7  
**Status:** OPEN (ops — cannot be closed by code alone)  
**File(s):** Git history — `git log --oneline -- .env` shows commits (`09a7152d`, `a730543a`, …)  
**Line(s):** N/A  
**Function/Route:** N/A  
**Root Cause:** `.env` was committed in the past; even after removal, secrets remain recoverable from history.  
**Production Impact:** Anyone with repo access (or a leaked clone) can recover `DATABASE_URL`, `WORKER_SECRET`, `SESSION_SECRET`, mail credentials, signing keys → full platform compromise.  
**Exploitability:** High — clone + `git show <commit>:.env` or history scanning tools.  
**Exact Fix Required:**
  1. Rotate **every** secret listed in `packages/config/src/index.ts` `validateRequiredEnvForProfile` (lines 94–117): `DATABASE_URL` password, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET`, `RESEND_WEBHOOK_SECRET`, Redis, mail, Cloudflare, Chatwoot, per-tenant deployment keys.
  2. Invalidate all active sessions (`owners.session_version` bump or forced re-login).
  3. Re-issue API keys and worker credentials on the production host (`infra/prod/.env`).
  4. Optional but recommended: use `git filter-repo` or BFG to purge `.env` from history, then force-push (coordinate with team).
  5. Add pre-commit / CI secret scanning (see P2-8) to prevent recurrence.
**Verification Command:**
```powershell
git log --oneline -- .env
# After rotation: grep -r "OLD_SECRET_VALUE" .   # must be 0 matches
```
**Blocks Deploy:** YES (until rotation confirmed on production host)

---

## SECTION 2 — P1 HIGH (Fix Within 1 Week)

> These items cause degraded reliability, security exposure, or silent failures in production.

### P1-1: Unauthenticated tenant metadata enumeration (`GET /public/tenant-orgs/:tenantId`)

**Source:** `productionready.md` P0-5, `PRODUCTION_READINESS_AUDIT.md` §11, §50.12  
**Status:** PARTIAL — dedicated rate limit added (`publicTenantOrgsRateLimitMiddleware`, 20 req/min); route remains public  
**File(s):** `apps/api/src/index.ts` (lines 1059–1089), `apps/api/src/middleware/global-rate-limit.ts` (lines 33–87)  
**Line(s):** 1061, 711  
**Function/Route:** `GET /public/tenant-orgs/:tenantId`  
**Root Cause:** Route is intentionally unauthenticated for “tenant-branded login UIs”; returns org slugs, display names, and logo URL for any valid tenant UUID.  
**Production Impact:** Attackers can enumerate tenant UUIDs (if leaked/guessed) and harvest org structure for phishing or targeted attacks. Rate limit slows but does not stop enumeration.  
**Scaling Impact:** At 100+ tenants, automated scanning is feasible within rate limits using distributed IPs.  
**Exact Fix Required:**
  1. Prefer signed, short-lived discovery tokens instead of raw `tenantId` in URL, **or** require a public `tenant_slug` that is not a UUID.
  2. Return only non-sensitive fields (e.g. display name + logo); omit internal slugs if not required client-side.
  3. Add CAPTCHA or proof-of-work after N failures per IP / tenant.
  4. Log and alert on sustained 404/429 patterns from single ASNs.
**Verification Command:**
```powershell
curl -s "http://localhost:4000/public/tenant-orgs/<valid-tenant-uuid>" | jq .
# Expect 401 or signed-token requirement after fix
node apps/api/scripts/audit-tenant-scope.mjs   # unrelated but should stay exit 0
```

### P1-2: `POST /licenses/activate` — public surface without dedicated brute-force controls

**Source:** `PRODUCTION_READINESS_AUDIT.md` §11, §16; `productionready.md` SEC-7  
**Status:** OPEN  
**File(s):** `apps/api/src/license-http.ts` (~line 856), `apps/api/src/index.ts` (lines 752–757, 825–827)  
**Line(s):** 856+  
**Function/Route:** `POST /licenses/activate`, `POST /licenses/verify-offline`  
**Root Cause:** Routes bypass platform auth; only global rate limit (100/min/IP) applies — not key-specific lockout.  
**Production Impact:** Offline license key brute-force / activation abuse; DB write pressure on `license_activations`.  
**Scaling Impact:** Worse at 1000+ tenants with many issued keys.  
**Exact Fix Required:**
  1. Add `licenseActivateRateLimitMiddleware` (e.g. 5/min per IP + 20/hour per `license_key` fingerprint).
  2. Increment failed-attempt counter in Redis; lock key for 15 minutes after 10 failures.
  3. Return generic `invalid_license` without timing leaks.
  4. Add vitest covering 429 after threshold.
**Verification Command:**
```powershell
pnpm --filter api test -- license-http
# Manual: 6 rapid POST /licenses/activate from same IP → expect 429
```

### P1-3: Rate limiting falls back to per-process memory when Redis unavailable

**Source:** `PRODUCTION_READINESS_AUDIT.md` §33; `productionready.md` Phase 3  
**Status:** PARTIAL — Redis limiters exist when `CONTROL_PLANE_REDIS_URL` is set; memory fallback remains  
**File(s):** `apps/api/src/middleware/global-rate-limit.ts` (lines 43–47, 89–120)  
**Line(s):** 43–47  
**Function/Route:** All routes via `globalRateLimitMiddleware`  
**Root Cause:** `getControlPlaneRedisClient()` returns null → limiters use `RateLimiterMemory`; each API replica has independent counters.  
**Production Impact:** Multi-instance deploy bypasses global and auth rate limits; DDoS and credential stuffing effectiveness drops.  
**Scaling Impact:** Broken at 2+ API containers without shared Redis.  
**Exact Fix Required:**
  1. In `validateRequiredEnvForProfile`, treat missing `CONTROL_PLANE_REDIS_URL` in production as **fatal** (already listed ~line 121 in `packages/config` — verify it runs at API boot).
  2. Remove silent `await next()` on limiter internal errors (lines 74–84) — fail closed with 503 or use Redis-only with health gate.
  3. Document in `infra/prod/OPERATIONS.md` that Redis is mandatory for multi-instance.
**Verification Command:**
```powershell
grep CONTROL_PLANE_REDIS_URL infra/prod/.env
# With 2 api replicas: load test should hit 429 globally, not per replica
```

### P1-4: Docker socket-proxy grants `POST` + `BUILD` to worker

**Source:** `PRODUCTION_READINESS_AUDIT.md` §9, §34.7  
**Status:** OPEN  
**File(s):** `infra/prod/docker-compose.yml` (lines 77–89)  
**Line(s):** 89 (`POST: 1`, `BUILD: 1`)  
**Function/Route:** Worker → `socket-proxy:2375`  
**Root Cause:** Worker needs compose lifecycle; proxy is permissive.  
**Production Impact:** Compromise of worker container ≈ root on Docker host → provision/stop any tenant, read secrets from volumes.  
**Scaling Impact:** Same blast radius regardless of tenant count.  
**Exact Fix Required:**
  1. Restrict proxy env to minimum: disable `POST` if using read-only inspect + external orchestration, or use [Tecnativa allowlist](https://github.com/Tecnativa/docker-socket-proxy) per API verb.
  2. Run worker on dedicated node with AppArmor/seccomp; no SSH keys on host.
  3. Audit `infra/worker-service/domain/provisioning/*` for required Docker API calls only.
  4. Add alerting on unexpected container create events.
**Verification Command:**
```powershell
docker compose -f infra/prod/docker-compose.yml config 2>&1 | Select-String "POST"
```

### P1-5: No API `/ready` probe (DB/Redis dependency check)

**Source:** `PRODUCTION_READINESS_AUDIT.md` §19, §43, §50.11  
**Status:** OPEN  
**File(s):** `apps/api/src/index.ts` — only `GET /health` (~line 1050)  
**Line(s):** ~1050  
**Function/Route:** `GET /health`  
**Root Cause:** Health returns OK without verifying Postgres connectivity or Redis when configured.  
**Production Impact:** Traefik/load balancer sends traffic to API during DB failover → user-facing 503 storm; deploy rollouts mark healthy too early.  
**Scaling Impact:** Worse with rolling updates at scale.  
**Exact Fix Required:**
  1. Add `GET /ready` that runs `SELECT 1` on `db` and `PING` on Redis if `CONTROL_PLANE_REDIS_URL` set.
  2. Return 503 if either fails; keep `/health` lightweight for liveness.
  3. Point Traefik `healthcheck` and deploy smoke test at `/ready`.
**Verification Command:**
```powershell
curl -s -o NUL -w "%{http_code}" http://localhost:4000/ready
# Stop postgres → expect 503
```

### P1-6: Chatwoot stack has no healthchecks in prod compose

**Source:** `PRODUCTION_READINESS_AUDIT.md` §23; `productionready.md` Phase 8  
**Status:** OPEN  
**File(s):** `infra/prod/docker-compose.yml` (lines 313–368)  
**Line(s):** 313+  
**Function/Route:** `chatwoot`, `chatwoot-postgres`, `chatwoot-redis` services  
**Root Cause:** Services defined without `healthcheck` blocks; `depends_on` does not wait for readiness.  
**Production Impact:** Rails app may accept traffic before DB ready; silent support-chat outage after deploy.  
**Scaling Impact:** N/A (single instance).  
**Exact Fix Required:**
  1. Add `healthcheck` to `chatwoot-postgres` (`pg_isready`), `chatwoot-redis` (`redis-cli ping`), `chatwoot` (HTTP `/` or `/api`).
  2. Set `depends_on: condition: service_healthy`.
  3. Optionally remove host port `3200` publish if only internal.
**Verification Command:**
```powershell
docker compose -f infra/prod/docker-compose.yml config 2>&1 | Select-String -Pattern "chatwoot" -Context 0,15
```

### P1-7: API test flakiness (`license-single-active.test.ts`)

**Source:** `docs/VERIFICATION_REPORT.md` (H2 note)  
**Status:** PARTIAL — final run 231/231 passed; earlier run had 3 failures  
**File(s):** `apps/api/tests/license-single-active.test.ts`  
**Line(s):** N/A  
**Function/Route:** License DB constraints  
**Root Cause:** Test depends on DB state / ordering; likely race or shared DB between tests.  
**Production Impact:** CI false negatives block deploy; undetected regressions if ignored.  
**Scaling Impact:** N/A  
**Exact Fix Required:**
  1. Isolate test DB transaction or use per-test tenant IDs.
  2. Run test 5× in CI: `for i in 1..5; do pnpm --filter api test -- license-single-active || exit 1; done`
  3. Fix root cause (unique constraint timing).
**Verification Command:**
```powershell
cd apps/api; 1..5 | ForEach-Object { pnpm test -- license-single-active; if ($LASTEXITCODE -ne 0) { exit 1 } }
```

### P1-8: POS backend tests not verified in latest audit window

**Source:** `docs/VERIFICATION_REPORT.md` M5, test summary  
**Status:** PARTIAL — CI step exists in `.github/workflows/deploy.yml`; local run hung (>180s)  
**File(s):** `services/posnew/apps/pos-backend`, `.github/workflows/deploy.yml`  
**Line(s):** deploy.yml POS test step  
**Function/Route:** N/A  
**Root Cause:** Unknown — possible open handles, Mongo dependency, or slow suite.  
**Production Impact:** POS regressions ship undetected.  
**Scaling Impact:** N/A  
**Exact Fix Required:**
  1. Run `cd services/posnew/apps/pos-backend && npm test -- --runInBand --forceExit` with timeout in CI.
  2. Fix hanging test or add `testTimeout` in jest config.
  3. Require green POS job before `deploy` job (already in `needs: quality` — verify not skipped).
**Verification Command:**
```powershell
cd services/posnew/apps/pos-backend; npm test -- --runInBand --forceExit
```

### P1-9: BullMQ workers run inside API process — duplicate consumers if API scaled horizontally

**Source:** `PRODUCTION_READINESS_AUDIT.md` §13, §32, §33  
**Status:** OPEN  
**File(s):** `apps/api/src/jobs/license-expiry-queue.ts`, `apps/api/src/jobs/owner-invite-mail-queue.ts`, `apps/api/src/index.ts` (worker init)  
**Line(s):** N/A  
**Function/Route:** BullMQ queues `license-expiry-milestones`, `owner-invite-mail`  
**Root Cause:** Each API replica starts BullMQ workers when Redis is configured.  
**Production Impact:** Duplicate license emails, duplicate milestone notifications, duplicate side effects.  
**Scaling Impact:** Breaks at 2+ API replicas.  
**Exact Fix Required:**
  1. Move BullMQ consumers to dedicated process (worker service or `api-worker` container) with `concurrency: 1` per queue.
  2. Or use BullMQ `group` + distributed lock on startup.
  3. Gate worker start with `RUN_BULLMQ_CONSUMERS=1` on exactly one replica.
**Verification Command:**
```powershell
# Scale api to 2 in dev; trigger one license milestone → expect exactly 1 email log row
```

### P1-10: Stale provision job reclaim can overlap with in-flight Docker work

**Source:** `PRODUCTION_READINESS_AUDIT.md` §13, §29, §50.6  
**Status:** PARTIAL — `WORKER_STALE_LEASE_THRESHOLD_MS` default 3_000_000 (50 min) > job timeout 2_700_000 (45 min); `claim_token` fencing on heartbeat/complete  
**File(s):** `apps/api/src/index.ts` (lines 1100–1212), `packages/db/drizzle/0049_tenant_lifecycle_jobs_claim_token.sql`  
**Line(s):** 1104–1212  
**Function/Route:** `POST /internal/jobs/claim`  
**Root Cause:** On stale reclaim, `claimToken` cleared and job re-queued; second worker may run `docker compose up` while first still holds containers.  
**Production Impact:** Duplicate tenant stacks, port conflicts, corrupted `tenant_deployments` state.  
**Scaling Impact:** More likely under load or slow hosts (100+ concurrent provisions).  
**Exact Fix Required:**
  1. Before reclaim, call worker fence: `docker compose -p <project> ps` and reconcile state.
  2. Require `claimToken` match for **all** job mutations including stale reclaim path.
  3. Add `provisioning_lock` column or use Postgres advisory lock per `tenant_id`.
  4. Emit `tenant_provision_events` alert on duplicate reclaim.
**Verification Command:**
```powershell
pnpm --filter api test -- internal-jobs
# Integration: kill worker mid-provision, wait for reclaim, verify single active compose project
```

### P1-11: Manual SQL migrations documented but not automated

**Source:** `PRODUCTION_READINESS_AUDIT.md` §18, §34.3  
**Status:** OPEN  
**File(s):** `infra/prod/OPERATIONS.md`, `packages/db/drizzle/meta/_journal.json`, `scripts/apply-orphan-migrations.ts`  
**Line(s):** N/A  
**Function/Route:** N/A  
**Root Cause:** Migrations 0044–0046 (and duplicate `0035_*`, `0038_*` prefixes) require operator intervention.  
**Production Impact:** Deploy with code expecting new columns → runtime 500s; partial unique indexes missing → license integrity bugs.  
**Scaling Impact:** Every deploy risk compounds.  
**Exact Fix Required:**
  1. Consolidate orphan SQL into Drizzle journal or single `pnpm db:migrate` path.
  2. Add CI step: `pnpm --filter @repo/db db:migrate` against ephemeral Postgres + `verify-schema.ts`.
  3. Remove `migration-repair-baseline.ts` from production path or gate behind explicit flag.
**Verification Command:**
```powershell
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts
```

### P1-12: No automated platform Postgres backup in compose

**Source:** `PRODUCTION_READINESS_AUDIT.md` §35  
**Status:** OPEN  
**File(s):** `infra/prod/docker-compose.yml`, `infra/prod/OPERATIONS.md`  
**Line(s):** N/A  
**Function/Route:** N/A  
**Root Cause:** Backup is manual operator responsibility.  
**Production Impact:** Data loss on disk failure, ransomware, or bad migration — unrecoverable platform.  
**Scaling Impact:** More data at 1000 tenants = larger RPO pain.  
**Exact Fix Required:**
  1. Add `pg_dump` sidecar cron or host cron to S3 with retention.
  2. Document and test restore monthly.
  3. Include `tenant_deployments` credential backup encryption keys in runbook.
**Verification Command:**
```powershell
# After setup: aws s3 ls s3://<backup-bucket>/stockix-platform/ | Select-Object -Last 5
```

### P1-13: `DASHBOARD_URL` unset → invite links use localhost

**Source:** `docs/VERIFICATION_REPORT.md` C3 residual  
**Status:** PARTIAL — production validation requires `DASHBOARD_URL`; fallback still in code  
**File(s):** `apps/api/src/index.ts` (line 2391)  
**Line(s):** 2391  
**Function/Route:** Owner invite generation  
**Root Cause:** `dashboardUrl ?? "http://localhost:3000"` when env missing.  
**Production Impact:** Misconfigured prod sends owners broken invite URLs.  
**Scaling Impact:** N/A  
**Exact Fix Required:**
  1. Replace fallback with throw when `NODE_ENV === 'production' && !dashboardUrl`.
  2. Use `dashboardConfig.dashboardUrl` from `@repo/config` only.
**Verification Command:**
```powershell
grep DASHBOARD_URL infra/prod/.env
# unset DASHBOARD_URL in staging → invite API should 500 with clear error
```

### P1-14: PMS tenant stack — no healthchecks

**Source:** `PRODUCTION_READINESS_AUDIT.md` §23  
**Status:** OPEN  
**File(s):** `infra/pms-tenant-stack/docker-compose.yml`  
**Line(s):** N/A  
**Function/Route:** PMS API/UI containers  
**Root Cause:** Compose services lack `healthcheck`.  
**Production Impact:** Traefik routes to dead PMS containers; false “provisioned” status.  
**Scaling Impact:** Worse with many PMS tenants on one host.  
**Exact Fix Required:**
  1. Add HTTP health endpoint in `services/pms/src/index.ts` if missing.
  2. Add compose `healthcheck` + Traefik `loadbalancer.healthcheck` labels.
**Verification Command:**
```powershell
docker compose -f infra/pms-tenant-stack/docker-compose.yml config 2>&1 | Select-String healthcheck
```

### P1-15: Finance/POS tenant app tiers — limited healthchecks

**Source:** `PRODUCTION_READINESS_AUDIT.md` §23  
**Status:** PARTIAL — POS mongo has healthcheck; tenant-stack DB/redis only  
**File(s):** `infra/tenant-stack/docker-compose.yml`, `infra/pos-tenant-stack/docker-compose.yml`  
**Line(s):** tenant-stack 193+, pos 108  
**Function/Route:** N/A  
**Root Cause:** Application containers (Nest/Next) start without compose-level readiness probes.  
**Production Impact:** Readiness engine marks tenant READY before apps accept traffic.  
**Scaling Impact:** 100+ tenants → support tickets for “blank page after provision”.  
**Exact Fix Required:**
  1. Add healthchecks hitting Finance `/api/health` and POS `/api/ping`.
  2. Wire `getTenantReadiness` to probe internal ports, not just container running.
**Verification Command:**
```powershell
docker compose -f infra/tenant-stack/docker-compose.yml config 2>&1 | Select-String healthcheck
```

---

## SECTION 3 — P2 MEDIUM (Fix Within 2–4 Weeks)

### P2-1: God file `apps/api/src/index.ts` (~5,995 lines)

**Source:** All three audits  
**Status:** OPEN  
**File(s):** `apps/api/src/index.ts`  
**Root Cause:** All routes, middleware, and domain logic in one module.  
**Production Impact:** High regression risk; slow reviews; hot deploy reloads entire surface.  
**Exact Fix Required:** Extract `routes/tenants.ts`, `routes/internal-jobs.ts`, `routes/public.ts`; mount with `app.route()`; keep `index.ts` < 500 lines bootstrap only.

### P2-2: Duplicate `@repo/shared` (root vs Finance)

**Source:** `productionready.md` Phase 1, `PRODUCTION_READINESS_AUDIT.md` §39  
**Status:** OPEN  
**File(s):** `packages/shared/`, `services/stockix-finance/packages/shared/`  
**Root Cause:** Finance vendored monorepo mirrors package name.  
**Production Impact:** License constants / logger / crypto drift between control plane and Finance.  
**Exact Fix Required:** Single package via `workspace:*` protocol; Finance imports from root; delete duplicate.

### P2-3: PMS list routes — unbounded or large scans

**Source:** `docs/VERIFICATION_REPORT.md` M6; `PRODUCTION_READINESS_AUDIT.md` §31  
**Status:** PARTIAL — `reports.ts` uses `parsePagination`; occupancy still loads up to 1000 rooms in one query  
**File(s):** `services/pms/src/routes/*.ts` (bookings, guests, channels, staff, etc.)  
**Root Cause:** Many handlers use `.select()` without `.limit()`.  
**Production Impact:** Memory spikes and slow API for large properties.  
**Exact Fix Required:** Apply `parsePagination` from `_utils.ts` to every list route; cap default `limit` at 50.

### P2-4: PMS on shared platform Postgres (no per-tenant DB)

**Source:** `productionready.md` Phase 1/4; `PRODUCTION_READINESS_AUDIT.md` §12  
**Status:** OPEN (architectural)  
**File(s):** `packages/db/src/schema.ts` (`pms_*` tables), `services/pms/src/routes/*`  
**Root Cause:** PMS colocated with control-plane DB; isolation is app-layer only.  
**Production Impact:** Schema bug or missing `tenantId` filter → cross-tenant data leak.  
**Exact Fix Required:** Document model; add integration tests asserting 404 across tenants; consider Postgres RLS on `pms_*` tables.

### P2-5: No Postgres Row-Level Security (RLS)

**Source:** `productionready.md` Phase 4; `PRODUCTION_READINESS_AUDIT.md` §12  
**Status:** OPEN  
**File(s):** `packages/db/src/schema.ts`  
**Root Cause:** All isolation in application queries.  
**Production Impact:** Single missed `where(eq(...tenantId))` exposes data.  
**Exact Fix Required:** Enable RLS policies on `pms_*`, `organizations`, `tenants` for support roles.

### P2-6: Fine-grained RBAC (`platform_roles.permissions`) not enforced on wire

**Source:** `PRODUCTION_READINESS_AUDIT.md` §11, §42  
**Status:** OPEN  
**File(s):** `apps/api/src/middleware/rbac.ts` (`createRbacMiddleware`), `apps/api/src/index.ts` (uses `requiredApiRole` only)  
**Root Cause:** `createRbacMiddleware` used in tests only.  
**Production Impact:** UI may hide actions but API allows them for coarse roles.  
**Exact Fix Required:** Wire `createRbacMiddleware` globally after session resolution, or delete dead permission tables.

### P2-7: SSE notification streams poll Postgres every 2.5s

**Source:** `PRODUCTION_READINESS_AUDIT.md` §15, §31  
**Status:** OPEN  
**File(s):** `apps/api/src/index.ts` (provision SSE), `apps/api/src/routes/notifications.ts`, `apps/dashboard/app/api/notifications/stream/route.ts`  
**Root Cause:** Poll loop instead of LISTEN/NOTIFY or Redis pub/sub.  
**Production Impact:** DB load grows with concurrent dashboard tabs × owners.  
**Exact Fix Required:** Replace with Redis pub/sub or `NOTIFY owner_notifications_changed`.

### P2-8: No secret scanning in CI

**Source:** `PRODUCTION_READINESS_AUDIT.md` §25, §50.31  
**Status:** OPEN  
**File(s):** `.github/workflows/deploy.yml`  
**Root Cause:** No gitleaks/trufflehog step.  
**Production Impact:** Repeat of committed-secret incidents.  
**Exact Fix Required:** Add `gitleaks-action` on pull_request and push to `main`.

### P2-9: `apps/dashboard` — minimal automated tests (1 vitest file)

**Source:** `productionready.md` Phase 6/11; `PRODUCTION_READINESS_AUDIT.md` §20  
**Status:** OPEN  
**File(s):** `apps/dashboard/**/*.test.ts`  
**Root Cause:** No investment in App Router component/route tests.  
**Production Impact:** Provision wizard / license UI regressions ship silently.  
**Exact Fix Required:** Add Playwright smoke: login, tenant list, create tenant (mock API).

### P2-10: `infra/worker-service` — single unit test file

**Source:** `PRODUCTION_READINESS_AUDIT.md` §11  
**Status:** OPEN  
**File(s):** `infra/worker-service/tests/`  
**Root Cause:** Provision path tested manually only.  
**Production Impact:** Docker/Traefik workflow breaks without CI signal.  
**Exact Fix Required:** Mock Docker CLI; test claim/lease helpers and `provision-runtime.ts` error paths.

### P2-11: `services/pms` — zero automated tests

**Source:** `productionready.md` Phase 11  
**Status:** OPEN  
**File(s):** `services/pms/`  
**Root Cause:** No vitest/jest configured.  
**Production Impact:** PMS API regressions on shared DB.  
**Exact Fix Required:** Add vitest with tenant isolation tests per route.

### P2-12: `allocateOrganizationNumber` full-table scan

**Source:** `PRODUCTION_READINESS_AUDIT.md` §31  
**Status:** OPEN  
**File(s):** `apps/api/src/index.ts` (search `allocateOrganizationNumber`)  
**Root Cause:** O(n) scan over organizations.  
**Production Impact:** Slow tenant create at thousands of orgs.  
**Exact Fix Required:** Use Postgres sequence or `MAX(org_number)+1` indexed query per tenant.

### P2-13: API subdomain wildcard CORS (`*.ROOT_DOMAIN`)

**Source:** `productionready.md` SEC-6  
**Status:** OPEN  
**File(s):** `apps/api/src/index.ts` (CORS callback ~690–701)  
**Root Cause:** Any subdomain of root domain accepted.  
**Production Impact:** Compromised subdomain can call API with credentials.  
**Exact Fix Required:** Allowlist tenant subdomains from DB or static env list only.

### P2-14: ~40 `console.warn` / `console.error` in API `src`

**Source:** `productionready.md` Phase 2 (post-fix: no `console.log`)  
**Status:** PARTIAL  
**File(s):** `apps/api/src/mail/send.ts`, `license-http.ts`, `routes/webhooks/resend.ts`, etc.  
**Root Cause:** Not migrated to structured logger.  
**Production Impact:** Unstructured logs in aggregation tools.  
**Exact Fix Required:** Replace with `logger.warn` / `logger.error` from `apps/api/src/lib/logger.ts`.

### P2-15: Dead / duplicate code paths

**Source:** `PRODUCTION_READINESS_AUDIT.md` §41  
**Status:** OPEN  
**File(s):** `apps/api/src/routes/jobs/index.ts`, `apps/api/src/middleware/auth.ts`, `packages/ui/`  
**Root Cause:** Superseded by inline `index.ts` implementations.  
**Production Impact:** Engineers fix wrong file; confusion during incidents.  
**Exact Fix Required:** Delete or mount; remove `@repo/ui` from dashboard deps if unused.

### P2-16: Worker bundles API mail/license source via relative imports

**Source:** `PRODUCTION_READINESS_AUDIT.md` §5, §40  
**Status:** OPEN  
**File(s):** `apps/api/tsup.worker.config.ts`, `infra/worker-service/src/worker.ts`  
**Root Cause:** Tight coupling — API change breaks worker bundle.  
**Production Impact:** Deploy API without rebuilding worker → stale behavior.  
**Exact Fix Required:** Extract `packages/platform-worker-shared` for mail, license, provision helpers.

### P2-17: Mail `skipped` / Resend webhook partial success paths

**Source:** `PRODUCTION_READINESS_AUDIT.md` §14, §30  
**Status:** OPEN  
**File(s):** `apps/api/src/mail/send.ts`, `apps/api/src/routes/webhooks/resend.ts`, `apps/api/src/jobs/owner-invite-mail-queue.ts`  
**Root Cause:** BullMQ treats `skipped` as success; webhook returns `{ ok: true }` on DB failure.  
**Production Impact:** Owners think email sent; license milestones notify without delivery.  
**Exact Fix Required:** Throw on `skipped` in workers; webhook 500 if `updateEmailLogDelivery` fails.

### P2-18: No `infra/staging/` environment

**Source:** All audits  
**Status:** OPEN  
**File(s):** N/A  
**Root Cause:** Only dev + prod compose.  
**Production Impact:** Production is first place full stack is exercised.  
**Exact Fix Required:** Add `infra/staging/docker-compose.yml` mirroring prod with scaled-down resources.

### P2-19: `WEBHOOK_BASE_URL` missing from root `.env.example`

**Source:** `docs/VERIFICATION_REPORT.md` M3  
**Status:** OPEN  
**File(s):** `.env.example` (root)  
**Root Cause:** Finance uses `STRIPE_PAYMENT_REDIRECT_URL` in finance example only.  
**Production Impact:** Operators misconfigure webhooks across products.  
**Exact Fix Required:** Document `WEBHOOK_BASE_URL` or cross-link in root example.

### P2-20: Control-plane OpenAPI spec not published

**Source:** `productionready.md` Phase 5  
**Status:** OPEN  
**File(s):** `apps/api/`  
**Root Cause:** No OpenAPI generator for Hono routes.  
**Production Impact:** Integration partners lack contract; dashboard BFF drifts.  
**Exact Fix Required:** Add `hono-openapi` or zod-to-openapi from route schemas.

---

## SECTION 4 — P3 LOW (Fix Within 1 Month)

### P3-1: `WORKER_SECRET` dev default in config

**File(s):** `packages/config/src/index.ts` (~line 195)  
**Issue:** `readString("WORKER_SECRET", "dev-worker-secret")` — safe only if prod validation always runs.  
**Fix:** Remove default; require explicit value in all profiles.

### P3-2: License signing dev fallback string

**File(s):** `packages/config/src/index.ts` (~345–349)  
**Issue:** Dev signing secret embedded.  
**Fix:** Generate random on first `pnpm dev` if unset.

### P3-3: `THROTTLE_*` env vars unused

**File(s):** `packages/config/src/index.ts`, `apps/api/src/middleware/global-rate-limit.ts`  
**Issue:** Config documents throttle vars; middleware hardcodes 100/min.  
**Fix:** Wire env to limiter `points`/`duration` or remove dead config.

### P3-4: `ngrok-skip-browser-warning` in Finance e2e utils

**File(s):** `services/stockix-finance/e2e/_utils.ts`  
**Issue:** Dev tunnel header in repo.  
**Fix:** Move to local-only playwright config.

### P3-5: Triple package manager versions (pnpm 9 / Lerna / pnpm 10 Chatwoot)

**File(s):** Root, `services/stockix-finance`, `services/chatlive`  
**Issue:** CI friction and cache misses.  
**Fix:** Document tool versions in `CONTRIBUTING.md`; align Chatwoot subtree when possible.

### P3-6: `@repo/ui` unused dependency

**File(s):** `apps/dashboard/package.json`, `packages/ui/`  
**Issue:** Zero imports; duplicate of local `components/ui`.  
**Fix:** Remove dependency and package or wire imports.

### P3-7: Docs drift (`docs/ARCHITECTURE.md` vs workspace)

**File(s):** `docs/ARCHITECTURE.md`, `pnpm-workspace.yaml`  
**Issue:** POS documented as outside workspace; it is included.  
**Fix:** Update architecture doc.

### P3-8: Finance Playwright — auth spec only

**File(s):** `services/stockix-finance/packages/webapp`  
**Issue:** No invoice/journal E2E.  
**Fix:** Add one critical-path spec per release.

### P3-9: Dashboard static bundle CI warning only (>10MB)

**File(s):** `.github/workflows/deploy.yml`  
**Issue:** Warns but does not fail build.  
**Fix:** Set hard fail threshold or track trend artifact.

### P3-10: `infra/worker-service/.tmp-dist/` build artifacts

**File(s):** `infra/worker-service/.tmp-dist/`  
**Issue:** May contain compiled config with dev defaults.  
**Fix:** Add to `.gitignore`; delete from repo if tracked.

---

## SECTION 5 — P4 FUTURE (Roadmap Items)

### P4-1: OpenTelemetry distributed tracing

**Why it matters:** Cannot trace provision failures across API → worker → Finance/POS.  
**Effort estimate:** 2–3 weeks  
**Dependency:** Stable route boundaries (P2-1)

### P4-2: Kubernetes / Helm or ECS task definitions

**Why it matters:** Single EC2 Compose is SPOF; cannot autoscale control plane.  
**Effort estimate:** 6–10 weeks  
**Dependency:** Redis-backed limits, `/ready`, stateless API

### P4-3: Stripe Billing on control plane

**Why it matters:** No automated SaaS revenue collection.  
**Effort estimate:** 4–6 weeks  
**Dependency:** Plans schema stable

### P4-4: SOC2 / GDPR automation (export, delete, audit export)

**Why it matters:** Enterprise sales blocker.  
**Effort estimate:** 8–12 weeks  
**Dependency:** Audit log on all privileged routes (P2-6)

### P4-5: Cell-based tenancy / dedicated provision worker pool

**Why it matters:** 1000+ tenants exceed single-host Docker capacity.  
**Effort estimate:** Quarter+  
**Dependency:** Job queue redesign (NATS/SQS)

### P4-6: Unified POS deployment (Stockix tenant stack vs zerowix `docker-compose.production.yml`)

**Why it matters:** Two ops models double incident confusion.  
**Effort estimate:** 3–4 weeks  
**Dependency:** Product decision

### P4-7: Mandatory Prometheus/Grafana or managed APM

**Why it matters:** `METRICS_ENDPOINT` optional — no SLO dashboards.  
**Effort estimate:** 1–2 weeks  
**Dependency:** Stable metric names from `emitMetric`

### P4-8: Per-tenant automated backup jobs

**Why it matters:** Finance MySQL/Mongo recovery is operator-owned today.  
**Effort estimate:** 2–4 weeks  
**Dependency:** Object storage credentials per tenant stack

### P4-9: WAF / DDoS edge beyond Traefik

**Why it matters:** Rate limits alone insufficient for public endpoints.  
**Effort estimate:** 1 week (Cloudflare rules)  
**Dependency:** Cloudflare already used for ACME

### P4-10: PMS database isolation (per-tenant DB or schema)

**Why it matters:** Parity with Finance/POS isolation models.  
**Effort estimate:** Quarter+  
**Dependency:** Migration strategy for existing `pms_*` rows

---

## SECTION 6 — DOMAIN-SPECIFIC GAP SUMMARY

### 6.1 Security Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P0-1 | P0 | Rotate secrets — `.env` in git history |
| P1-1 | P1 | Public tenant org metadata enumeration |
| P1-2 | P1 | License activate brute-force surface |
| P1-3 | P1 | In-memory rate limit fallback multi-instance |
| P1-4 | P1 | Docker socket-proxy POST/BUILD exposure |
| P2-13 | P2 | Subdomain wildcard CORS |
| P2-4 | P2 | PMS shared DB trust boundary |
| P2-5 | P2 | No Postgres RLS |

### 6.2 Authorization / RBAC Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P2-6 | P2 | Fine-grained permissions not enforced |
| P1-1 | P1 | Public tenant org route |

### 6.3 Multi-Tenant Isolation Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P2-4 | P2 | PMS on platform Postgres |
| P2-5 | P2 | No RLS |
| P2-3 | P2 | PMS unbounded queries |

### 6.4 Queue / Worker Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P1-9 | P1 | Duplicate BullMQ consumers when API scaled |
| P1-10 | P1 | Stale reclaim vs in-flight Docker provision |
| P2-16 | P2 | Worker/API source coupling |
| P2-10 | P2 | No worker integration tests |

### 6.5 Email / Notification Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P2-17 | P2 | Mail skipped / webhook partial success |
| P1-13 | P1 | Invite URL localhost fallback |
| P2-7 | P2 | SSE DB polling load |

### 6.6 Database / Migration Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P1-11 | P1 | Manual / orphan migration paths |
| P1-12 | P1 | No automated platform backups |
| P2-5 | P2 | No RLS |

### 6.7 Docker / Infrastructure Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P1-6 | P1 | Chatwoot no healthchecks |
| P1-14 | P1 | PMS tenant stack no healthchecks |
| P1-15 | P1 | Finance/POS app tier healthchecks |
| P1-4 | P1 | Socket-proxy permissions |
| P2-18 | P2 | No staging compose |

### 6.8 CI/CD Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P1-7 | P1 | Flaky `license-single-active` test |
| P1-8 | P1 | POS tests unverified locally |
| P2-8 | P2 | No secret scanning |
| P2-9 | P2 | No dashboard E2E in CI |

### 6.9 Observability Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P1-5 | P1 | No `/ready` probe |
| P4-1 | P4 | No OpenTelemetry |
| P4-7 | P4 | Metrics optional only |
| P2-14 | P2 | console.warn/error in API |

### 6.10 API / Backend Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P2-1 | P2 | 5,995-line `index.ts` |
| P2-12 | P2 | Org number allocation scan |
| P2-20 | P2 | No OpenAPI |
| P1-2 | P1 | Public license routes |

### 6.11 Frontend Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P2-9 | P2 | Dashboard test coverage |
| P3-8 | P3 | Finance Playwright minimal |
| P3-9 | P3 | Bundle size warn-only |

### 6.12 Performance / Scalability Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P2-3 | P2 | PMS unbounded lists |
| P2-7 | P2 | SSE polling |
| P2-12 | P2 | Org number O(n) scan |
| P1-3 | P1 | Rate limit sharding |
| P4-5 | P4 | Single-host tenant ceiling |

### 6.13 Testing Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P1-7 | P1 | API flake |
| P1-8 | P1 | POS suite |
| P2-9 | P2 | Dashboard |
| P2-10 | P2 | Worker |
| P2-11 | P2 | PMS zero tests |

### 6.14 Secrets / Environment Gaps Still Open

| ID | Severity | One-line description |
|----|----------|----------------------|
| P0-1 | P0 | Git history |
| P3-1 | P3 | dev-worker-secret default |
| P2-19 | P2 | WEBHOOK_BASE_URL docs |
| P1-13 | P1 | DASHBOARD_URL fallback |

---

## SECTION 7 — FAILURE MODE MATRIX (STILL AT RISK)

### At 100 tenants

- P1-10 duplicate provision on reclaim  
- P1-15 readiness false positives (no app healthchecks)  
- P2-3 PMS memory on large properties  
- P2-12 org number allocation slowdown  
- Host disk / Docker layer pressure (architectural — no code fix listed)

### At 1,000 tenants

- All 100-tenant risks amplified  
- P1-3 rate limits ineffective if API horizontally scaled without Redis discipline  
- P2-7 SSE poll × connections → Postgres QPS ceiling  
- Traefik dynamic file churn (thousands of YAML files)  
- P1-4 socket-proxy blast radius unchanged

### At 10,000 tenants

- P4-5 cell-based tenancy required — single EC2 model **fails catastrophically**  
- P2-12 allocation scan untenable  
- Port exhaustion (`MAX_TENANT_PORT` sequential model)  
- Manual ops cannot clear provision backlogs

### During Redis outage

- P1-3 in-memory rate limits only  
- P1-9 BullMQ stops — inline fallbacks may duplicate work  
- POS tenant queues → outbox `no_redis` only (per prior audit)

### During Resend outage

- P2-17 mail skipped treated as success in workers  
- License milestone in-app notifications may fire without email  
- `email_logs` stale — no webhook updates

### During DB failover

- P1-5 no `/ready` — traffic routed to unhealthy API  
- Worker idle (cannot claim jobs)  
- No read-replica routing

### During partial deploy

- P2-16 stale worker bundle if worker not rebuilt  
- P1-11 schema drift if migrations skipped  
- Dashboard `NEXT_PUBLIC_*` wrong if build args not passed

### During worker crash

- P1-10 jobs stuck `running` until stale reclaim; duplicate compose risk  
- License scan / milestone processing stops until restart

### During node restart

- P1-10 in-flight provisions reclaimed  
- SSE clients disconnect (benign)  
- BullMQ stalls until API process restarts consumers

### On Windows dev environment

- File watcher / Fast Refresh noise (`docs/build.md`)  
- Docker Desktop bind-mount latency for provision  
- Path separator edge cases in provision scripts (mostly OK with `node:path`)

### In Docker Swarm / Kubernetes

- **Not supported today** — Compose bind mounts, socket-proxy, file-based Traefik  
- Would need: shared storage, ingress, job CRD, no host port per tenant (P4-2)

### ✅ RESOLVED (since audits — do not re-open)

- Resend webhook fail-open in production → 401 when secret missing (`resend.ts` 55–61)  
- Hardcoded Finance script secrets → env required (`provision-jad-orgs.mjs` 5–8)  
- Tenant scope on all `/tenants/:tenantId` routes → `audit-tenant-scope.mjs` 19/19  
- Impersonate scope → `tenantWithinOwnerScope` (`index.ts` 5461)  
- Finance Socket prod localhost → throws if `SOCKET_ALLOWED_ORIGINS` unset (`Socket.gateway.ts` 26–29)  
- Unknown API paths → 404 before auth (`index.ts` 772–781, `known-api-paths.ts`)  
- Worker healthcheck + Sentry in prod compose / worker.ts  
- `DB_POOL_MAX` in `infra/prod/.env`  
- POS tenant `mem_limit` / `cpus` in compose  
- Deploy smoke `curl` via Traefik API domain  
- Stale lease default 50 min > job timeout 45 min  
- `claim_token` column + fencing on complete/heartbeat  

---

## SECTION 8 — OPEN ITEMS REQUIRING MANUAL ACTION

### MANUAL-1: Rotate all platform secrets after `.env` git exposure

**Action Required:** Rotate secrets on server; update `infra/prod/.env`; bump session versions; re-deploy api + worker + dashboard.  
**Who:** ops + developer  
**Urgency:** before deploy  
**Consequence if skipped:** Historical clone recovers live credentials.

### MANUAL-2: Enable GitHub branch protection

**Action Required:** Settings → Branches → require PR reviews + status checks (`deploy.yml` quality job).  
**Who:** ops  
**Urgency:** before deploy  
**Consequence if skipped:** Direct push to `main` bypasses CI.

### MANUAL-3: Apply manual SQL from `infra/prod/OPERATIONS.md`

**Action Required:** Run documented 0044–0046 (and any orphan) SQL on production Postgres before API deploy.  
**Who:** ops  
**Urgency:** before deploy  
**Consequence if skipped:** Runtime 500s on license/org features.

### MANUAL-4: Verify Traefik ACME / Cloudflare token on prod host

**Action Required:** `docker compose -f infra/prod/docker-compose.yml logs traefik` — confirm cert renewal.  
**Who:** ops  
**Urgency:** before deploy  
**Consequence if skipped:** TLS expiry → full outage.

### MANUAL-5: Review docker socket-proxy ACL with security team

**Action Required:** Document allowed Docker API verbs; restrict `POST`/`BUILD` if possible.  
**Who:** ops + security  
**Urgency:** within 1 week  
**Consequence if skipped:** Worker compromise = host takeover.

### MANUAL-6: Configure platform Postgres backups to S3

**Action Required:** Implement cron + test restore (see P1-12).  
**Who:** ops  
**Urgency:** within 1 week  
**Consequence if skipped:** Unrecoverable data loss.

### MANUAL-7: Confirm `CONTROL_PLANE_REDIS_URL` on production

**Action Required:** `grep CONTROL_PLANE_REDIS_URL infra/prod/.env` — must be non-empty.  
**Who:** ops  
**Urgency:** before deploy  
**Consequence if skipped:** Rate limits and BullMQ degraded.

### MANUAL-8: Pre-build tenant images on host before bulk provision

**Action Required:** Run `pnpm build:tenant-images` (or documented script) per `OPERATIONS.md`.  
**Who:** ops  
**Urgency:** before onboarding burst  
**Consequence if skipped:** Provision timeouts and failed tenants.

---

## SECTION 9 — VERIFICATION CHECKLIST

| ID | Item | Severity | Verification Command | Status |
|----|------|----------|----------------------|--------|
| P0-1 | Secret rotation after `.env` history | P0 | `git log --oneline -- .env` then confirm new secrets in prod | ❌ OPEN |
| P1-1 | Restrict public tenant org API | P1 | `curl public/tenant-orgs/<uuid>` → expect auth or token | ❌ OPEN |
| P1-2 | License activate rate limit | P1 | 6× POST `/licenses/activate` → 429 | ❌ OPEN |
| P1-3 | Redis required for prod rate limits | P1 | `grep CONTROL_PLANE_REDIS_URL infra/prod/.env` | ⚠️ PARTIAL |
| P1-4 | Socket-proxy hardening | P1 | Review `infra/prod/docker-compose.yml` socket-proxy env | ❌ OPEN |
| P1-5 | API `/ready` probe | P1 | `curl -w "%{http_code}" localhost:4000/ready` | ❌ OPEN |
| P1-6 | Chatwoot healthchecks | P1 | `docker compose config` shows healthcheck for chatwoot | ❌ OPEN |
| P1-7 | License test 5× green | P1 | `pnpm test -- license-single-active` ×5 | ⚠️ PARTIAL |
| P1-8 | POS tests complete | P1 | `cd services/posnew/apps/pos-backend && npm test` | ⚠️ PARTIAL |
| P1-9 | Single BullMQ consumer | P1 | Scale api×2, one job side effect | ❌ OPEN |
| P1-10 | Provision reclaim fencing | P1 | Kill worker mid-provision integration test | ⚠️ PARTIAL |
| P1-11 | Migrations automated | P1 | `pnpm --filter @repo/db db:migrate` + verify-schema | ❌ OPEN |
| P1-12 | Postgres backups | P1 | S3 backup object < 24h old | ❌ OPEN |
| P1-13 | No localhost invite URL in prod | P1 | `grep DASHBOARD_URL infra/prod/.env` | ⚠️ PARTIAL |
| P1-14 | PMS tenant healthchecks | P1 | `docker compose -f infra/pms-tenant-stack/docker-compose.yml config` | ❌ OPEN |
| P1-15 | Finance/POS app healthchecks | P1 | tenant-stack compose config | ⚠️ PARTIAL |
| P2-1 | Split API index.ts | P2 | `wc -l apps/api/src/index.ts` < 800 | ❌ OPEN |
| P2-3 | PMS pagination | P2 | Code review all `routes/*.ts` for `.limit(` | ⚠️ PARTIAL |
| P2-8 | Gitleaks in CI | P2 | PR shows gitleaks check | ❌ OPEN |
| P2-9 | Dashboard Playwright | P2 | CI runs `playwright test` on dashboard | ❌ OPEN |
| P2-11 | PMS tests | P2 | `pnpm --filter pms test` exists and passes | ❌ OPEN |
| MANUAL-2 | Branch protection | MANUAL | GitHub UI | ❌ OPEN |
| MANUAL-3 | Manual SQL applied | MANUAL | Ops ticket + DB `\d` verify | ❌ OPEN |

---

## SECTION 10 — PRODUCTION DEPLOY GATES

### Gate 1 — TypeScript (MUST BE 0 ERRORS)

```powershell
npx tsc --noEmit    # apps/api
npx tsc --noEmit    # apps/dashboard
npx tsc --noEmit    # infra/worker-service
npx tsc --noEmit    # packages/db
npx tsc --noEmit    # packages/auth
npx tsc --noEmit    # packages/config
npx tsc --noEmit    # services/pms
npx tsc --noEmit    # services/stockix-finance/packages/server
```

**Status:** ✅ Passing per `docs/VERIFICATION_REPORT.md` (2026-05-26)

### Gate 2 — Tests (MUST BE 0 FAILURES, 5 CONSECUTIVE RUNS)

```powershell
pnpm test           # apps/api — include license-single-active ×5
pnpm test           # services/stockix-finance/packages/server
npm test            # services/posnew/apps/pos-backend — must complete
```

**Status:** ⚠️ API/Finance green; POS unverified; flake watch on license test

### Gate 3 — Security

```powershell
pnpm audit          # 0 critical, 0 high
grep -r "JadFinance2026" .              # 0 results
grep -rn "origin: '\*'" services/       # 0 results
git ls-files infra/worker-service/.runtime/  # empty
node apps/api/scripts/audit-tenant-scope.mjs   # exit 0
```

**Status:** ⚠️ Partial — audit script passes; P0-1 rotation is ops

### Gate 4 — Compose Validation

```powershell
docker compose -f infra/prod/docker-compose.yml config
docker compose -f infra/pos-tenant-stack/docker-compose.yml config
docker compose -f infra/tenant-stack/docker-compose.yml config
```

**Status:** ✅ Valid (dashboard `build.args` indentation fixed)

### Gate 5 — Tenant Scope Coverage

```powershell
node apps/api/scripts/audit-tenant-scope.mjs   # exit 0
```

**Status:** ✅ 19/19 routes pass (2026-05-26)

### Gate 6 — Environment

```powershell
grep -c "DB_POOL_MAX" infra/prod/.env           # must be ≥ 1
grep -c "CONTROL_PLANE_REDIS_URL" infra/prod/.env  # must be ≥ 1
grep -c "RESEND_WEBHOOK_SECRET" infra/prod/.env    # must be ≥ 1
grep -c "SENTRY_DSN" infra/prod/.env               # must be ≥ 1
```

**Status:** ⚠️ Verify on deploy host (local `infra/prod/.env` has `DB_POOL_MAX`)

### Gate 7 — Hardcoded Values

```powershell
grep -rn "localhost:3000" apps/api/src/     # only in error strings / dev-only branches
grep -rn "dev-worker-secret" .             # only in .env.example / packages/config default
grep -rn "JadFinance" .                    # 0 results
```

**Status:** ⚠️ `dev-worker-secret` remains in `packages/config`; invite fallback line 2391

### Gate 8 — Compose Health

| Service | Required | Current |
|---------|----------|---------|
| api | healthcheck | ✅ |
| dashboard | healthcheck | ✅ |
| postgres | healthcheck | ✅ |
| traefik | healthcheck | ✅ |
| control-plane-redis | healthcheck | ✅ |
| infra-worker | healthcheck | ✅ (port 9090) |
| chatwoot | healthcheck | ❌ |
| chatwoot-postgres | healthcheck | ❌ |
| chatwoot-redis | healthcheck | ❌ |
| tenant-stack app tier | healthcheck | ❌ |
| pos-tenant backend/ui | healthcheck | ❌ (mongo only) |
| pms-tenant-stack | healthcheck | ❌ |

**Current deploy clearance:** ❌ NOT CLEARED  
**Cleared when:** All gates above show ✅ including P0-1 ops rotation

---

## SECTION 11 — SCORE DELTA (Before vs After Pending Fixes)

| Dimension | Score Before P0 Fixes | Score After P0 Fixes | Score After All Fixes | Target |
|-----------|----------------------|---------------------|----------------------|--------|
| Overall production readiness | 68 | 78 | 92 | 90+ |
| Security | 62 | 76 | 90 | 88+ |
| Enterprise readiness | 55 | 68 | 85 | 80+ |
| SaaS maturity | 70 | 74 | 88 | 85+ |
| DevOps maturity | 65 | 72 | 88 | 85+ |
| Observability | 48 | 55 | 82 | 80+ |
| Testing reliability | 62 | 70 | 86 | 85+ |
| Maintainability | 52 | 58 | 78 | 75+ |
| Scalability | 58 | 62 | 80 | 75+ |

*“After P0 fixes” reflects code P0s closed since May 2026 audits (tenant scope, webhooks, Finance script, compose, worker health); ops P0-1 (secret rotation) still open.*

---

## SECTION 12 — RECOMMENDED FIX ORDER

### Week 1 (P0 — deploy blockers)

1. **MANUAL-1 / P0-1** — Rotate all secrets; document rotation date (blocks everything).  
2. **MANUAL-3** — Apply pending SQL migrations on production.  
3. **MANUAL-7** — Confirm Redis URL on prod (enables P1-3).  
4. **P1-5** — Add `/ready` before next rolling deploy.  
5. **P1-7** — Stabilize `license-single-active` test (5× green in CI).  
6. **MANUAL-2** — Branch protection.

*Dependencies: P1-3 depends on MANUAL-7; deploy should not proceed until P0-1 complete.*

### Week 2 (P1 — high priority)

1. **P1-4** — Socket-proxy review (security sign-off).  
2. **P1-9** — BullMQ single-consumer pattern.  
3. **P1-10** — Provision reclaim fencing hardening.  
4. **P1-6, P1-14, P1-15** — Healthchecks (Chatwoot → PMS → tenant apps).  
5. **P1-8** — POS test suite reliability.  
6. **P1-1, P1-2** — Public API hardening.  
7. **MANUAL-6** — Postgres backups.

### Week 3–4 (P2 — medium priority)

1. **P2-1** — Begin `index.ts` split (tenants + internal jobs first).  
2. **P2-3, P2-11** — PMS pagination + tests.  
3. **P2-8** — Gitleaks CI.  
4. **P2-9** — Dashboard Playwright smoke.  
5. **P2-17** — Mail reliability semantics.  
6. **P2-18** — Staging stack.

### Month 2 (P3 — low priority + P4 starts)

1. **P3-*** — Config cleanup, dead code removal.  
2. **P4-1** — OpenTelemetry spike.  
3. **P4-7** — Mandatory metrics stack.

---

## SECTION 13 — ITEMS CONFIRMED FIXED (REFERENCE ONLY)

> Do NOT re-open unless regression is detected.

| ID | Item | Evidence | Verified By |
|----|------|----------|-------------|
| C1 | PMS CORS no wildcard | `services/pms/src/index.ts` throws if `CORS_ALLOWED_ORIGINS` empty | VERIFICATION_REPORT.md |
| C2 | Finance WS CORS no wildcard in prod | `Socket.gateway.ts` lines 26–29 reject missing `SOCKET_ALLOWED_ORIGINS` in production | Code review 2026-05-26 |
| C3 | API CORS localhost gated | `index.ts` ~659–667 `nodeEnv !== "production"` | VERIFICATION_REPORT.md |
| C4 | API TypeScript 0 errors | `npx tsc --noEmit` apps/api | VERIFICATION_REPORT.md |
| C5 | Worker TypeScript 0 errors | `npx tsc --noEmit` infra/worker-service | VERIFICATION_REPORT.md |
| C6 | CI typecheck + tests | `.github/workflows/deploy.yml` `needs: quality` | VERIFICATION_REPORT.md |
| C7 | 0 critical/high npm audit | `pnpm audit` | VERIFICATION_REPORT.md |
| H1 | CORS env vars wired | root + prod `.env`, POS `CORS_ORIGINS` | VERIFICATION_REPORT.md |
| H2 | API tests 231/231 (final run) | `pnpm test` apps/api | VERIFICATION_REPORT.md |
| H3 | console.log removed from api/worker src | grep 0 matches | VERIFICATION_REPORT.md |
| H4 | Sentry on API | `@sentry/node` index.ts ~151–156 | VERIFICATION_REPORT.md |
| H5 | Docker mem/cpu limits prod + POS | `infra/prod/docker-compose.yml`, `pos-tenant-stack` | Code review 2026-05-26 |
| H6 | DB_POOL in prod env | `infra/prod/.env` `DB_POOL_MAX=20` | Code review 2026-05-26 |
| H7 | Global rate limiting | `global-rate-limit.ts` + Redis when configured | VERIFICATION_REPORT.md |
| H8 | Zod validation expanded | 17+ files `.parse()` / `.safeParse()` | VERIFICATION_REPORT.md |
| M2 | DEFAULT_LICENSE_TERM_DAYS | `.env` + config | VERIFICATION_REPORT.md |
| M4 | SMTP mail documented | `mail/send.ts` header | VERIFICATION_REPORT.md |
| M7 | METRICS_ENDPOINT documented | `.env.example`, prod `.env` | VERIFICATION_REPORT.md |
| L1–L4 | Localhost proxies, bundle CI, branch docs, GPL scan | grep + README + license-report | VERIFICATION_REPORT.md |
| F1 | Finance script secrets removed | `provision-jad-orgs.mjs` requires env vars | Code review 2026-05-26 |
| F2 | Resend webhook fail-closed prod | `resend.ts` 55–61 returns 401 | Code review 2026-05-26 |
| F3 | Tenant scope all routes | `audit-tenant-scope.mjs` 19 passed | Code review 2026-05-26 |
| F4 | Impersonate scope | `tenantWithinOwnerScope` index.ts 5461 | Code review 2026-05-26 |
| F5 | Dashboard compose YAML | `build.args` under `build:` ~265–268 | Code review 2026-05-26 |
| F6 | Deploy health via Traefik | `deploy.yml` curl `$API_DOMAIN/health` | Code review 2026-05-26 |
| F7 | Worker healthcheck | `infra-worker` wget :9090/health | Code review 2026-05-26 |
| F8 | Worker Sentry | `worker.ts` Sentry.init + captureException | Code review 2026-05-26 |
| F9 | Stale lease > job timeout | default 3_000_000 ms > 2_700_000 ms timeout | Code review 2026-05-26 |
| F10 | claim_token fencing | migration 0049 + index.ts heartbeat/complete | Code review 2026-05-26 |
| F11 | Unknown routes 404 before auth | `known-api-paths.ts` + index.ts 772–781 | Code review 2026-05-26 |
| F12 | Public tenant org rate limit | `publicTenantOrgsRateLimitMiddleware` | Code review 2026-05-26 |
| F13 | `.runtime` not in git | `.gitignore` + `git ls-files` empty | Code review 2026-05-26 |
| F14 | onError email_logs branch | `errMessage` variable index.ts 657–658 | Code review 2026-05-26 |
| F15 | Redis-backed rate limiters when configured | `RateLimiterRedis` in global-rate-limit.ts | Code review 2026-05-26 |
| F16 | POS compose memory limits | `infra/pos-tenant-stack/docker-compose.yml` | Code review 2026-05-26 |
| F17 | Internal routes WORKER_SECRET | index.ts ~761–768 | VERIFICATION_REPORT.md |
| F18 | HttpOnly session cookies | `routes/auth/index.ts` | VERIFICATION_REPORT.md |
| F19 | No eval / raw SQL concat in api src | grep clean | VERIFICATION_REPORT.md |
| F20 | Finance server tests 38/38 | `pnpm test` finance server | VERIFICATION_REPORT.md |

---

*End of production readiness gaps document. For full methodology and phase scores, see `PRODUCTION_READINESS_AUDIT.md`. For fix verification history, see `docs/VERIFICATION_REPORT.md`.*
