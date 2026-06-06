# rechecker22 — Stockix Provisioning Failure Audit

Full diagnostic output from **PROV2CHECK** (June 2026). This document reports **only** broken, missing, inconsistent, or risky items for **Bigcapital (accounting / `stockix-finance`)** and **POS (Vendorix / `posnew`)** provisioning.

**Architecture note:** Finance uses **shared MySQL** (`stockix-mysql`), not per-tenant PostgreSQL. MongoDB is shared (`stockix-mongo`) with per-tenant database `{slug}_pos`. Redis is shared with key prefix `tenant:{slug}:`.

> **Reconciliation audit (2026-06-07):** Waves 1–3 verified in code; Waves 4–6 repaired in this pass. **36 worker/API unit tests passed.** Combined smoke (`provision-diagnose --slug smoke-rechecker22`) **failed** — `fetch failed` (control-plane API at `http://localhost:4000` not running). Waves 1–6 remain **code-verified only** until full stack smoke succeeds.

---

## How provisioning flows

| Step | Location |
|------|----------|
| API accepts job | `apps/api/src/routes/tenants.ts` → lifecycle job |
| Worker executes | `infra/worker-service/src/worker.ts` → `tenant.provision` |
| Core runtime | `infra/worker-service/src/provision-runtime.ts` → `executeProvisionRuntime` |
| Domain entry | `infra/worker-service/domain/provisioning/tenant-provision-service.ts` |
| Docker | `infra/worker-service/domain/provisioning/adapters/execa-docker-compose-runner.ts` |
| Compose templates | `infra/tenant-stack/docker-compose.yml` (Finance), `infra/pos-tenant-stack/docker-compose.yml` (POS) |
| Per-tenant env | `infra/worker-service/domain/provisioning/tenant-env.ts` |
| Traefik | `infra/worker-service/domain/traefik-config.ts` |

---

## 1. Provisioning entry point

> **Wave 1 (2026-06-07):** Items 1–4 repaired in worker + API. Structured Finance signin (`finance-auth-client.ts`), post-bootstrap signin retry, POS-only retry job failure semantics, and failure-event insert logging. Unit tests: 21 passed (worker provisioning + API provision-failure/retry-partial). Smoke provision pending local stack (`pnpm --filter api provision-diagnose`).

### ✅ Organization build fails with opaque `signin_failed` after successful bootstrap — **repaired (Wave 1, 2026-06-07)**

- **File:** `infra/worker-service/src/provision-runtime.ts` → `executeProvisionRuntime`
- **Was broken:** Bootstrap via `/api/internal/provision-user` succeeds, then org build fails with `signin_failed`.
- **Evidence:** `provision-test-run2.log` — health OK, bootstrap OK, then `Organization build failed: signin_failed`.
- **Impact:** Tenant ends in `failed`; no COA, warehouse activation, or POS wiring.
- **Repair:** Shared `finance-auth-client.ts` with structured signin codes; `fetch-stockix-finance-build-org.ts` uses `signinWithRetry` after bootstrap (`preferRetryAfterBootstrap`); bootstrap payload uses camelCase `firstName`/`lastName`.

### ✅ `signin_failed` masks multiple failure modes — **repaired (Wave 1, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts` → `signin`
- **Was broken:** Single error string for HTTP 401, missing org membership (`No organization found for this user`), and JSON parse failure.
- **Impact:** Operators cannot distinguish password vs membership vs response shape bugs.
- **Repair:** Structured codes (`signin_http_<status>`, `signin_no_organization`, `signin_invalid_credentials`, `signin_parse_failed`, `signin_network_error`, `signin_org_mismatch`) returned in build-org errors; tests assert bare `signin_failed` is never emitted.

### ✅ POS partial failure can return `ok: true` — **repaired (Wave 1, 2026-06-07)**

- **File:** `infra/worker-service/src/provision-runtime.ts` (POS-only / partial retry paths)
- **Was broken:** POS-only retry returned `{ ok: true, posStatus: "failed" }`; worker logged `outcome: "success"`.
- **Impact:** Callers treating `ok: true` as full success leave partial tenants undetected; POS-only retry failures appeared successful.
- **Repair:** POS-only retry failure → `ok: false`; full provision accounting+POS partial remains `ok: true` + `tenantStatus: "partial"`; worker logs `outcome: "partial"` or `"success"` via `resolveProvisionJobOutcome`.

### ✅ Failure event DB writes swallowed — **repaired (Wave 1, 2026-06-07)**

- **File:** `apps/api/src/provisioning/provision-failure.ts` → `appendProvisionFailureEvent`
- **Was broken:** `.catch(() => undefined)` on insert.
- **Impact:** Failed provisions may lack rows in `tenant_provision_events`.
- **Repair:** `logger.error` on insert/update failure for `appendProvisionFailureEvent` and `markLifecycleJobTerminalFailure` (best-effort path preserved; visibility added).

---

## 2. Docker Compose / Docker API

> **Wave 2 (2026-06-07):** Items 1–4 repaired. Finance `PUBLIC_PROXY_PORT` bind, migration `depends_on`, fake HC removed, Mongo rs0 preflight. Unit tests: 20 passed.

> **Wave 3 (2026-06-07):** Items 5–7 repaired. POS `--env-file`, socket-proxy hardening, Traefik via proxy. Unit tests: 26 passed. Combined smoke pending local stack.

### ✅ Finance host port ignores allocated `PUBLIC_PROXY_PORT` — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/tenant-stack/docker-compose.yml` line ~108
- **Was broken:** `ports: "0.0.0.0::3000"` published an **ephemeral** host port while DB/Traefik used allocated `PUBLIC_PROXY_PORT`.
- **Impact:** Traefik and POS `FINANCE_INTERNAL_BASE_URL` targeted wrong port; public `{slug}.{domain}` could 502.
- **Repair:** Bind `"0.0.0.0:${PUBLIC_PROXY_PORT}:3000"`; tenant-env comment updated.

### ✅ Server has no dependency on migration completion — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/tenant-stack/docker-compose.yml` → `server`
- **Was broken:** No `depends_on: database_migration` with success condition.
- **Impact:** Manual `docker compose up server` could start before migrations finished.
- **Repair:** `depends_on: database_migration: condition: service_completed_successfully`; worker app step uses `--no-deps` to avoid double migration on resume.

### ✅ Migration healthcheck is fake — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/tenant-stack/docker-compose.yml` → `database_migration`
- **Was broken:** Healthcheck ran `exit 0` always.
- **Impact:** Failed migrations could appear healthy to operators/tools.
- **Repair:** Removed misleading healthcheck from one-shot migration service; worker still fails on non-zero `compose run` exit.

### ✅ POS stack has no gate on Mongo replica set init — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/pos-tenant-stack/docker-compose.yml` + `infra/worker-service/domain/provisioner.ts`
- **Was broken:** Shared `stockix-mongo-rs-init` not a cross-project compose dependency; only TCP ping before POS.
- **Impact:** POS could start before rs0 PRIMARY; first Mongo writes fail.
- **Repair:** `ensureSharedMongoReplicaSetReady()` runs `stockix-mongo-rs-init` from shared compose during `provisionTenantDatabases()`.

### ✅ POS compose omits `--env-file` — **repaired (Wave 3, 2026-06-07)**

- **File:** `infra/worker-service/src/module-stacks.ts` → `provisionPosStack`
- **Was broken:** Used execa `env` only; Finance path uses `ExecaDockerComposeRunner` with `--env-file`.
- **Impact:** Harder to reproduce/debug; inconsistent with Finance provisioning.
- **Repair:** POS up/down uses `ExecaDockerComposeRunner` with tenant `{slug}/.env` via `resolvePosTenantEnvPath()`; runtime overrides remain in merged `composeEnv`.

### ✅ Docker socket proxy allows POST and BUILD — **repaired (Wave 3, 2026-06-07)**

- **File:** `infra/prod/docker-compose.yml` → `socket-proxy`
- **Was broken:** `BUILD:1` enabled alongside `POST:1`.
- **Impact:** Unnecessary image-build capability via proxy.
- **Repair:** `BUILD:0`, `EVENTS:1` (Traefik watches); `POST:1` retained for worker compose mutations. Documented in `OPERATIONS.md`.

### ✅ Traefik mounts Docker socket directly — **repaired (Wave 3, 2026-06-07)**

- **File:** `infra/prod/docker-compose.yml` → `traefik`
- **Was broken:** `/var/run/docker.sock:ro` on Traefik while worker uses socket-proxy.
- **Impact:** Split security model.
- **Repair:** Traefik Docker provider uses `tcp://socket-proxy:2375`; host socket mount and `group_add` removed; Traefik joins `socket_proxy_network`.

---

## 3. Docker images

> **Wave 3 (2026-06-07):** Item 1 repaired — deploy pipelines run synchronous `pnpm docker:prebuild` + `--verify`; production worker startup hard-fails on missing Finance images.

> **Wave 4 (2026-06-07):** Items 2–3 repaired — POS frontend fail-fast; prod compose image-only (`docker-compose.dev.yml` for local builds).

### ✅ Required Finance images must be pre-built — **repaired (Wave 3, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioning/check-tenant-images.ts`, deploy workflows
- **Was broken:** Provision hard-failed but deploy ran prebuild in background (prod) or ignored failures (staging); worker only warned at startup.
- **Impact:** Fresh VPS could deploy successfully without tenant images; provisions blocked at runtime.
- **Repair:** `deploy.yml` / `deploy-staging.yml` synchronous prebuild + verify; prod `checkRequiredTenantImages()` calls `assertRequiredTenantImages()`; image prune moved before prebuild on prod deploy.

### ✅ Missing POS frontend image is non-fatal — **repaired (Wave 4, 2026-06-07)**

- **File:** `infra/worker-service/src/module-stacks.ts`
- **Was broken:** If `stockix-pos-frontend:local` missing, frontend service skipped with log only.
- **Impact:** Tenant could be “active” with backend-only POS; Traefik frontend route broken.
- **Repair:** POS provision throws when frontend image missing or stub; `pos-frontend` always included in compose up.

### ✅ Build stanzas in prod-shaped compose — **repaired (Wave 4, 2026-06-07)**

- **File:** `infra/tenant-stack/docker-compose.yml`, `infra/tenant-stack/docker-compose.dev.yml`
- **Was broken:** `build:` targets remained while runtime uses `--no-build`.
- **Impact:** Accidental `up` without `--no-build` triggered long VPS builds.
- **Repair:** Prod compose is image-only; dev overrides in `docker-compose.dev.yml`.

---

## 4. Environment variables

> **Wave 4 (2026-06-07):** §4.1–§4.2 repaired (POS JWT/license secrets, Finance `NODE_ENV`).

> **Wave 5 (2026-06-07):** §4.3–§4.4, §4.6–§4.7 repaired (branding passthrough, PERFIX documented, MySQL fail-fast, explicit Resend key).

> **Reconciliation:** §4.5 port mismatch resolved via Wave 2 `PUBLIC_PROXY_PORT` bind.

### ✅ POS missing JWT / platform / license secrets — **repaired (Wave 4, 2026-06-07)**

- **Files:** `infra/pos-tenant-stack/docker-compose.yml`, `infra/worker-service/src/module-stacks.ts`
- **Was broken:** Compose set `AUTH_TOKEN_SECRET` but not `JWT_SECRET`, `PLATFORM_JWT_SECRET`, `LICENSE_SIGNING_SECRET`, `FIELD_ENCRYPTION_KEY`.
- **Impact:** Staff/platform JWT and license enforcement broken or undefined in production.
- **Repair:** `resolvePosJwtEnv()` injects secrets from `@repo/config` + platform env into POS compose.

### ✅ Finance server missing `NODE_ENV=production` — **repaired (Wave 4, 2026-06-07)**

- **File:** `infra/tenant-stack/docker-compose.yml` → `server`
- **Was broken:** `NODE_ENV` not set in container.
- **Impact:** Dev defaults, weaker security/cookie behavior in prod.
- **Repair:** `NODE_ENV=production` in `server.environment`.

### ✅ Branding vars not injected into Finance container — **repaired (Wave 5, 2026-06-07)**

- **File:** `infra/tenant-stack/docker-compose.yml` → `server.environment`
- **Was broken:** `REACT_APP_STOCKIX_*` written to tenant `.env` but not passed in compose environment block.
- **Impact:** Runtime branding fetch may not work unless baked at image build.
- **Repair:** Branding vars passed via `${REACT_APP_STOCKIX_*}` in compose `server.environment`.

### ✅ Duplicate typo env key `TENANT_DB_NAME_PERFIX` — **documented (Wave 5, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioning/tenant-env.ts`
- **Was broken:** Both `TENANT_DB_NAME_PREFIX` and `TENANT_DB_NAME_PERFIX` set (typo duplicate).
- **Impact:** Legacy Finance depends on misspelled key; drift risk.
- **Repair:** PERFIX kept as legacy alias with deprecation comment; compose maps PERFIX → PREFIX value.

### ✅ `FINANCE_INTERNAL_BASE_URL` uses wrong port — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioning/build-finance-internal-url.ts` + compose bind
- **Was broken:** Used allocated port while compose published ephemeral host port.
- **Impact:** POS `bigcapitalSyncWorker` called wrong Finance URL.
- **Repair:** Compose binds `PUBLIC_PROXY_PORT`; internal URL uses same allocation. Runtime smoke pending.

### ✅ Host-run worker MySQL host misconfiguration — **repaired (Wave 5, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioner.ts` → `assertWorkerCanReachSharedMysql`
- **Was broken:** Warn-only when `WORKER_SHARED_MYSQL_HOST` unset; opaque connection errors.
- **Impact:** Local/dev DB provision failed without clear cause.
- **Repair:** TCP preflight before mysql2 connect; production host-run requires `WORKER_SHARED_MYSQL_HOST`.

### ✅ RESEND_API_KEY fallback to MAIL_PASSWORD — **repaired (Wave 5, 2026-06-07)**

- **File:** `infra/worker-service/src/module-stacks.ts` → `resolvePosResendApiKey`
- **Was broken:** `RESEND_API_KEY` fell back to SMTP `MAIL_PASSWORD`.
- **Impact:** POS email jobs failed; misleading config.
- **Repair:** Explicit `RESEND_API_KEY` required when POS module provision runs.

---

## 5. Database provisioning

### ❌ System DB dropped on every migration step

- **File:** `infra/worker-service/domain/provisioner.ts` → `resetSystemDatabaseForMigration`
- **What is broken:** `DROP DATABASE` on system DB before migration compose run.
- **Impact:** Retry/resume destroys partial system state.
- **Fix:** Reset only on explicit clean-slate preflight.

### ❌ Legacy `_finance` MySQL DB created but unused

- **File:** `infra/worker-service/domain/provisioner.ts` → `provisionTenantDatabases`
- **What is broken:** Creates `stockix_{safe}_finance`; Finance uses `stockix_{safe}_{organizationId}` at runtime.
- **Impact:** Orphan databases accumulate.
- **Fix:** Stop creating unused DB or wire Finance to use it.

### ❌ Mongo verification is TCP-only — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioner.ts` → `ensureSharedMongoReplicaSetReady`
- **Was broken:** No rs0 PRIMARY check before provision continued.
- **Impact:** Provision proceeded while replica set still initializing.
- **Repair:** `ensureSharedMongoReplicaSetReady()` runs rs-init and blocks until PRIMARY.

### ❌ PostgreSQL / pgcrypto not applicable

- **What is broken (docs/runbooks):** Checklists referencing per-tenant Postgres and `pgcrypto` do not match production (MySQL shared infra).
- **Fix:** Update ops docs to MySQL GRANT pattern in provisioner.

---

## 6. Traefik routing

> **Wave 6 (2026-06-07):** §6.2–§6.3 repaired (early edge publish, production network preflight).

> **Reconciliation:** §6.1 upstream port mismatch resolved via Wave 2 `PUBLIC_PROXY_PORT` bind.

### ✅ Traefik upstream port mismatch — **repaired (Wave 2, 2026-06-07)**

- **File:** `infra/worker-service/domain/traefik-config.ts` + compose bind
- **Was broken:** Upstream used DB allocation while compose published ephemeral port.
- **Impact:** `{slug}.{ROOT_DOMAIN}` routed to wrong port → 502.
- **Repair:** Compose binds `PUBLIC_PROXY_PORT`; Traefik and worker use same value.

### ✅ Traefik publish late in pipeline — **repaired (Wave 6, 2026-06-07)**

- **File:** `infra/worker-service/src/provision-runtime.ts` → `edge.publish`
- **Was broken:** Traefik YAML written after org build, warehouse, POS defaults, etc.
- **Impact:** Long window where stack is up but subdomain unreachable.
- **Repair:** `edge.publish` runs immediately after tenant health check + port confirm.

### ✅ Auto-create `stockix_public` without Traefik — **repaired (Wave 6, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioning/ensure-tenant-networks.ts`
- **Was broken:** Created missing external networks in local dev without full edge stack.
- **Impact:** Silent partial routing in prod-shaped runs.
- **Repair:** Production preflight fails if `stockix-shared` / `stockix_public` missing; dev still auto-creates.

**POS Traefik:** `{slug}-pos.{domain}` and `{slug}-pos-api.{domain}` via `writePosTraefikConfig` — same host/port allocation issues apply to backend/frontend host ports.

---

## 7. Migration & setup scripts

> **Reconciliation:** §7.1 and §7.3 duplicate Wave 1 signin/bootstrap fixes. §7.2 remains a smoke-verify risk.

### ✅ Post-bootstrap org build blocked by signin — **repaired (Wave 1, 2026-06-07; smoke pending)**

- **Files:** `fetch-stockix-finance-build-org.ts`, `finance-auth-client.ts`
- **Was broken:** Ping OK → bootstrap OK → opaque `signin_failed`.
- **Impact:** Blocked COA, warehouse, POS integration.
- **Repair:** Structured signin codes + post-bootstrap retry. End-to-end smoke not yet run locally.

### ⚠️ Finance signin 401 when org membership missing — **verify on smoke**

- **File:** `services/stockix-finance/packages/server/src/modules/Auth/Auth.controller.ts`
- **Risk:** `UnauthorizedException('No organization found for this user')` when UserTenant resolution fails.
- **Impact:** Surfaces as structured signin code in worker; root cause may remain in Finance.
- **Status:** Worker surfaces `signin_no_organization`; needs live provision smoke to confirm fix.

### ✅ Bootstrap payload uses snake_case field names — **repaired (Wave 1, 2026-06-07)**

- **File:** `fetch-stockix-finance-bootstrap.ts`
- **Was broken:** Sent `first_name` / `last_name`; DTO expects camelCase.
- **Repair:** Sends `firstName` / `lastName` matching `ProvisionUserDto`.

---

## 8. Node.js control plane logic

> **Wave 6 (2026-06-07):** §8.2–§8.3 repaired (stuck threshold, internal API URL).

### ⚠️ Partial POS outcomes not always job failures — **partial by design**

- **Files:** `provision-runtime.ts`, `apps/api` readiness / job status
- **Context:** Full provision with accounting+POS may complete with `tenantStatus: "partial"` by design.
- **Repair (Wave 1):** POS-only retry failures return `ok: false`; worker logs correct outcome via `resolveProvisionJobOutcome`.
- **Remaining:** Dashboard/readiness mapping for full-provision partial states (Wave 7+).

### ✅ Stuck reconciler vs long worker timeout — **repaired (Wave 6, 2026-06-07)**

- **File:** `apps/api/src/provisioning/stuck-reconciler.ts`
- **Was broken:** Stuck threshold ~10 minutes; worker timeout up to 45 minutes.
- **Impact:** False failed status or duplicate retries on slow provisions.
- **Repair:** `STUCK_MS = workerJobExecutionTimeoutMs + 5min` grace.

### ✅ financeOrganizationId save uses localhost from worker — **repaired (Wave 6, 2026-06-07)**

- **File:** `infra/worker-service/src/provision-runtime.ts`, `org-provision-runtime.ts`
- **Was broken:** PATCH to `http://localhost:${port}` from inside worker container.
- **Impact:** Mapping save failed in Docker unless API on localhost.
- **Repair:** Uses `apiConfig.controlPlaneApiBaseUrl` (`API_HOST` + port; prod: `http://api:4000`).

**Positive (not failures):** Concurrent provision guard (`provision-lock.ts`), provision journal/resume ops, rollback with compose down + optional DB teardown, lifecycle job failure marking in `provision-failure.ts`.

---

## 9. Networking & connectivity

> **Reconciliation:** §9.1–§9.2 port desync resolved via Wave 2 compose bind.

### ✅ Split-brain success: internal OK, public broken — **repaired (Wave 2, 2026-06-07)**

- **Files:** compose bind + `traefik-config.ts`
- **Was broken:** Worker reached Finance via internal IP; Traefik used different port.
- **Repair:** Single source of truth — `PUBLIC_PROXY_PORT` bind. Smoke pending.

### ✅ POS → Finance internal URL wrong — **repaired (Wave 2, 2026-06-07)**

- **File:** `build-finance-internal-url.ts` + compose bind
- **Was broken:** URL used wrong published port.
- **Repair:** Internal URL uses same allocated port as compose bind.

### ❌ Host vs container worker env overrides

- **Files:** `provisioner.ts`, `packages/config`, prod compose worker env
- **What is broken:** Different needs for `WORKER_SHARED_MYSQL_HOST`, `TENANT_INTERNAL_HOST`, `TRAEFIK_TENANT_UPSTREAM_HOST`, `WORKER_INTERNAL_NETWORK`.
- **Impact:** Windows/local dev misconfiguration causes provision failures.
- **Fix:** Preflight connectivity checks before job start.

---

## 10. PM2 / process management

**No issues found for provisioning chain.** Provisioning uses Docker + BullMQ `infra-worker`, not PM2. Finance server includes PM2-related rate limiter code only; not part of Stockix provision orchestration.

---

## 11. Coolify integration

**Not used.** No Coolify references in repo. Provisioning is direct Docker Compose via `infra-worker` and socket-proxy.

---

## 12. Cross-cutting issues

> **Section 12 repairs (2026-06-07):** Prefix contract tests, compose log redaction, safer preflight down, readiness/edge.publish verification. Worker tests: 40+ passed.

### ✅ Shared Redis isolation by prefix only — **repaired (2026-06-07, contract tests)**

- **What was broken:** All tenants share `stockix-redis`; isolation is `REDIS_KEY_PREFIX` only.
- **Impact:** Misconfigured prefix → cross-tenant queue leakage risk.
- **Repair:** [`redis-key-prefix.test.ts`](infra/worker-service/domain/provisioning/redis-key-prefix.test.ts) asserts tenant env prefix, POS `queueName()` for all `QUEUE_BASE_NAMES`, and Finance `BullModule.forRoot` + registerQueue inventory.

### ✅ Plaintext secrets in compose process env — **repaired (2026-06-07, log redaction)**

- **File:** `redact-compose-log.ts` + compose `onOutput` in `provision-runtime.ts` / `module-stacks.ts`
- **What was broken:** Compose stdout could echo secrets; debug logs exposed env values.
- **Impact:** Debug logs may expose secrets.
- **Repair:** `redactComposeLogLine()` / `redactEnvForLogging()`; tenant `.env` still `0o700`/`0o600` via `writeTenantEnvFileAtomic()`.

### ✅ Preflight `compose down -v` — **repaired (2026-06-07)**

- **File:** `build-preflight-down-args.ts` + `provision-runtime.ts` preflight cleanup
- **What was broken:** Preflight always passed `-v`, removing project volumes on every retry.
- **Impact:** Risky if local volumes reintroduced to tenant stack.
- **Repair:** Default preflight omits `-v`; `ProvisionInput.cleanSlate === true` adds `-v`. Rollback path in `tenant-docker-workflow.ts` still uses `-v` by design (stale MySQL cred cleanup).

### ✅ Readiness vs Traefik publish timing — **repaired (Wave 6 + 2026-06-07 tests)**

- **File:** `readiness-engine.ts` → `isFinanceTraefikRouteActiveFromEvents`
- **Was broken:** Traefik publish ran late; readiness could disagree with public route state.
- **Repair:** Wave 6 moved `edge.publish` after health check; readiness `routeActive` requires journaled `edge.publish` for accounting; unit tests added in `readiness-module-gating.test.ts`.

---

## Severity summary (post-reconciliation)

| Severity | Open | Fixed in code | Smoke-pending |
|----------|------|-------------|---------------|
| **CRITICAL** | 0 | 8 | 2 (signin, port E2E) |
| **HIGH** | 4 | 12 | 1 |
| **MEDIUM** | 6 | 3 | 0 |
| **LOW** | 4 | 0 | 0 |

**Totals:** ~27 fixed in code (Waves 1–6 + §12), ~10 open (Wave 7–8 remainder + ops), ~3 smoke-pending. **54 unit tests passed.**

---

## Top 3 current risks (2026-06-07)

### 1. Combined smoke not run (HIGH)

Waves 1–6 + §12 code fixes are unit-tested (**54 passed**) but **`provision-diagnose` has not succeeded** locally — API at `localhost:4000` was down. Signin/port fixes need end-to-end validation.

### 2. Wave 7–8 data + docs items (MEDIUM)

System DB drop on migration retry, orphan `_finance` DB, Postgres/pgcrypto doc drift — still open. §12 preflight `-v`, log redaction, Redis prefix tests, and readiness/edge.publish are **done**.

### 3. Finance signin membership edge case (MEDIUM)

Worker now surfaces structured codes; Finance `Auth.controller` may still reject users missing `UserTenant` — verify on smoke before calling accounting provision production-ready.

---

## Recommended fix order (remaining)

1. **Run combined smoke** — `pnpm --filter api provision-diagnose` with full stack.
2. **Wave 7** — migration reset gate, orphan DB cleanup.
3. **Wave 8** — ops docs (MySQL not Postgres).
4. **Optional** — route `db-backup` through socket-proxy.

---

## Verification ledger

| Wave | Scope | Code | Unit tests | Smoke | Deploy |
|------|-------|------|------------|-------|--------|
| 1 | Signin, outcomes, failure logs | ✅ | ✅ 21+ | ⏳ pending | — |
| 2 | Compose port, migration, Mongo rs0 | ✅ | ✅ | ⏳ pending | — |
| 3 | POS env-file, proxy, prebuild | ✅ | ✅ 26→36 | ⏳ pending | ✅ deploy.yml |
| 4 | POS frontend, compose split, secrets, NODE_ENV | ✅ | ✅ 36 | ⏳ pending | — |
| 5 | Branding, PERFIX, MySQL, Resend | ✅ | ✅ 36 | ⏳ pending | — |
| 6 | Early publish, networks, stuck, API URL | ✅ | ✅ 36 | ⏳ pending | — |
| §12 | Redis prefix tests, log redaction, preflight down, readiness | ✅ | ✅ 54 | ⏳ pending | — |
| 7–8 | DB reset, docs (remainder) | ❌ partial | — | — | — |

---

## Top 3 most likely root causes of current failures (historical — superseded)

<details>
<summary>Pre-Wave audit (June 2026 PROV2CHECK) — kept for reference</summary>

### 1. Host port desync (CRITICAL) — **fixed Wave 2**

### 2. `signin_failed` after bootstrap (CRITICAL) — **fixed Wave 1; smoke pending**

### 3. Incomplete POS env and wrong Finance URL (HIGH) — **fixed Waves 2 + 4**

</details>

---

## Key files reference

| Area | Path |
|------|------|
| Provision runtime | `infra/worker-service/src/provision-runtime.ts` |
| DB provision | `infra/worker-service/domain/provisioner.ts` |
| Tenant env | `infra/worker-service/domain/provisioning/tenant-env.ts` |
| Finance compose | `infra/tenant-stack/docker-compose.yml` |
| POS compose | `infra/pos-tenant-stack/docker-compose.yml` |
| POS provision | `infra/worker-service/src/module-stacks.ts` |
| Traefik | `infra/worker-service/domain/traefik-config.ts` |
| Org build / signin | `infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts` |
| Bootstrap admin | `infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts` |
| Failure handling | `apps/api/src/provisioning/provision-failure.ts` |
| Prod stack | `infra/prod/docker-compose.yml` |
| Shared infra | `infra/shared/docker-compose.yml` |
| Diagnose log | `provision-test-run2.log` |

---

*Generated from PROV2CHECK audit — Stockix multi-tenant provisioning (Bigcapital + POS).*
