# STOCKIX — FINAL PRODUCTION REPORT

**Date:** 2026-05-27  
**Auditor:** Final verification pass (automated + manual cross-reference)  
**Based on:** `docs/failurarch.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/BRANCH_PROTECTION_SETUP.md`, `infra/prod/OPERATIONS.md`, `perf.md`, `README.md`, `docs/missing_for3.md`, and live command execution on workspace `stockixnew`  
**Verdict:** **NOT CLEARED**

---

## EXECUTIVE SUMMARY

Since the failure-architecture audit (`docs/failurarch.md`, 2026-05-27), engineering has closed several deploy blockers: the control-plane API was refactored out of a ~5,600-line `index.ts` into modular routes (`create-control-plane-app.ts`, `routes/*`), **all 12 TypeScript errors are resolved** (`pnpm check-types` exit 0), **architecture boundary and phase validation pass**, and the majority of automated tests are green (API 232/233, dashboard 5/5, PMS 51/51, Finance 38/38, POS CI 5/5). Production Docker Compose for the control plane validates, socket-proxy and control-plane-redis now have healthchecks and resource limits, and Resend webhooks fail closed when `RESEND_WEBHOOK_SECRET` is unset in production.

**The system is not cleared for paying-customer traffic.** One API security regression test still fails (MFA token tamper accepts modified signatures). Production-oriented environment variables on the audited `infra/prod/.env` remain empty or missing for TLS (`CF_DNS_API_TOKEN`), Chatwoot automation (`CHATWOOT_API_ACCESS_TOKEN`), observability (`SENTRY_DSN`), webhooks (`RESEND_WEBHOOK_SECRET`), and backups (`BACKUP_B2_*`). Git-history secret rotation is documented as `_pending_` in `infra/prod/OPERATIONS.md`. Three moderate CVEs remain in the POS `request` transitive chain. Worker code still imports `apps/api/src/*` directly. Performance debt (N+1 deprovision loop, stuck reconciler per-row queries, unreleased `setInterval` handles) and incomplete healthchecks on POS tenant workers remain.

Until every gate in **Production Deploy Gate (Final)** below is ✅, do not route production customer traffic.

---

## AUDIT DOCUMENT INVENTORY

| Document | Status | Used for |
|----------|--------|----------|
| `docs/VERIFICATION_REPORT.md` | **Not found** in repo | — |
| `docs/PRODUCTION_READINESS_AUDIT.md` | **Not found** in repo | — |
| `docs/PRODUCTION_CHECKLIST.md` | ✅ Read | Ops checklist, branch protection table |
| `docs/failurarch.md` | ✅ Read | 31 issues H1–H10, M1–M12, deploy gate baseline |
| `docs/SECRET_ROTATION_RUNBOOK.md` | **Referenced but file missing** | Linked from README/OPERATIONS |
| `docs/BRANCH_PROTECTION_SETUP.md` | ✅ Read | Required GitHub settings |
| `infra/prod/FAILOVER_RUNBOOK.md` | **Not found** | — |
| `infra/staging/STAGING.md` | **Not found** (no `infra/staging/`) | — |
| `infra/prod/OPERATIONS.md` | ✅ Read | Deploy, rotation, backup, Redis |
| `perf.md` | ✅ Read (root monorepo audit) | Architecture baseline |
| `README.md` | ✅ Read | Layout, scripts |
| `docs/missing_for3.md` | ✅ Skimmed | Functional/product gaps (Stripe, E2E sign-off) |

---

## MASTER SCORE (Final)

| Dimension | Before Fixes | After Fixes | Target | Status |
|-----------|:-----------:|:-----------:|:------:|--------|
| TypeScript integrity | 72/100 | **95/100** | 100 | ❌ (1 failing security test; worker coupling) |
| Test suite stability | 65/100 | **88/100** | 85+ | ✅ |
| Security | 62/100 | **70/100** | 88+ | ❌ |
| Configuration | 72/100 | **62/100** | 95+ | ❌ |
| Docker / Infra | 78/100 | **82/100** | 90+ | ❌ |
| CI/CD pipeline | 80/100 | **85/100** | 90+ | ❌ |
| Observability | 68/100 | **55/100** | 80+ | ❌ |
| Performance | 74/100 | **72/100** | 80+ | ❌ |
| Architecture | 58/100 | **78/100** | 75+ | ✅ |
| Multi-tenancy | 90/100 | **95/100** | 90+ | ✅ |
| Operational readiness | 70/100 | **65/100** | 85+ | ❌ |
| **OVERALL** | **70/100** | **76/100** | **90+** | **❌** |

---

## PRODUCTION DEPLOY GATE (FINAL)

| Gate | Was | Now | Status |
|------|-----|-----|--------|
| TypeScript 0 errors (all packages) | ❌ 12 errors | ✅ `pnpm check-types` exit 0; `apps/api` `tsc --noEmit` 0 errors | ✅ |
| API tests 0 failures (5 runs) | ❌ 8 failed | ❌ **1 failed** / 233 tests (`tokens.test.ts` tamper); 5-run stability **not executed** (single run only) | ❌ |
| 0 high/critical CVEs | ❌ 3 moderate | ✅ 0 high, 0 critical; ❌ **3 moderate** (`request`/`uuid`/`qs` via POS) | ❌ |
| `CF_DNS_API_TOKEN` set | ❌ empty | ❌ **EMPTY** (0 chars) in `infra/prod/.env` | ❌ |
| `CHATWOOT_API_ACCESS_TOKEN` set | ❌ empty | ❌ **EMPTY** (0 chars) | ❌ |
| `RESEND_WEBHOOK_SECRET` set | ❌ empty | ❌ **MISSING** from `infra/prod/.env` | ❌ |
| `SENTRY_DSN` set | ❌ empty | ❌ **MISSING** from `infra/prod/.env` | ❌ |
| `BACKUP_B2_BUCKET` configured | ❌ empty | ❌ **MISSING** (`BACKUP_B2_*` all absent in audited `.env`) | ❌ |
| Secrets rotated (git history) | ❌ pending | ❌ `OPERATIONS.md`: `SECRETS ROTATED: _pending_`; `.env` in git history | ❌ |
| socket-proxy healthcheck | ❌ missing | ✅ healthcheck + mem/cpu in `infra/prod/docker-compose.yml` | ✅ |
| control-plane-redis limits | ❌ missing | ✅ `mem_limit: 320m`, `cpus: "0.25"` | ✅ |
| Chatwoot resource limits | ❌ missing | ❌ `chatwoot`, `chatwoot-postgres`, `chatwoot-redis` have **no** `mem_limit`/`cpus` | ❌ |
| POS worker healthchecks | ❌ missing | ❌ `pos-platform-worker`, `pos-bigcapital-worker`, `pos-redis`, `pos-mongo-init` **no** healthcheck | ❌ |
| `pnpm lint:boundaries` | ❌ FAIL | ✅ `Boundary checks passed.` | ✅ |
| `pnpm architecture:validate` | ❌ FAIL | ✅ Phase 1–4 PASS | ✅ |
| Branch protection | ❌ unconfirmed | ❌ Checklist rows still **PENDING**; `gh` not run on this host | ❌ |
| Staging environment | ❌ missing | ❌ No `infra/staging/docker-compose.yml` | ❌ |
| Security audit in CI | ❌ missing | ❌ No `pnpm audit` / Trivy / CodeQL in `deploy.yml` quality-gate | ❌ |
| N+1 queries fixed | ❌ present | ❌ Deprovision loop + stuck reconciler still per-row queries | ❌ |
| setInterval cleanup | ❌ leaking | ❌ `stuck-reconciler.ts`, `readiness-reconciler.ts` — no `clearInterval` on shutdown | ❌ |
| Worker imports decoupled | ❌ coupled | ❌ 4 files still import `../../../apps/api/src/*` | ❌ |
| All compose files valid | ✅ | ✅ `docker compose -f infra/prod/docker-compose.yml config` exit 0; tenant stacks parse | ✅ |
| Tenant scope 19/19 | ✅ | ✅ `Tenant scope audit: 19 passed, 0 failed` | ✅ |
| PMS tests 51/51 | ✅ | ✅ 51 passed | ✅ |
| Finance tests 38/38 | ✅ | ✅ 38 passed (`services/stockix-finance/packages/server`) | ✅ |
| Dashboard TypeScript 0 errors | ✅ | ✅ Included in `pnpm check-types` | ✅ |
| **CLEARED FOR PRODUCTION** | **NO** | **NO** | **❌** |

**Blocking issue count: 18 gates ❌**

---

## VERIFICATION BLOCK RESULTS (EXACT COMMANDS)

### Block 1 — TypeScript

```
pnpm check-types
→ exit 0, "Tasks: 8 successful, 8 total", 1m27s

cd apps/api && npx tsc --noEmit
→ 0 lines matching "error TS"

grep @ts-ignore|@ts-expect-error| as any in apps/api/src, apps/dashboard, packages, infra/worker-service
→ 0 matches in production paths
```

| Package | Errors Before | Errors Now | Status |
|---------|:-------------:|:----------:|--------|
| apps/api | 12 | **0** | ✅ |
| apps/dashboard | 0 | **0** | ✅ |
| packages/* (auth, config, db, shared) | 0 | **0** | ✅ |
| @stockix/pms | 0 | **0** | ✅ |
| infra/worker-service | — | **0** | ✅ |

### Block 2 — Architecture boundaries

```
pnpm lint:boundaries → Boundary checks passed.
pnpm architecture:validate → Phase 1–4 PASS, PRODUCTION READY: YES
node apps/api/scripts/audit-tenant-scope.mjs → 19 passed, 0 failed
grep process.env in apps/api/src/index.ts → 0 matches
grep apps/api/src in infra/worker-service/src → 4 import lines (FAIL)
grep @repo/db in services/posnew → 0 matches
grep apps/api/src in apps/api/tsup.worker.config.ts → 0 matches
```

### Block 3 — Tests

```
pnpm --filter api test
→ Test Files 1 failed | 46 passed (47)
→ Tests 1 failed | 232 passed (233)
→ FAIL tests/tokens.test.ts:268 tampered MFA token signature returns null
   Expected null, Received "owner-xyz"

pnpm --filter api exec vitest run tests/auth-contracts.test.ts tests/auth-routes.test.ts
→ 7 passed (previously failing suites now PASS)

pnpm --filter dashboard run test -- --run → 5 passed
pnpm --filter @stockix/pms run test -- --run → 51 passed
cd services/stockix-finance/packages/server && pnpm test → 38 passed
cd services/posnew/apps/pos-backend && npm run test:ci → 5 passed, ~89s, exit 0

pnpm --filter dashboard build → exit 0
Bundle apps/dashboard/.next/static → 3153KB (< 10MB) ✅
```

| Suite | Before | Now | Stable? |
|-------|--------|-----|---------|
| API | 8 failed | **1 failed** | ❌ (tamper test) |
| Dashboard | 5 pass | **5 pass** | ✅ |
| PMS | 51 pass | **51 pass** | ✅ |
| Finance | 38 pass | **38 pass** | ✅ |
| POS | hanging | **completes < 2 min** | ✅ |

*Note: Five consecutive full API test runs were not executed in this pass (time budget); CI runs a single full suite.*

### Block 4 — Security

```
pnpm audit --prod
→ 3 vulnerabilities found, Severity: 3 moderate
   Path: services/posnew/apps/pos-backend > @node-escpos/core > get-pixels > request@2.88.2

npm audit --prod in pos-backend → ENOLOCK (no package-lock; monorepo uses pnpm at root)

git log --oneline -- .env → commits exist (e.g. 09a7152d chore: remove deprecated environment...)
git log --oneline -- infra/prod/.env → (no separate history lines in first 5)

docs/SECRET_ROTATION_RUNBOOK.md → FILE NOT FOUND
infra/prod/OPERATIONS.md → SECRETS ROTATED: _pending_

grep JadFinance2026|provision-jad-orgs in *.ts,*.mjs → only comment in provision-jad-orgs.mjs (no hardcoded secret)
grep origin '*' in api/pms/finance → 0 wildcard CORS
apps/api/src/routes/webhooks/resend.ts → 401 when secret missing in production ✅

.github/workflows/secret-scan.yml → gitleaks ✅
.github/workflows/deploy.yml → no audit|trivy|snyk|codeql in quality-gate ❌
```

### Block 5 — Environment

```
pnpm env:audit
→ PROD BLOCKERS: CF_DNS_API_TOKEN, CHATWOOT_API_ACCESS_TOKEN (post-boot)
→ PRODUCTION COMPOSE READINESS: READY except manual TLS + Chatwoot token

infra/prod/.env manual scan (lengths only, no values printed):
  SET: DATABASE_URL, SESSION_SECRET, PLATFORM_API_SECRET, WORKER_SECRET,
       AUTH_TOKEN_SECRET, LICENSE_SIGNING_SECRET, CONTROL_PLANE_REDIS_URL, DB_POOL_MAX, ...
  EMPTY: CF_DNS_API_TOKEN, CHATWOOT_API_ACCESS_TOKEN
  MISSING: SENTRY_DSN, RESEND_WEBHOOK_SECRET, BACKUP_B2_BUCKET, BACKUP_B2_KEY_ID,
           BACKUP_B2_APP_KEY, BACKUP_B2_ENDPOINT

Dangerous defaults (dev-worker-secret, changeme, etc.) → not present in prod .env ✅
```

### Block 6 — Docker / Infrastructure

```
docker compose -f infra/prod/docker-compose.yml config → exit 0

Python healthcheck audit:
  infra/prod/docker-compose.yml → 12/12 OK (db-backup exempt)
  infra/tenant-stack → FAIL: nginx, database_migration missing healthcheck
  infra/pos-tenant-stack → FAIL: pos-platform-worker, pos-bigcapital-worker,
                             pos-mongo-init, pos-redis missing healthcheck
  infra/pms-tenant-stack → 2/2 OK
  Summary: 22 pass, 6 fail

Chatwoot services: healthchecks present; mem_limit/cpus absent on chatwoot, chatwoot-postgres, chatwoot-redis

infra/prod/backup/backup.sh → uses BACKUP_B2_* only; no BACKUP_S3_* ✅
```

### Block 7 — CI/CD

| Required in CI | In `deploy.yml` quality-gate? |
|----------------|------------------------------|
| `tsc --noEmit` | ✅ (api, worker, dashboard, packages, pms) |
| `pnpm --filter api test` | ✅ |
| dashboard test | ✅ |
| `@stockix/pms test` | ✅ |
| pos-backend | ✅ (`npm run test:ci`) |
| `@stockix/server test` | ✅ |
| `lint:boundaries` | ✅ |
| `architecture:validate` | ✅ |
| `check:tenant-scope` | ✅ |
| `audit` | ❌ |
| `gitleaks` | ❌ (separate `secret-scan.yml` only) |
| `db:migrate` | ✅ (deploy job on server) |
| `verify-schema` | ✅ (deploy job) |
| `/ready` | ✅ (post-deploy curl) |
| `rollback`/`trap` | ✅ (SSH deploy script) |

`deploy-staging.yml` → **MISSING**  
Deploy triggers: `push` to `main` + `workflow_dispatch`; deploy job `if` main only ✅

### Block 8 — Database

```
packages/db/drizzle/*.sql count → 53
_journal.json → valid JSON ✅
Duplicate numeric prefixes → none found ✅
verify-schema → in deploy.yml post-migrate ✅
DB_POOL_MAX → SET in infra/prod/.env ✅
```

*`pnpm db:migrate` not run locally (requires live Postgres).*

### Block 9 — Performance (failurarch H-4, H-5, M-1–M-3)

| Issue | Location | Status |
|-------|----------|--------|
| H-4 N+1 deprovision | `apps/api/src/routes/tenants.ts` ~851–856: `for (const org of childOrgs)` + per-org `tenants` select | ❌ OPEN |
| H-5 N+1 reconciler | `apps/api/src/provisioning/stuck-reconciler.ts` ~56–73: per-row `latestJob` query | ❌ OPEN |
| M-1 setInterval cleanup | `readiness-reconciler.ts`, `stuck-reconciler.ts` | ❌ OPEN |
| M-3 unbounded org list | `GET /tenants/:tenantId/organizations` — no `.limit()` on query (~1743–1747) | ❌ OPEN |

### Block 10 — Dashboard

```
next/router imports → 0
error.tsx → all 14 files start with "use client" (double-quoted) ✅
pnpm build → exit 0
```

### Block 11 — Operational readiness

| Item | Status |
|------|--------|
| B2 backup script | ✅ `backup.sh` uses B2 vars |
| Staging compose | ❌ missing |
| FAILOVER_RUNBOOK.md | ❌ missing |
| Sentry API | ✅ code in `create-control-plane-app.ts` |
| Sentry dashboard | ✅ `sentry.*.config.ts` present |
| Sentry DSN in prod env | ❌ missing |
| OPERATIONS.md sections | ✅ rotation, backup, deploy, migration, rollback, Redis, B2 |
| CODEOWNERS | ✅ present |
| BRANCH_PROTECTION_SETUP.md | ✅ present |

### Block 12 — Worker / provisioning

| Check | Status |
|-------|--------|
| Worker health HTTP :9090 | ✅ `worker.ts` + compose healthcheck |
| `RUN_BULLMQ_CONSUMERS` gate | ✅ `false` on `api`, `true` on `api-bullmq` |
| `claim_token` migration | ✅ `0049_tenant_lifecycle_jobs_claim_token.sql` |
| Stale lease > job timeout | ✅ `WORKER_STALE_LEASE_THRESHOLD_MS` default 3_000_000 > 2_700_000 job timeout |

### Block 13 — Multi-tenancy

```
Tenant scope → 19/19 PASS
licenseActivateRateLimitMiddleware → registered in create-control-plane-app.ts ✅
Public routes → /ready, /health, /public/* via route modules ✅
```

---

## WHAT WAS FIXED (Confirmed with Evidence)

| Issue | Fix | Verification |
|-------|-----|--------------|
| H-2: 12 TS errors in API god file | Refactored to `create-control-plane-app.ts` + `routes/*`; thin `index.ts` | `pnpm check-types` exit 0 |
| H-1: `process.env` in API index | Removed; uses `@repo/config` | `lint:boundaries` PASS; no `process.env` in `index.ts` |
| H-3: Most API test failures | Auth suites stabilized | `auth-contracts` + `auth-routes` 7/7 PASS; API 232/233 |
| H-7: socket-proxy healthcheck | Added HC + mem/cpu | Python audit PASS for prod stack |
| M-5: control-plane-redis limits | mem_limit + cpus | compose lines 202–204 |
| API monolith (partial) | Domain routes extracted | `index.ts` ~67 lines vs ~5600 |
| Resend webhook fail-closed | `resend.ts` returns 401 if secret missing in prod | Code review + route exists |
| BullMQ consumer split | `RUN_BULLMQ_CONSUMERS` on api vs api-bullmq | compose verified |
| Worker health endpoint | Port 9090 | compose + `worker.ts` |
| Claim token / stale lease | Migration 0049 + internal routes | grep + schema |
| B2 backup migration | `backup.sh` B2-only | grep BACKUP_B2 |
| CI test expansion | Dashboard, PMS, Finance, POS in `deploy.yml` | workflow grep |
| POS `@repo/db` boundary | Removed from posnew | grep 0 |
| Tenant scope | 19 routes | audit script |
| Dashboard build | Next.js production build | exit 0, 3153KB static |

---

## WHAT IS STILL OPEN (Remaining Gaps)

| # | Issue | Severity | File / Area | Manual Action? |
|---|-------|----------|-------------|----------------|
| 1 | MFA token tamper test fails — `verifyMfaToken` accepts modified signature | **Critical** | `apps/api/tests/tokens.test.ts:268` | No — code fix |
| 2 | `CF_DNS_API_TOKEN` empty — TLS ACME blocked | **Critical** | `infra/prod/.env` | Yes — Cloudflare |
| 3 | Secrets not rotated after `.env` git history | **Critical** | `OPERATIONS.md`, server | Yes — ops |
| 4 | `BACKUP_B2_*` not set — deploy job would fail `BACKUP_B2_BUCKET` check | **High** | `infra/prod/.env` | Yes — Backblaze |
| 5 | 3 moderate CVEs (`request` chain in POS) | **High** | `services/posnew/apps/pos-backend` | No — dependency swap |
| 6 | Worker imports API internals (H-6) | **High** | `infra/worker-service/src/*` | No — extract package |
| 7 | N+1 deprovision loop (H-4) | **High** | `routes/tenants.ts` | No |
| 8 | N+1 stuck reconciler (H-5) | **High** | `stuck-reconciler.ts` | No |
| 9 | `RESEND_WEBHOOK_SECRET` / `SENTRY_DSN` missing | **High** | `infra/prod/.env` | Yes |
| 10 | `CHATWOOT_API_ACCESS_TOKEN` empty | **High** | `infra/prod/.env` | Yes — post-boot |
| 11 | No `pnpm audit` / image scan in CI (H-10) | **High** | `.github/workflows/deploy.yml` | No |
| 12 | POS worker/redis healthchecks (H-8) | **High** | `infra/pos-tenant-stack/docker-compose.yml` | No |
| 13 | Chatwoot resource limits (M-6) | **Medium** | `infra/prod/docker-compose.yml` | No |
| 14 | `setInterval` without shutdown (M-1, M-2) | **Medium** | reconciler files | No |
| 15 | Unbounded org list (M-3) | **Medium** | `routes/tenants.ts` | No |
| 16 | Branch protection not verified on GitHub | **Medium** | GitHub Settings | Yes |
| 17 | No staging environment / workflow | **Medium** | `infra/staging` | Yes — infra |
| 18 | `docs/SECRET_ROTATION_RUNBOOK.md` missing | **Medium** | `docs/` | No — restore doc |
| 19 | Tenant-stack HC gaps (nginx, migration) | **Low** | `infra/tenant-stack` | No |

---

## MANUAL OPS ACTIONS STILL REQUIRED

1. **Rotate all secrets** per runbook intent (file missing — use `OPERATIONS.md` § Secret rotation) and set `SECRETS ROTATED: YYYY-MM-DD` in `infra/prod/OPERATIONS.md` header. **Who:** Ops lead. **Urgency:** Before traffic. **If skipped:** compromised credentials from git history remain valid.

2. **Set `CF_DNS_API_TOKEN`** in production `infra/prod/.env`. **Who:** Ops. **Urgency:** Before TLS renewal/deploy. **If skipped:** Traefik ACME DNS challenge fails; HTTPS breaks.

3. **Configure Backblaze B2** (`BACKUP_B2_BUCKET`, `BACKUP_B2_KEY_ID`, `BACKUP_B2_APP_KEY`, `BACKUP_B2_ENDPOINT`). **Who:** Ops. **Urgency:** Before deploy (CI deploy script exits if bucket empty). **If skipped:** No off-site backups.

4. **Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`**. **Who:** Ops. **Urgency:** Before launch. **If skipped:** Production errors invisible centrally.

5. **Set `RESEND_WEBHOOK_SECRET`** after Resend endpoint creation. **Who:** Ops. **Urgency:** Before relying on delivery status. **If skipped:** Webhooks 401 (correct) but `email_logs` never update.

6. **Set `CHATWOOT_API_ACCESS_TOKEN`** after Chatwoot boots. **Who:** Ops. **Urgency:** Before `chat` module provisioning. **If skipped:** Tenant chat automation blocked.

7. **Enable GitHub branch protection** per `docs/BRANCH_PROTECTION_SETUP.md` and record dates in `PRODUCTION_CHECKLIST.md`. **Who:** Repo admin. **Urgency:** Before merge to main. **If skipped:** Direct pushes can bypass CI.

8. **Verify protection** with empty commit push test (must be rejected). **Who:** Repo admin.

---

## PRODUCTION DEPLOY COMMAND SEQUENCE

From `infra/prod/OPERATIONS.md` and `.github/workflows/deploy.yml` (verified current):

```bash
# On production host
cd /opt/stockix/stockixnew   # or /opt/stockix/app
git fetch --prune && git checkout main && git pull --ff-only origin main

set -a && source infra/prod/.env && set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-54330}/${POSTGRES_DB:-stockix_platform}"

corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm infra:worker:build
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts

# Deploy requires BACKUP_B2_BUCKET set
cd infra/prod
docker compose --env-file .env up -d --build --wait

curl --fail --silent --retry 5 "${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN}/ready"

# From repo root after deploy
pnpm env:sync-prod --confirm-server
bash scripts/prod-scale-smoke.sh
```

**Pre-deploy (operator):** `pnpm docker:prebuild`, `pnpm docker:check`, complete `docs/PRODUCTION_CHECKLIST.md`.

---

## POST-DEPLOY VERIFICATION CHECKLIST

- [ ] `curl https://{API_DOMAIN}/ready` → 200, `ready: true`, `database` + `redis` ok
- [ ] Dashboard login; tenant list loads
- [ ] `docker compose -f infra/prod/docker-compose.yml ps` → api ×2, api-bullmq ×1, infra-worker healthy
- [ ] Sentry project shows no startup flood (requires DSN configured)
- [ ] Test notification / owner invite email delivered
- [ ] `docker compose logs db-backup --tail=20` → `[backup] Backup complete.` (requires B2 vars)
- [ ] Provision staging tenant → job completes; Finance/POS URLs reachable
- [ ] `pnpm --filter api test` equivalent on CI green including `tokens.test.ts`

---

## KNOWN ACCEPTED RISKS (v1)

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Single EC2 SPOF | Total outage | Document failover; multi-AZ roadmap | Ops |
| Residual API/worker coupling | Deploy lockstep | Extract `packages/provisioning-shared` | Engineering |
| 3 moderate POS CVEs | SSRF/DoS in print path | Remove `request` chain; override or replace escpos | Engineering |
| No staging in repo | Manual smoke only | PR quality gate + provision smoke scripts | Engineering |
| PMS shared DB (no RLS) | App-layer isolation | `audit-tenant-filters.mjs` in CI | Engineering |
| Unbounded org list | Memory on large tenants | Pagination follow-up | Engineering |

---

## NEXT ENGINEERING PRIORITIES (Post-Launch)

| Priority | Task | Effort | When |
|----------|------|--------|------|
| 1 | Fix `verifyMfaToken` signature validation (tamper test) | 0.5–1 d | **Before launch** |
| 2 | Populate prod env blockers + secret rotation | 1–2 d | **Before launch** |
| 3 | Remove POS `request` CVE chain | 1–2 d | Week 1 |
| 4 | Decouple worker from `apps/api/src` | 3–5 d | Month 1 |
| 5 | Batch deprovision + reconciler queries | 2–3 d | Month 1 |
| 6 | Add `pnpm audit --audit-level=high` to CI | 0.5 d | Month 1 |
| 7 | POS worker healthchecks + Chatwoot limits | 1 d | Month 1 |
| 8 | Staging stack + `deploy-staging.yml` | 1 week | Month 1 |
| 9 | OpenTelemetry tracing | 2–3 weeks | Month 2–3 |
| 10 | Restore `SECRET_ROTATION_RUNBOOK.md` | 0.5 d | Immediate |

---

## SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | ☐ |
| CTO | | | ☐ |

**Final verdict:**

> **NOT CLEARED FOR PRODUCTION — 18 blocking deploy gates remain ❌**
>
> Primary blockers: (1) MFA token tamper test failure, (2) empty/missing production env vars (TLS, backup, Sentry, webhooks), (3) secrets rotation not completed, (4) moderate CVEs unresolved, (5) worker–API coupling, (6) performance/cleanup debt, (7) incomplete POS/Chatwoot infra hardening, (8) no CI dependency audit, (9) branch protection unverified, (10) no staging environment.

---

*This document supersedes prior audit conclusions where they conflict with live verification on 2026-05-27.*

*Regenerate before every major release:*

```bash
pnpm lint:boundaries && pnpm architecture:validate && pnpm check-types && pnpm --filter api test && pnpm env:audit && pnpm audit --prod
```
