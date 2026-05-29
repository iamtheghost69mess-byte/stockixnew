# FAILURE ARCHITECTURE AUDIT — STOCKIX

**Audit date:** 2026-05-27  
**Scope:** monorepo (`apps/*`, `packages/*`, `services/*`, `infra/*`, CI workflows)  
**Total issues found:** **31** (Critical: 2, High: 10, Medium: 12, Low: 7)

---

## SECTION 2 — HIGH SEVERITY ISSUES (Fix Within 1 Week)

### H-1 — API runtime has boundary violation and fails architecture gates
- **Severity:** High
- **Evidence:** `apps/api/src/index.ts` line `348`, line `357`
- **Cause:** direct `process.env` usage in runtime layer violates enforced architecture policy.
- **Commands:**
  - `pnpm lint:boundaries` → FAIL (`apps/api/src/index.ts: direct process.env is forbidden`)
  - `pnpm architecture:validate` → FAIL (Phase 4)
  - `rg "process\.env" apps/api/src/**/*.ts`
- **Fix (specific):**
  1. Replace direct reads in `apps/api/src/index.ts` lines `348` and `357` with `apiConfig` getters.
  2. Move remaining direct reads to `@repo/config`.
  3. Re-run `pnpm lint:boundaries && pnpm architecture:validate`.

### H-2 — TypeScript build is broken in API
- **Severity:** High
- **Evidence:** `apps/api/src/index.ts` lines `149`, `154`, `185`, `270`, `290`, `303`, `2611`, `2614`, `2848`, `2851`
- **Cause:** duplicate `db` identifier and type misuse create cascading compile failures.
- **Command:** `pnpm check-types`
- **Fix (specific):**
  1. Rename one conflicting `db` symbol in `apps/api/src/index.ts`.
  2. Replace `client: db` type positions with `client: DbClient`.
  3. Add explicit type for callback param at line `303` (`(r: unknown)` or concrete type).
  4. Re-run `pnpm check-types`.

### H-3 — API test suite unstable and failing
- **Severity:** High
- **Evidence:** `apps/api/tests/*` (23 failed, then 8 failed on retry inside same run)
- **Cause:** timeouts in `beforeEach` and long-running tests, plus auth token verification regression.
- **Command:** `pnpm --filter api test`
- **Fix (specific):**
  1. Stabilize failing hooks in `tests/auth-contracts.test.ts` line `38` and `tests/auth-routes.test.ts` line `70`.
  2. Fix MFA token tamper verification in `tests/tokens.test.ts` line `268`.
  3. Reduce test runtime by mocking slow calls in `tests/license-*.test.ts`.

### H-4 — Tenant deprovision loop has N+1 query pattern
- **Severity:** High
- **Evidence:** `apps/api/src/index.ts` lines `2075-2080`
- **Cause:** for each org, code executes an extra tenant lookup query.
- **Command:** `rg "for \(const .* of .*\)" apps/api/src/index.ts` + file inspection
- **Fix (specific):**
  1. Batch fetch child tenant IDs with one `IN (...)` query before loop.
  2. Build `Map<slug, tenant>` and use map lookup inside loop.

### H-5 — Stuck reconciler also performs N+1 reads
- **Severity:** High
- **Evidence:** `apps/api/src/provisioning/stuck-reconciler.ts` lines `56-73`
- **Cause:** for each stuck row, additional query for latest job.
- **Command:** `ReadFile apps/api/src/provisioning/stuck-reconciler.ts`
- **Fix (specific):**
  1. Replace per-row query with join/subquery selecting latest job per tenant.
  2. Keep current cap (`.limit(50)`) and log batch processing duration.

### H-6 — Worker imports API internals directly (coupling violation)
- **Severity:** High
- **Evidence:**
  - `infra/worker-service/src/worker.ts` line `38`
  - `infra/worker-service/src/provision-runtime.ts` lines `42-43`
  - `infra/worker-service/src/org-provision-runtime.ts` line `9`
- **Cause:** worker depends on app-layer implementation files.
- **Command:** `rg "from ['\"].*apps/api/src" infra/worker-service/src/**/*.ts`
- **Fix (specific):**
  1. Move shared logic into `packages/shared` or new `packages/provisioning`.
  2. Replace relative `../../../apps/api/src/*` imports with package imports.

### H-7 — Production compose omits healthcheck for critical socket proxy
- **Severity:** High
- **Evidence:** `infra/prod/docker-compose.yml` service `socket-proxy` (lines `79-105`) has no healthcheck.
- **Command:** `ReadFile infra/prod/docker-compose.yml`
- **Fix (specific):**
  1. Add `healthcheck` with TCP probe on Docker proxy endpoint.
  2. Add dependency conditions for `infra-worker` using `service_healthy`.

### H-8 — POS tenant workers have no healthchecks
- **Severity:** High
- **Evidence:** `infra/pos-tenant-stack/docker-compose.yml` services:
  - `pos-platform-worker` lines `43-68`
  - `pos-bigcapital-worker` lines `69-94`
  - `pos-redis` lines `153-161`
- **Command:** `ReadFile infra/pos-tenant-stack/docker-compose.yml`
- **Fix (specific):**
  1. Add process healthcheck for worker entrypoints.
  2. Add `redis-cli ping` healthcheck for `pos-redis`.

### H-9 — Security vulnerabilities in dependency tree remain unresolved
- **Severity:** High
- **Evidence:** `services/posnew/apps/pos-backend` transitive `request@2.88.2` path.
- **Command:** `pnpm audit --prod`
- **Findings:** 3 moderate CVEs (SSRF in `request`, UUID bounds check, `qs` DoS)
- **Fix (specific):**
  1. Replace `@node-escpos/core` path that depends on `request`.
  2. Remove vulnerable chain or fork/patch dependency.
  3. Re-run `pnpm audit --prod` until 0 high/moderate.

### H-10 — CI deploy workflow lacks explicit SCA/container scanning gate
- **Severity:** High
- **Evidence:** `.github/workflows/deploy.yml` has no `audit`, `snyk`, `trivy`, `codeql` checks.
- **Command:** `rg "audit|gitleaks|snyk|trivy|codeql" .github/workflows/deploy.yml -i`
- **Fix (specific):**
  1. Add dependency audit step (`pnpm audit --prod --audit-level=high`).
  2. Add image scan after build (`trivy image` for API/dashboard/worker images).

---

## SECTION 3 — MEDIUM SEVERITY ISSUES (Fix Within 1 Month)

| ID | File | Line | Issue | Cause | Specific Fix | Command |
|---|---|---:|---|---|---|---|
| M-1 | `apps/api/src/index.ts` | `4645` | perpetual interval without lifecycle shutdown | no cleanup on process termination path | store interval handle + clear on SIGTERM/SIGINT | `rg "setInterval\(|setTimeout\(" apps/**/*.ts` |
| M-2 | `apps/api/src/provisioning/stuck-reconciler.ts` | `127` | perpetual interval tick | background poller has no backpressure guard | add in-flight lock and clear interval on shutdown | `ReadFile ...stuck-reconciler.ts` |
| M-3 | `apps/api/src/index.ts` | `2967-2971` | unbounded org list read | no pagination cap | add `limit` + cursor pagination to `/tenants/:tenantId/organizations` | `ReadFile apps/api/src/index.ts` |
| M-4 | `infra/prod/docker-compose.yml` | `449-480` | `db-backup` has no healthcheck | backup daemon failure may be silent | add periodic `pg_dump --version` + S3 auth probe healthcheck | `ReadFile infra/prod/docker-compose.yml` |
| M-5 | `infra/prod/docker-compose.yml` | `179-192` | `control-plane-redis` no mem/cpu limits | noisy-neighbor risk under load | add `mem_limit` + `cpus` matching expected queue throughput | `ReadFile infra/prod/docker-compose.yml` |
| M-6 | `infra/prod/docker-compose.yml` | `372-447` | Chatwoot services lack resource limits | host memory pressure risk | add limits for `chatwoot`, `chatwoot-postgres`, `chatwoot-redis` | `ReadFile infra/prod/docker-compose.yml` |
| M-7 | `infra/tenant-stack/docker-compose.yml` | `141-189` | migration job has no healthcheck | startup migration failures discovered late | add one-shot completion probe / explicit exit code monitoring | `ReadFile infra/tenant-stack/docker-compose.yml` |
| M-8 | `infra/pos-tenant-stack/docker-compose.yml` | `133-152` | `pos-mongo-init` no healthcheck | replica-init failures hidden | add readiness check on replset status | `ReadFile infra/pos-tenant-stack/docker-compose.yml` |
| M-9 | `packages/config/src/index.ts` | `122-136` | strict prod env requirements but gaps remain | required vars not uniformly set in all envs | enforce `pnpm env:audit` in CI pre-deploy | `pnpm env:audit` |
| M-10 | `apps/dashboard` | package-level | minimal test coverage (1 file) | missing tests for large UI flows | add unit tests for tenant creation + role matrix pages | `pnpm --filter dashboard test` |
| M-11 | `apps/api/src/index.ts` | broad | god file complexity | >5k LOC monolith route registration | split by bounded contexts (`routes/tenants`, `routes/licenses`, etc.) | `pnpm check-types` and file inspection |
| M-12 | `.github/workflows/deploy.yml` | `128+` | rollback uses hard reset on server | rollback safety but risks destructive drift | move to immutable artifact deploy + versioned rollback | `ReadFile .github/workflows/deploy.yml` |

---

## SECTION 4 — LOW SEVERITY / TECHNICAL DEBT

| File | Issue | Fix |
|---|---|---|
| `infra/pos-tenant-stack/Dockerfile.pos-frontend-stub` | Busybox placeholder image can be accidentally used in prod path | enforce CI guard that blocks `--stub-frontend` in release pipelines |
| `apps/api/src/lib/require-env.ts` | duplicates env-read concern with `@repo/config` | migrate to centralized config helper |
| `apps/dashboard/components/*` | large component files increase merge conflict risk | split by hooks/view-model + presentational components |
| `docs/PRODUCTION_CHECKLISTNEW.md` | duplicate checklist naming drift (`PRODUCTION_CHECKLISTNEW`) | consolidate to canonical checklist path |
| `services/pmsfull/*` | legacy tree present in repo | mark clearly archived and exclude from tooling scans |
| `infra/prod/docker-compose.yml` | secrets can be printed by `docker compose config` in operator terminals | use masked CI logs and never log fully rendered config in pipelines |
| `.github/workflows/secret-scan.yml` | scans repository history but not runtime env files on host | add server-side secret rotation/validation automation |

---

## SECTION 5 — TYPESCRIPT ERROR INVENTORY

### Complete Error Table
| Package | File | Line | Code | Message |
|---------|------|------:|------|---------|
| apps/api | `apps/api/src/index.ts` | 149 | TS2300 | Duplicate identifier `db` |
| apps/api | `apps/api/src/index.ts` | 154 | TS2300 | Duplicate identifier `db` |
| apps/api | `apps/api/src/index.ts` | 185 | TS2749 | `db` refers to a value, but is being used as a type |
| apps/api | `apps/api/src/index.ts` | 270 | TS2749 | `db` refers to a value, but is being used as a type |
| apps/api | `apps/api/src/index.ts` | 290 | TS2749 | `db` refers to a value, but is being used as a type |
| apps/api | `apps/api/src/index.ts` | 303 | TS7006 | Parameter `r` implicitly has an `any` type |
| apps/api | `apps/api/src/index.ts` | 2611 | TS2448 | Block-scoped variable `db` used before declaration |
| apps/api | `apps/api/src/index.ts` | 2614 | TS7022 | `db` implicitly has type `any` in self-referential initializer |
| apps/api | `apps/api/src/index.ts` | 2614 | TS2448 | Block-scoped variable `db` used before declaration |
| apps/api | `apps/api/src/index.ts` | 2848 | TS2448 | Block-scoped variable `db` used before declaration |
| apps/api | `apps/api/src/index.ts` | 2851 | TS7022 | `db` implicitly has type `any` in self-referential initializer |
| apps/api | `apps/api/src/index.ts` | 2851 | TS2448 | Block-scoped variable `db` used before declaration |

### Summary
| Package | Error Count | Status |
|---------|----------:|--------|
| apps/api | 12 | ❌ Failing |
| apps/dashboard | 0 | ✅ Passing |
| services/pms | 0 | ✅ Passing |
| packages/auth | 0 | ✅ Passing |
| packages/config | 0 | ✅ Passing |
| packages/db | 0 | ✅ Passing |
| **TOTAL** | **12** | **❌ Not production-ready** |

**Command used:** `pnpm check-types`

---

## SECTION 6 — SECURITY VULNERABILITY INVENTORY

### Dependency Vulnerabilities
| Package | Severity | CVE / Advisory | Introduced Via | Fix |
|---------|----------|-----|----------------|-----|
| `request` | Moderate | GHSA-p8p7-x288-28g6 | `services/posnew/apps/pos-backend > @node-escpos/core > get-pixels > request@2.88.2` | Remove transitive dependency chain; replace package |
| `uuid` | Moderate | GHSA-w5hq-g745-h8pq | `... > request@2.88.2 > uuid@3.4.0` | Eliminate `request` chain |
| `qs` | Moderate | GHSA-q8mj-m7cp-5q26 | `... > request@2.88.2 > qs@6.15.1` | Eliminate `request` chain |

**Command:** `pnpm audit --prod`

### Secret Exposure
| Type | File | Line | Risk |
|------|------|------:|------|
| Resolved secret output | `infra/prod/docker-compose.yml` | `17-76`, `300-343` | Running `docker compose config` interpolates secrets into plaintext output/logs |
| Optional-but-empty secret | `infra/prod/docker-compose.yml` | `49`, `55-56` | webhook/metrics security can be silently disabled in prod if left empty |

**Command:** `docker compose -f infra/prod/docker-compose.yml config`

### Code Vulnerabilities
| Type | File | Line | Attack Vector | Impact |
|------|------|------:|---------------|--------|
| Token signature validation regression | `apps/api/tests/tokens.test.ts` | 268 | tampered token still validates in current behavior | MFA/session integrity risk |
| Env bypass in runtime layer | `apps/api/src/index.ts` | 348, 357 | direct env reads bypass centralized validation paths | startup security posture drift |
| Docker API write surface | `infra/prod/docker-compose.yml` | 90 | `socket-proxy` keeps `POST=1` | compromised worker can mutate host containers |

---

## SECTION 7 — TEST COVERAGE GAPS

### Files With No Tests
| File | Complexity | Risk if Untested |
|------|-----------|------------------|
| `apps/api/src/index.ts` | Very high (>5k LOC) | Route regressions and auth bypasses undetected |
| `infra/worker-service/src/provision-runtime.ts` | High | Provisioning errors can orphan tenant environments |
| `infra/worker-service/src/worker.ts` | High | Job retries/failure handling regressions |
| `apps/dashboard/components/tenant-users-panel.tsx` | High | RBAC and invitation UI defects |
| `apps/dashboard/components/tenant-create-wizard.tsx` | High | tenant bootstrapping data quality regressions |

### Test Suite Results
| Suite | Passed | Failed | Stable? |
|-------|-------:|-------:|---------|
| API Vitest (`pnpm --filter api test`) | 225 | 8 | ❌ Unstable (timeouts + token assertion failure) |
| Dashboard Vitest (`pnpm --filter dashboard test`) | 5 | 0 | ✅ Stable |
| PMS Vitest (`pnpm --filter @stockix/pms test`) | 51 | 0 | ✅ Stable |
| POS backend (`pnpm --filter pos-backend test`) | 141 | 0 | ✅ Stable |

---

## SECTION 8 — DOCKER & INFRA GAPS

### Healthcheck Missing
| Compose File | Service | Impact |
|-------------|---------|--------|
| `infra/prod/docker-compose.yml` | `socket-proxy` | worker may start against unavailable Docker API |
| `infra/prod/docker-compose.yml` | `db-backup` | backup failures can go undetected |
| `infra/pos-tenant-stack/docker-compose.yml` | `pos-platform-worker` | background sync can silently die |
| `infra/pos-tenant-stack/docker-compose.yml` | `pos-bigcapital-worker` | accounting sync queue can stall |
| `infra/pos-tenant-stack/docker-compose.yml` | `pos-mongo-init` | replset init failures hidden |
| `infra/pos-tenant-stack/docker-compose.yml` | `pos-redis` | cache/message broker failures detected late |
| `infra/tenant-stack/docker-compose.yml` | `database_migration` | migration failure visibility delayed |

### Resource Limits Missing
| Compose File | Service | Risk |
|-------------|---------|------|
| `infra/prod/docker-compose.yml` | `socket-proxy` | no memory cap on host-critical utility |
| `infra/prod/docker-compose.yml` | `control-plane-redis` | queue surge can pressure host memory |
| `infra/prod/docker-compose.yml` | `chatwoot` | Rails process can grow unbounded |
| `infra/prod/docker-compose.yml` | `chatwoot-postgres` | DB memory contention on shared host |
| `infra/prod/docker-compose.yml` | `chatwoot-redis` | unbounded cache memory usage |

### Dockerfile Issues
| File | Issue | Severity |
|------|-------|----------|
| `infra/pos-tenant-stack/Dockerfile.pos-frontend-stub` | placeholder frontend image can be shipped accidentally | Medium |
| `infra/worker-service/Dockerfile` | (observed indirectly via compose) worker has broad host access requirements | High |

---

## SECTION 9 — SERVICE COUPLING VIOLATIONS

| Violator | Imports From | Should Use Instead | Impact |
|---------|--------------|-------------------|--------|
| `infra/worker-service/src/worker.ts` | `../../../apps/api/src/license-expire-followup.js` | package-level shared module | worker/api release lockstep |
| `infra/worker-service/src/provision-runtime.ts` | `../../../apps/api/src/license-utils.js` | shared package (`packages/shared`) | hidden cross-service contract |
| `infra/worker-service/src/provision-runtime.ts` | `../../../apps/api/src/mail/send.js` | dedicated notification package | mail failures couple worker to API internals |
| `infra/worker-service/src/org-provision-runtime.ts` | `../../../apps/api/src/finance-license.client.js` | stable infra client package | fragile import path, hard refactors |
| `infra/worker-service/src/add-accounting-module-runtime.ts` | `../../../apps/api/src/license-utils.js` | shared domain package | duplicated lifecycle knowledge |

---

## SECTION 10 — PERFORMANCE & SCALABILITY RISKS

### Memory Leak Risks
| File | Line | Issue | Severity |
|------|------:|-------|----------|
| `apps/api/src/index.ts` | 4645 | untracked `setInterval` lifetime without shutdown cleanup | Medium |
| `apps/api/src/provisioning/stuck-reconciler.ts` | 127 | recurring interval with no stop signal | Medium |

### N+1 Query Risks
| File | Line | Query Pattern | Records at Risk |
|------|------:|--------------|-----------------|
| `apps/api/src/index.ts` | 2075-2080 | loop over `childOrgs` + per-item tenant select | proportional to org count per tenant |
| `apps/api/src/provisioning/stuck-reconciler.ts` | 56-73 | loop over `stuckRows` + per-item latest-job select | up to 50 per reconciler run |

### Unbounded Operations
| File | Line | Operation | Max Records |
|------|------:|-----------|-------------|
| `apps/api/src/index.ts` | 2967-2971 | fetch all tenant organizations without limit | unbounded |
| `apps/api/src/index.ts` | multiple list endpoints | repeated `.select()` list responses without explicit cap | unbounded by API contract |

---

## SECTION 11 — ENVIRONMENT & CONFIGURATION GAPS

### Missing Production Variables
| Variable | Required | Current State | Impact |
|---------|---------|--------------|--------|
| `CF_DNS_API_TOKEN` | TLS cert provisioning | EMPTY (`pnpm env:audit`) | automated TLS issuance blocked |
| `CHATWOOT_API_ACCESS_TOKEN` | Chatwoot admin automation | EMPTY (`pnpm env:audit`) | tenant chat provisioning blocked |
| `RESEND_WEBHOOK_SECRET` | recommended in production | EMPTY in compose-resolved output | webhook authenticity checks disabled |
| `SENTRY_DSN` | recommended in production | EMPTY in compose-resolved output | production errors not centrally tracked |

### Dangerous Defaults
| Variable | Default Value | Risk |
|---------|--------------|------|
| `SIGNUP_DISABLED` | `true` | if flipped incorrectly, unauthorized self-signup paths may open |
| `TENANT_INTERNAL_HOST` | `127.0.0.1` fallback | can break tenant routing in containerized infra |
| `WORKER_SECRET` | `dev-worker-secret` fallback path | accidental weak secret in misconfigured environments |

---

## SECTION 12 — CI/CD GAPS

### Missing Quality Checks
| Check | Should Run In | Currently In CI? | Risk |
|-------|--------------|-----------------|------|
| dependency vulnerability gate (`pnpm audit`) | quality-gate | ❌ | vulnerable dependencies can deploy |
| container image CVE scan (Trivy/Snyk) | quality-gate | ❌ | base image and runtime CVEs missed |
| CodeQL/static security scan | PR + main | ❌ | code-level security issues missed |
| env audit (`pnpm env:audit`) | pre-deploy | ❌ | prod deploy with empty critical vars |
| full compose lint for all tenant stacks | quality-gate | ❌ | per-tenant infra regressions undetected |

---

## SECTION 13 — ARCHITECTURE VIOLATIONS

### Layer Boundary Violations
| File | Imports | Violation Type | Impact |
|------|---------|---------------|--------|
| `apps/api/src/index.ts` | `process.env.*` | runtime env access outside config boundary | policy bypass, startup drift |
| `infra/worker-service/src/provision-runtime.ts` | API app internals | infra→app direct dependency | brittle deploy sequencing |
| `infra/worker-service/src/worker.ts` | API app internals | infra→app direct dependency | hinders independent scaling |

### God Files
| File | Lines | Contains | Split Required? |
|------|------:|---------|----------------|
| `apps/api/src/index.ts` | ~5600 | route registration, auth, provisioning, observability, readiness logic | Yes |
| `apps/api/src/license-http.ts` | ~1800 | license lifecycle + POS sync endpoints | Yes |
| `apps/dashboard/components/tenant-users-panel.tsx` | ~900 | user lifecycle + RBAC panel + state orchestration | Yes |

---

## SECTION 14 — FAILURE MODE ANALYSIS

### What breaks at 100 tenants?
- N+1 loops in tenant deprovision/reconciler slow control-plane API (`apps/api/src/index.ts:2075`, `stuck-reconciler.ts:56`).
- API monolith (`apps/api/src/index.ts`) increases deploy regression probability.
- POS worker services without healthchecks can silently stop processing.

### What breaks at 1,000 tenants?
- Unbounded org list endpoint (`/tenants/:tenantId/organizations`) can become heavy.
- Single control-plane Redis without explicit resource limits risks saturation.
- One infra worker (`infra-worker`) remains major throughput bottleneck for provisioning.

### What breaks if Redis goes down?
- Control-plane queue/rate-limit features degrade; startup requires redis in production (`index.ts:339-345`).
- POS and Chatwoot Redis-dependent components stall without robust fallback.

### What breaks if Postgres fails?
- Control-plane API and dashboard BFF become unavailable (`DATABASE_URL` dependency in compose).
- Worker provisioning state machine cannot persist jobs/deploy events.

### What breaks during a deploy?
- `pnpm check-types` and API tests currently fail, blocking deploy quality gate.
- rollback path in CI uses hard reset on server; non-idempotent side effects may remain.

### What breaks if the worker crashes?
- Tenant lifecycle jobs stall; no second worker replica in current prod compose.
- Dynamic route updates and tenant provisioning are delayed.

### What breaks on a hot summer Friday at 5pm?
- Peak load + unbounded queries + single-host compose + missing healthchecks can create cascading partial outages: API slowdowns, stalled provisioning, and delayed backups without immediate alerting.

---

## SECTION 15 — PRIORITIZED FIX ROADMAP

### Week 1 — Deploy Blockers
| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 1 | Fix TS compile errors (12) | `apps/api/src/index.ts` | 1-2d | unblocks build/deploy |
| 2 | Remove boundary violations (`process.env`) | `apps/api/src/index.ts` | 0.5d | passes architecture gates |
| 3 | Stabilize failing API tests (timeouts + token tamper) | `apps/api/tests/*` | 2-3d | restores CI confidence |
| 4 | Patch/remove vulnerable `request` dependency chain | `services/posnew/apps/pos-backend` | 1-2d | closes known CVEs |

### Week 2–4 — High Priority
| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 1 | Remove worker→API direct imports | `infra/worker-service/src/*` | 3-5d | decouples service lifecycle |
| 2 | Add missing healthchecks in prod and POS stacks | `infra/*/docker-compose.yml` | 1-2d | faster failure detection |
| 3 | Add resource limits for all prod services | `infra/prod/docker-compose.yml` | 1d | host stability under load |
| 4 | Add CI audit + container scan jobs | `.github/workflows/deploy.yml` | 1-2d | prevents insecure deploys |

### Month 2 — Medium Priority
| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 1 | Remove N+1 in deprovision and reconciler | `apps/api/src/index.ts`, `stuck-reconciler.ts` | 2-3d | improves tenant-scale performance |
| 2 | Add pagination caps to list endpoints | `apps/api/src/index.ts` | 2d | protects DB from large scans |
| 3 | Add env audit into CI gate | `.github/workflows/deploy.yml` | 0.5d | blocks misconfigured prod deploys |
| 4 | Increase dashboard high-risk test coverage | `apps/dashboard/*` | 2-4d | reduces UI regression risk |

### Quarter 2 — Architectural
| # | Issue | Approach | Effort | Impact |
|---|-------|---------|--------|--------|
| 1 | Split API god file | domain router extraction + service modules | 3-5 weeks | velocity + maintainability |
| 2 | Worker scalability | multi-worker lease-safe architecture | 2-3 weeks | provisioning throughput |
| 3 | Deployment hardening | artifact-based immutable deploys | 2-4 weeks | safer rollback and reproducibility |
| 4 | Observability maturity | enforce metrics+tracing+alerts baseline | 2-3 weeks | faster incident response |

---

## SECTION 16 — WHAT IS WORKING WELL

- `pnpm --filter dashboard test` passes cleanly (5/5).
- `pnpm --filter @stockix/pms test` passes cleanly (51/51).
- `pnpm --filter pos-backend test` passes (unit + contract suites).
- Production compose syntax validates (`docker compose -f infra/prod/docker-compose.yml config` succeeds).
- Secret scanning workflow exists and is active (`.github/workflows/secret-scan.yml` with gitleaks).
- Env audit tooling is present and useful (`pnpm env:audit`) with explicit blocker output.
- Tenant stack compose files generally include healthchecks and resource limits for core DB/runtime services.

---

## SECTION 17 — PRODUCTION DEPLOY GATE STATUS

| Gate | Status | Evidence |
|------|--------|---------|
| TypeScript 0 errors | ❌ | `pnpm check-types` → 12 TS errors in `apps/api/src/index.ts` |
| All tests passing | ❌ | `pnpm --filter api test` → failed (8 final failures) |
| 0 high/critical CVEs | ❌ | `pnpm audit --prod` → 3 moderate vulnerabilities |
| All env vars set | ❌ | `pnpm env:audit` → `CF_DNS_API_TOKEN`, `CHATWOOT_API_ACCESS_TOKEN` empty |
| All compose valid | ✅ | `docker compose -f infra/prod/docker-compose.yml config` exit 0 |
| Secrets rotated | ❌ | no verifiable ops record from local audit; CI only warns on doc marker |
| Branch protection | ❌ | `gh` CLI unavailable (`gh` command not found), cannot verify repo policy |
| Backup configured | ✅ | `infra/prod/docker-compose.yml` includes `db-backup` service + S3 vars |
| **CLEARED FOR PRODUCTION** | **❌** | Blocking failures in TS, tests, security, env |

---

## SIGN-OFF

| Role | Name | Date | Status |
|------|------|------|--------|
| Engineering Lead |  | 2026-05-27 | ☐ |
| CTO |  | 2026-05-27 | ☐ |

*Regenerate this document after every major change:*  
*`pnpm lint:boundaries && pnpm architecture:validate && pnpm --filter api test`*

---

## COMMAND EXECUTION NOTES (PASS/FAIL explicit)

- `pnpm lint:boundaries` → **FAIL** (1 violation)
- `pnpm architecture:validate` → **FAIL** (Phase 4)
- `pnpm check-types` → **FAIL** (12 errors)
- `pnpm --filter api test` → **FAIL** (8 failures final run)
- `pnpm --filter dashboard test` → **PASS**
- `pnpm --filter @stockix/pms test` → **PASS**
- `pnpm --filter pos-backend test` → **PASS**
- `pnpm audit --prod` → **FAIL** (3 vulnerabilities)
- `docker compose -f infra/prod/docker-compose.yml config` → **PASS**
- `pnpm env:audit` → **PASS with blockers listed**
- `rg "import .* from ['\"]@repo/db['\"]" apps/dashboard/**/*.ts*` → **PASS: 0 results found**
- `gh repo view --json nameWithOwner,defaultBranchRef` → **FAIL** (`gh` not installed on this machine)
