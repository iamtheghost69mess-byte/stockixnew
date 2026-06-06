# rechecker22 — Stockix Provisioning Failure Audit

Full diagnostic output from **PROV2CHECK** (June 2026). This document reports **only** broken, missing, inconsistent, or risky items for **Bigcapital (accounting / `stockix-finance`)** and **POS (Vendorix / `posnew`)** provisioning.

**Architecture note:** Finance uses **shared MySQL** (`stockix-mysql`), not per-tenant PostgreSQL. MongoDB is shared (`stockix-mongo`) with per-tenant database `{slug}_pos`. Redis is shared with key prefix `tenant:{slug}:`.

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

### ✅ Required Finance images must be pre-built — **repaired (Wave 3, 2026-06-07)**

- **File:** `infra/worker-service/domain/provisioning/check-tenant-images.ts`, deploy workflows
- **Was broken:** Provision hard-failed but deploy ran prebuild in background (prod) or ignored failures (staging); worker only warned at startup.
- **Impact:** Fresh VPS could deploy successfully without tenant images; provisions blocked at runtime.
- **Repair:** `deploy.yml` / `deploy-staging.yml` synchronous prebuild + verify; prod `checkRequiredTenantImages()` calls `assertRequiredTenantImages()`; image prune moved before prebuild on prod deploy.

### ❌ Missing POS frontend image is non-fatal

- **File:** `infra/worker-service/src/module-stacks.ts`
- **What is broken:** If `stockix-pos-frontend:local` missing, frontend service skipped with log only.
- **Impact:** Tenant can be “active” with backend-only POS; Traefik frontend route broken.
- **Fix:** Fail when POS module licensed and frontend image absent.

### ❌ Build stanzas in prod-shaped compose

- **File:** `infra/tenant-stack/docker-compose.yml`
- **What is broken:** `build:` targets remain while runtime uses `--no-build`.
- **Impact:** Accidental `up` without `--no-build` triggers long VPS builds.
- **Fix:** Split prod (image-only) from dev overrides.

---

## 4. Environment variables

### ❌ POS missing JWT / platform / license secrets

- **Files:** `infra/pos-tenant-stack/docker-compose.yml`, `services/posnew/apps/pos-backend/config/config.js`
- **What is broken:** Compose sets `AUTH_TOKEN_SECRET` but not `JWT_SECRET`, `PLATFORM_JWT_SECRET`, `LICENSE_SIGNING_SECRET`, `FIELD_ENCRYPTION_KEY`.
- **Impact:** Staff/platform JWT and license enforcement broken or undefined in production.
- **Fix:** Inject required secrets into POS compose env from platform config.

### ❌ Finance server missing `NODE_ENV=production`

- **File:** `infra/tenant-stack/docker-compose.yml` → `server`
- **What is broken:** `NODE_ENV` not set in container.
- **Impact:** Dev defaults, weaker security/cookie behavior in prod.
- **Fix:** Set `NODE_ENV=production`.

### ❌ Branding vars not injected into Finance container

- **File:** `infra/worker-service/domain/provisioning/tenant-env.ts` vs compose `server.environment`
- **What is broken:** `REACT_APP_STOCKIX_*` written to tenant `.env` but not passed in compose environment block.
- **Impact:** Runtime branding fetch may not work unless baked at image build.
- **Fix:** Add branding vars to compose `server.environment`.

### ❌ Duplicate typo env key `TENANT_DB_NAME_PERFIX`

- **File:** `infra/worker-service/domain/provisioning/tenant-env.ts`
- **What is broken:** Both `TENANT_DB_NAME_PREFIX` and `TENANT_DB_NAME_PERFIX` set (typo duplicate).
- **Impact:** Legacy Finance may depend on misspelled key; drift risk.
- **Fix:** Confirm Finance usage; remove typo when upstream fixed.

### ❌ `FINANCE_INTERNAL_BASE_URL` uses wrong port

- **File:** `infra/worker-service/domain/provisioning/build-finance-internal-url.ts`
- **What is broken:** Uses Postgres-allocated `internalPort`, not Docker-published port.
- **Impact:** POS `bigcapitalSyncWorker` calls wrong Finance URL.
- **Fix:** Use resolved publish port or fix compose binding to match allocation.

### ❌ Host-run worker MySQL host misconfiguration

- **File:** `infra/worker-service/domain/provisioner.ts` → `workerSharedMysqlHost`
- **What is broken:** Requires `WORKER_SHARED_MYSQL_HOST=127.0.0.1` when worker runs on host; warn-only if unset.
- **Impact:** Local/dev DB provision fails with opaque connection errors.
- **Fix:** Fail fast in non-container worker when shared MySQL unreachable.

### ❌ RESEND_API_KEY fallback to MAIL_PASSWORD

- **File:** `infra/worker-service/src/module-stacks.ts`
- **What is broken:** `RESEND_API_KEY` falls back to SMTP `MAIL_PASSWORD`.
- **Impact:** POS email jobs fail; misleading config.
- **Fix:** Require explicit `RESEND_API_KEY` for POS.

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

### ❌ Mongo verification is TCP-only

- **File:** `infra/worker-service/domain/provisioner.ts` → `verifyTcpReachable`
- **What is broken:** No rs0 PRIMARY check before provision continues.
- **Impact:** Provision proceeds while replica set still initializing.
- **Fix:** Verify `rs.status()` PRIMARY before POS/Finance Mongo use.

### ❌ PostgreSQL / pgcrypto not applicable

- **What is broken (docs/runbooks):** Checklists referencing per-tenant Postgres and `pgcrypto` do not match production (MySQL shared infra).
- **Fix:** Update ops docs to MySQL GRANT pattern in provisioner.

---

## 6. Traefik routing

### ❌ Traefik upstream port mismatch

- **File:** `infra/worker-service/domain/traefik-config.ts` → `writeTenantTraefikConfig`
- **What is broken:** Upstream `http://{TRAEFIK_TENANT_UPSTREAM_HOST}:{internalPort}` uses DB allocation, not Docker publish port.
- **Impact:** `{slug}.{ROOT_DOMAIN}` routes to wrong port → 502 / broken Finance UI.
- **Fix:** Use resolved publish port or bind compose to `PUBLIC_PROXY_PORT`.

### ❌ Traefik publish late in pipeline

- **File:** `infra/worker-service/src/provision-runtime.ts` → `edge.publish`
- **What is broken:** Traefik YAML written after org build, warehouse, POS defaults, etc.
- **Impact:** Long window where stack is up but subdomain unreachable.
- **Fix:** Publish route after server health + port resolution (update if port changes).

### ❌ Auto-create `stockix_public` without Traefik

- **File:** `infra/worker-service/domain/provisioning/ensure-tenant-networks.ts`
- **What is broken:** Creates missing external networks in local dev without full edge stack.
- **Impact:** Silent partial routing in dev-shaped runs.
- **Fix:** Fail preflight if prod-shaped provision and shared/prod stack not up.

**POS Traefik:** `{slug}-pos.{domain}` and `{slug}-pos-api.{domain}` via `writePosTraefikConfig` — same host/port allocation issues apply to backend/frontend host ports.

---

## 7. Migration & setup scripts

### ❌ Post-bootstrap org build blocked by signin

- **Files:** `fetch-stockix-finance-build-org.ts`, `provision-test-run2.log`
- **What is broken:** Reproduced: ping OK → bootstrap OK → `signin_failed`.
- **Impact:** Blocks COA, warehouse, POS integration for accounting tenants.
- **Fix:** Debug Finance signin immediately after `provision-user`.

### ❌ Finance signin 401 when org membership missing

- **File:** `services/stockix-finance/packages/server/src/modules/Auth/Auth.controller.ts`
- **What is broken:** `UnauthorizedException('No organization found for this user')` when UserTenant / tenantId resolution fails.
- **Impact:** Surfaces as generic `signin_failed` in worker.
- **Fix:** Ensure `provision-user` always creates consistent `user.tenantId` + `UserTenant` before build.

### ❌ Bootstrap payload uses snake_case field names

- **File:** `infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts`
- **What is broken:** Sends `first_name` / `last_name`; DTO expects `firstName` / `lastName`.
- **Impact:** Relies on Finance `SerializeInterceptor` snake/camel transform; breaks if route skips interceptor.
- **Fix:** Send camelCase matching `ProvisionUserDto`.

---

## 8. Node.js control plane logic

### ❌ Partial POS outcomes not always job failures

- **Files:** `provision-runtime.ts`, `apps/api` readiness / job status
- **What is broken:** Job may complete while `tenantStatus: partial` and `partialFailureKind` set.
- **Impact:** Dashboard shows inconsistent success vs readiness.
- **Fix:** Map partial failures to terminal job state or block readiness until retry.

### ❌ Stuck reconciler vs long worker timeout

- **File:** `apps/api/src/provisioning/stuck-reconciler.ts`
- **What is broken:** Stuck threshold ~10 minutes; `WORKER_JOB_EXECUTION_TIMEOUT_MS` up to 45 minutes.
- **Impact:** False failed status or duplicate retries on slow provisions.
- **Fix:** Align stuck threshold with worker timeout and heartbeats.

### ❌ financeOrganizationId save uses localhost from worker

- **File:** `infra/worker-service/src/provision-runtime.ts`
- **What is broken:** PATCH to `http://localhost:${apiConfig.port}` from inside worker container.
- **Impact:** Mapping save fails in Docker unless API on localhost; warning-only.
- **Fix:** Use `API_HOST` / internal service URL from worker env.

**Positive (not failures):** Concurrent provision guard (`provision-lock.ts`), provision journal/resume ops, rollback with compose down + optional DB teardown, lifecycle job failure marking in `provision-failure.ts`.

---

## 9. Networking & connectivity

### ❌ Split-brain success: internal OK, public broken

- **Files:** `provision-runtime.ts` (internal URL resolution), `traefik-config.ts`
- **What is broken:** Worker reaches Finance via `stockix_internal` IP or ephemeral publish port; Traefik uses different port number.
- **Impact:** Provisioning logs show success while tenant URL fails.
- **Fix:** Single source of truth for host port (compose binding).

### ❌ POS → Finance internal URL wrong

- **File:** `infra/pos-tenant-stack/docker-compose.yml` → `FINANCE_INTERNAL_BASE_URL`
- **What is broken:** Defaults to `host.docker.internal:{internalPort}` with wrong port.
- **Impact:** `bigcapitalSyncWorker` cannot sync with Finance.
- **Fix:** Internal network IP or correct published port.

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

### ❌ Shared Redis isolation by prefix only

- **What is broken:** All tenants share `stockix-redis`; isolation is `REDIS_KEY_PREFIX` only.
- **Impact:** Misconfigured prefix → cross-tenant queue leakage risk.
- **Fix:** Tests asserting prefix on every BullMQ queue.

### ❌ Plaintext secrets in compose process env

- **File:** `tenant-env.ts` + `composeEnv` spread in `provision-runtime.ts`
- **What is broken:** `.env` file uses encryption for some values; compose exec also passes plaintext in process env.
- **Impact:** Debug logs may expose secrets.
- **Fix:** Redact compose logging; keep `TENANT_ENV_ROOT` permissions strict (partially `0o700`).

### ❌ Preflight `compose down -v`

- **File:** `provision-runtime.ts` preflight cleanup
- **What is broken:** Removes project volumes on retry preflight.
- **Impact:** Risky if local volumes reintroduced to tenant stack.
- **Fix:** Drop `-v` unless explicit clean-slate.

### ❌ Readiness vs Traefik publish timing

- **File:** `apps/api/src/provisioning/readiness-engine.ts`
- **What is broken:** May report route pending while job still running; edge publish is late in pipeline.
- **Fix:** Gate accounting readiness on `edge.publish` journal op.

---

## Severity summary

| Severity | Count | Meaning |
|----------|-------|---------|
| **CRITICAL** | 6 | Blocks provisioning entirely or public access |
| **HIGH** | 14 | Silent failure or partial tenant |
| **MEDIUM** | 11 | Degraded state |
| **LOW** | 6 | Risk or tech debt |

---

## Top 3 most likely root causes of current failures

### 1. Host port desync (CRITICAL)

`tenant_deployments.internal_port` and Traefik use ports **4100–4999** from Postgres sequence `tenant_port_seq`. Finance compose publishes **`0.0.0.0::3000`** (random host port). Worker health/bootstrap can succeed via Docker internal IP or `docker compose port`, while **public Traefik routes and POS `FINANCE_INTERNAL_BASE_URL` fail**.

**Primary fix:** In `infra/tenant-stack/docker-compose.yml`, bind:

```yaml
ports:
  - "127.0.0.1:${PUBLIC_PROXY_PORT}:3000"
```

Then ensure Traefik and POS use the same port value.

### 2. `signin_failed` after bootstrap (CRITICAL)

Reproduced in `provision-test-run2.log`: `/api/internal/provision-user` succeeds; organization build signin fails with no HTTP detail. Blocks seeding, warehouse activation, and POS wiring.

**Primary fix:** Improve error surfacing in `fetch-stockix-finance-build-org.ts`; verify Finance `UserTenant` / `user.tenantId` / password hash immediately after provision-user.

### 3. Incomplete POS env and wrong Finance URL (HIGH)

POS stack missing `JWT_SECRET`, `PLATFORM_JWT_SECRET`, `LICENSE_SIGNING_SECRET`; `FINANCE_INTERNAL_BASE_URL` uses wrong port. Causes POS auth/license failures and broken Bigcapital sync even when containers start.

**Primary fix:** Extend POS compose env in `module-stacks.ts`; fix Finance internal URL to match resolved host port.

---

## Recommended fix order

1. **Bind Finance compose port to `PUBLIC_PROXY_PORT`** — unblocks Traefik and POS→Finance.
2. **Fix signin / org build path** — unblocks accounting tenant completion.
3. **Complete POS env injection** — unblocks POS + integration modules.
4. **Structured provision errors** — reduces time-to-diagnose on remaining issues.
5. **Preflight checks** — MySQL/Mongo/rs0/images/networks before compose up.

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
