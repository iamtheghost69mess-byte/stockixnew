# Provisioning Stability Report

**Date:** 2026-06-27  
**Scope:** Full platform — Finance, POS, PMS, Chat, Worker, Proxy, Databases, Shared Infrastructure  
**Method:** Static analysis of all Docker Compose files, Dockerfiles, worker source, config packages, service configs  
**Audited by:** Three parallel specialist agents (Docker/Compose/Ports, Worker/Provisioning, Env/Config)

---

## Executive Summary

The provisioning system has **two blocking bugs** that prevent POS tenants from ever becoming healthy in production, and a **deprovision ReferenceError** that aborts cleanup before touching any data. Several structural issues mean failed provisioning always leaves orphaned infrastructure. The system cannot currently meet the stated success criteria of first-attempt provisioning reliability.

| Severity | Count |
|----------|-------|
| 🔴 Critical (blocks provisioning / causes data loss) | 5 |
| 🟠 High Risk (causes orphans / security / reliability failure) | 9 |
| 🟡 Medium (fragility, drift, silent failure risk) | 12 |
| 🟢 Low (cleanup, efficiency) | 7 |

---

## 🔴 Critical Issues

### C-1 — POS_PORT set to dynamic host port; container and healthcheck hardcode 8010

**Severity:** Critical — blocks ALL POS provisioning in production  
**Files:** `infra/worker-service/src/module-stacks.ts:444-446`, `infra/pos-tenant-stack/docker-compose.yml:24,33,56`

`resolvePosPorts` allocates a dynamic port from `tenant_port_seq` (range 4100–4999) and assigns it to **both** `POS_HOST_PORT` (host-side publish port — correct) **and** `POS_PORT` (the container `PORT` env var — wrong):

```ts
// module-stacks.ts:444-446
POS_HOST_PORT: String(backendPort),
POS_PORT:      String(backendPort),  // ← should always be 8010
```

Inside the container the app reads `PORT = process.env.POS_PORT` → listens on 4100+.  
The compose mapping is `127.0.0.1:${POS_HOST_PORT}:8010` → forwards host 4100 → **container 8010 (nothing listening)**.  
The healthcheck probes `http://127.0.0.1:8010/health` → **always fails**.  
`pos-platform-worker` and `pos-bigcapital-worker` declare `depends_on: pos-backend: service_healthy` → **entire POS stack never starts**.

The bug is masked in local dev (no DB → `resolvePosPorts` falls back to default 8010, so `POS_PORT=8010` matches).

**Fix:** `POS_PORT` must be fixed at `8010` (the container-internal port). Only `POS_HOST_PORT` should vary:
```ts
POS_HOST_PORT: String(backendPort),
POS_PORT:      "8010",             // always the container-internal port
```

---

### C-2 — Deprovision throws ReferenceError before any data-plane cleanup

**Severity:** Critical — orphans all tenant infrastructure on every deprovision  
**File:** `infra/worker-service/domain/provisioner.ts`, function `deprovisionTenant`

`envFileExists` is declared inside an `else` block (line ~832) but referenced outside that block's scope at lines ~859 (POS compose down) and ~888 (PMS compose down). TypeScript/tsup transpile-only mode ships this without catching the scoping error. At runtime the worker throws `ReferenceError: envFileExists is not defined` before executing any compose-down, MySQL drop, Mongo drop, Redis flush, or ProxySQL user removal. Every deprovision call exits early, leaving the entire tenant infrastructure running.

**Fix:** Hoist `let envFileExists = false;` above the `if/else` block so it is in scope for all references.

---

### C-3 — `stockix_public` overlay network is not attachable; tenant containers cannot join it

**Severity:** Critical — tenant containers fail to attach to the public network  
**File:** `infra/prod/docker-compose.yml:777-779`

`stockix_public` is declared as `driver: overlay` without `attachable: true`. Per-tenant stacks (Finance server, POS frontend, PMS frontend) are brought up by the worker via `docker compose up` (standalone containers, not Swarm services) and declare `stockix_public: external: true`. Docker requires `attachable: true` for standalone containers to join an overlay network. `stockix-shared` correctly has `attachable: true`; `stockix_public` does not.

**Fix:** Add `attachable: true` to the `stockix_public` network definition in `infra/prod/docker-compose.yml`. Or remove tenant containers from `stockix_public` entirely (Traefik already reaches tenants via `host.docker.internal`).

---

### C-4 — Finance server binds on all interfaces, bypassing Traefik TLS

**Severity:** Critical — every Finance tenant directly reachable on a public port  
**File:** `infra/tenant-stack/docker-compose.yml:124-125`

```yaml
ports:
  - "0.0.0.0:${PUBLIC_PROXY_PORT}:3000"   # ← all interfaces
```

Every provisioned Finance tenant is reachable on port 4100–4999 via the public IP, bypassing Traefik's TLS termination and auth layer. POS (`127.0.0.1:...`) and PMS (`127.0.0.1:...`) correctly bind to loopback.

**Fix:** Change to `127.0.0.1:${PUBLIC_PROXY_PORT}:3000`. The worker runs on `stockix-shared` and can reach the Finance container by service name without a host-port route.

---

### C-5 — pgbouncer has no healthcheck; `api` and `api-bullmq` declare `service_healthy` dependency on it

**Severity:** Critical — API services either fail to start (Compose mode) or silently drop the dependency (Swarm mode)  
**File:** `infra/prod/docker-compose.yml:303-329, 373-374, 421-422`

`pgbouncer` defines no `healthcheck:` block. `api` and `api-bullmq` declare `depends_on: pgbouncer: condition: service_healthy`. Under `docker compose up`, this condition can never be satisfied → services fail to start. Under `docker stack deploy`, `depends_on` is ignored entirely → API starts before pgbouncer is ready.

**Fix:** Add a pgbouncer healthcheck, e.g.:
```yaml
healthcheck:
  test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-p", "5432"]
  interval: 10s
  timeout: 5s
  retries: 5
```

---

## 🟠 High Risk Issues

### H-1 — POS provision-only env vars never written to tenant `.env`; stack unrecoverable after restart

**File:** `infra/worker-service/src/module-stacks.ts:438-460` (in-memory `composeEnv` only)  
**Persisted:** `persistPosSecretsToTenantEnv` writes only 5 secrets (`AUTH_TOKEN_SECRET`, `JWT_SECRET`, `PLATFORM_JWT_SECRET`, `LICENSE_SIGNING_SECRET`, `FIELD_ENCRYPTION_KEY`)

These critical vars are injected at provision time but **never persisted** to the tenant `.env` file:
`POS_PLATFORM_API_KEY`, `TENANT_ID`, `POS_BACKEND_URL`, `POS_FRONTEND_URL`, `POS_HOST_PORT`, `POS_FRONTEND_HOST_PORT`, `POS_PORT`, `CORS_ORIGINS`, `ROOT_DOMAIN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FINANCE_INTERNAL_BASE_URL`, `REDIS_URL`, `REDIS_KEY_PREFIX`, `MONGODB_URI`.

Any manual `docker compose up` using the tenant `.env` file (e.g., worker restart recovering a stack, manual recovery, deprovision→re-up) silently loses all of these. The POS stack cannot self-heal from a worker restart.

**Fix:** Write all runtime compose env vars to the tenant `.env` at provision time via `writeTenantEnvFileAtomic`. Existing secret-separation logic can be preserved by appending non-secret vars separately.

---

### H-2 — Rollback is status-only; never tears down live infrastructure

**File:** `infra/worker-service/src/provisioning-workflows/org-build.ts:57-185` (`rollbackProvision`)

On provision failure, rollback:
- ✅ Sets tenant/job status to `failed`
- ✅ Cleans MySQL orphan (if `docker.data_step` was journaled)
- ✅ Removes tenant env dir
- ❌ Does NOT compose-down Finance or POS containers
- ❌ Does NOT unpublish Traefik route
- ❌ Does NOT drop Mongo DB (`{slug}_pos`)
- ❌ Does NOT flush Redis keys
- ❌ Does NOT remove ProxySQL user
- ❌ Does NOT remove the Finance app from the internal network

The line `"DEBUG: preserving tenant stack and containers for debugging."` (org-build.ts:146) confirms this is intentional. In production this means every failed provision attempt leaves live containers and data-plane state behind.

**Fix:** Add a `--force-cleanup` flag or a production rollback profile that runs compose-down, drops Mongo, flushes Redis, removes the ProxySQL user, and de-registers the Traefik route. Use the debug-preserve behavior only when `PRESERVE_ON_ROLLBACK=true`.

---

### H-3 — POS port allocation not journaled; each retry leaks two ports permanently

**File:** `infra/worker-service/src/module-stacks.ts`, `provisionPosStack`

`allocateTenantPort()` is called twice (backend + frontend) inside `provisionPosStack` with no `hasOp` journal guard. On provision retry (after a transient failure), two new ports are allocated each time. The previously allocated ports remain in `tenant_port_seq` as consumed but no container is assigned to them. Over time these ports accumulate as orphans.

**Fix:** Wrap port allocation in a journal op, or persist the allocated ports to `tenantDeployments` before using them and re-read on retry.

---

### H-4 — Finance org orphaned on org-provision failure

**File:** `infra/worker-service/src/org-provision-runtime.ts` (`executeOrgProvisionRuntime`)

`registerNewFinanceOrg` is called early in the sequence. If any step after it fails, `patchControlPlaneOrganization(provisioningError)` marks the control-plane org as failed, but the Finance-side tenant/org record is **never deleted**. The Finance instance retains a ghost org that blocks future provisioning attempts for the same slug.

**Fix:** Catch post-registration failures and call a Finance org deletion endpoint before marking the control-plane org failed.

---

### H-5 — `resolveParentFinanceTenantId` falls back to hardcoded `1`

**File:** `infra/worker-service/src/org-provision-runtime.ts`, `resolveParentFinanceTenantId`

If `/api/organization/current` fails, the parent Finance tenant ID defaults to `1`. This silently links the new org to the wrong parent in Finance, which can corrupt org isolation and billing attribution.

**Fix:** Throw instead of returning `1` in production (`NODE_ENV === "production"`). In dev, warn and continue.

---

### H-6 — Control-plane POS proxy uses a single global URL; no per-tenant routing

**Files:** `apps/api/src/routes/pos-proxy-http.ts:552`, `packages/config/src/pos.ts:5`

`posConfig.platformBaseUrl` defaults to `http://localhost:8010` and is a single global value. The proxy does not look up per-tenant `tenantDeployments.posUrl`. In multi-tenant production, all proxied POS requests route to the same URL, meaning only one POS tenant can be correctly served.

**Fix:** Derive the POS backend URL per-request from `tenantDeployments` keyed by `tenant_id`. The allocated port / subdomain is already stored at provision time.

---

### H-7 — `PLATFORM_JWT_SECRET` has no production guard on the control-plane API side

**File:** `packages/config/src/api.ts:125-127`

`apiConfig.platformJwtSecret` is a plain optional passthrough of `process.env.PLATFORM_JWT_SECRET`. The POS backend requires it (`resolvePosJwtEnv` throws in prod if unset), but the API can boot and serve requests without it. Any API→POS call that uses this secret silently fails with auth errors rather than a startup assertion.

Additionally, the dev fallback `${authTokenSecret}:platform` must match between the API process and the worker process. If `AUTH_TOKEN_SECRET` differs, POS↔platform auth breaks silently in dev.

**Fix:** Add `PLATFORM_JWT_SECRET` to `validateRequiredEnvForProfile` for production. Assert equality between API and worker values in integration tests.

---

### H-8 — ProxySQL admin credentials default to `admin`/`admin` with no production guard

**Files:** `infra/worker-service/domain/provisioner.ts:90-97`, `packages/config/src/env.ts:233-234`

`proxySqlAdminCredentials()` returns `{ user: 'admin', password: 'admin' }` if the env vars are unset. If `PROXYSQL_ADMIN_USER`/`PROXYSQL_ADMIN_PASSWORD` are missing from prod `.env`, the worker operates with the default admin credential — which is also the ProxySQL container default, meaning the admin interface is open with a known-default password.

**Fix:** Add both vars to `validateRequiredEnvForProfile` for production. Ensure `infra/prod/.env.example` documents them as required.

---

### H-9 — All provisioning jobs are `noRetry`; transient failures are terminal

**File:** `infra/worker-service/src/worker.ts`, job registration

Every `tenant.provision`, `org.provision`, and `tenant.add_module` job is registered as `noRetry: true`. A single transient Docker API timeout, Redis blip, or DNS hiccup causes a permanent job failure and initiates rollback (which itself is incomplete — see H-2). There is no circuit-breaker or exponential backoff for recoverable errors.

**Fix:** Classify errors using `isPermanentWorkerError` (already exists) and allow retries for transient errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, Docker API 5xx). Cap at 3 retries with exponential backoff.

---

## 🟡 Medium Issues

### M-1 — PMS host ports use static defaults; second PMS tenant causes port conflict

**File:** `infra/pms-tenant-stack/docker-compose.yml:17,48` (`PMS_HOST_PORT:-3003`, `PMS_FRONTEND_HOST_PORT:-3004`)

PMS port allocation is not wired into the worker. Finance and POS allocate from `tenant_port_seq`; PMS does not. The defaults (3003, 3004) mean a second PMS tenant will fail to bind its host ports.

**Fix:** Route PMS ports through `allocateTenantPort` in `provisionPmsStack` (same pattern as Finance and POS). Journal the allocated ports.

---

### M-2 — PMS frontend exposes an internal Docker hostname in a `NEXT_PUBLIC_*` variable

**File:** `infra/pms-tenant-stack/docker-compose.yml:21-23`

`NEXT_PUBLIC_PMS_API_URL=http://pms-api:3003` is a browser-visible variable pointing to an internal Docker service name unreachable from browsers. Also, `NEXT_PUBLIC_*` vars are inlined at Next.js build time — injecting them as runtime `environment:` vars has no effect.

**Fix:** Set `NEXT_PUBLIC_PMS_API_URL` to the public Traefik URL at build time via a build `arg`. Use an internal hostname only for server-side API calls via a separate non-`NEXT_PUBLIC_` var.

---

### M-3 — POS frontend `NEXT_PUBLIC_POS_API_ORIGIN` baked at build time into a shared image

**Files:** `infra/pos-tenant-stack/docker-compose.yml:144-145`, `apps/pos-frontend2/Dockerfile:36-37`

`stockix-pos-frontend:local` is built once with `NEXT_PUBLIC_POS_API_ORIGIN` baked in (default `http://localhost:8010`). Every POS tenant shares the same image. Per-tenant `POS_BACKEND_URL` passed at provision time as a runtime env var does not update the already-inlined value. All POS frontends in production ship pointing at `localhost:8010`.

**Fix:** Either build a per-tenant image (expensive) or use a runtime configuration approach — inject the API origin via a server-side Next.js route that the frontend fetches at load time, rather than relying on `NEXT_PUBLIC_*` build-time inlining.

---

### M-4 — `TENANT_ENV_ROOT` path mismatch between capacity monitor and env-paths module

**Files:** `infra/worker-service/src/worker.ts` (capacity monitor, `/opt/tenants`), `infra/worker-service/domain/env-paths.ts` (`/opt/stockix/tenants` in prod)

The capacity monitor reads `TENANT_ENV_ROOT` with a default of `/opt/tenants`. The canonical env-paths module resolves to `/opt/stockix/tenants` (prod) or `~/.stockix/tenants` (dev). If `TENANT_ENV_ROOT` is not set, the capacity monitor scans the wrong directory and reports incorrect tenant counts.

**Fix:** Import `tenantEnvRoot()` from `env-paths.ts` in the capacity monitor instead of re-reading the env var with a conflicting default.

---

### M-5 — Finance `PORT` is never set by the tenant-stack compose; app relies on an undocumented container default

**Files:** `infra/tenant-stack/docker-compose.yml`, `services/stockix-finance/packages/server/src/config/index.ts:11`

The tenant-stack compose does not set `PORT`. `config/index.ts:11` reads `parseInt(process.env.PORT)` → `NaN`. The server defaults to `3000` only through an implicit Express/app fallback not documented in the config. The compose port mapping `0.0.0.0:${PUBLIC_PROXY_PORT}:3000` works by coincidence.

**Fix:** Add `PORT: "3000"` explicitly to the tenant-stack compose environment block for the Finance server service.

---

### M-6 — `revertAddModuleFailure` sets tenant status back to `active` after a failed module add

**File:** `infra/worker-service/src/provisioning-workflows/org-build.ts`, `revertAddModuleFailure`

When `tenant.add_module` fails, `revertAddModuleFailure` marks the job as failed but restores the tenant status to `active`. The tenant appears fully healthy in the dashboard while a module is in a partially-provisioned state. The module itself may have running containers, a ProxySQL user, or Mongo DBs that aren't cleaned up.

**Fix:** Set tenant status to `degraded` or `module_install_failed` rather than `active`. Surface the module failure state in the dashboard.

---

### M-7 — `redisPassword` parameter is generated but ignored; `TENANT_REDIS_PASSWORD` env var controls actual auth

**File:** `infra/worker-service/src/provision-runtime.ts:335`, `infra/worker-service/domain/provisioning/tenant-env.ts`

`provision-runtime.ts:335` generates `redisPassword = secrets.randomHex(16)`, passes it to `buildTenantEnvMap`. However `buildTenantEnvMap` reads `process.env.TENANT_REDIS_PASSWORD` (the global sentinel value) for the actual `REDIS_PASSWORD` it writes to the tenant env. The generated per-tenant password is discarded. All tenants share the same Redis password (or no auth if the sentinel `__MUST_OVERRIDE__` is unconfigured). The API secret reference `redisPassword` parameter is a dead value.

**Fix:** Remove the generated `redisPassword` parameter if per-tenant Redis auth is not implemented. Document that Redis auth is cluster-wide. Alternatively implement per-tenant Redis auth using the generated value.

---

### M-8 — Prod compose mixes Swarm-only and Compose-only semantics

**File:** `infra/prod/docker-compose.yml`

The file uses Swarm-only features (`deploy.placement.constraints: node.role == manager`, `replicas: 2`, `--providers.swarm=true`, top-level `secrets:`) alongside Compose-only features (`depends_on: condition: service_healthy`, `mem_limit:`). Under `docker compose up`: deploy constraints, replicas, and secrets are silently ignored; one replica runs on any node. Under `docker stack deploy`: `depends_on` conditions are silently ignored; `mem_limit` is ignored in favour of `deploy.resources.limits`. No mode works correctly as written.

**Fix:** Decide on a single runtime mode. For single-node prod, use `docker compose` and remove Swarm-specific fields. For multi-node, use `docker stack deploy` and replace `depends_on: service_healthy` with readiness probes / retry logic inside the services.

---

### M-9 — Backup container names assume Compose naming convention; fail under Swarm

**File:** `infra/prod/docker-compose.yml:707-711`

```yaml
BACKUP_POSTGRES_CONTAINER: stockix-postgres-1
BACKUP_MYSQL_CONTAINER:    stockix-shared-stockix-mysql-1
BACKUP_MONGO_CONTAINER:    stockix-shared-stockix-mongo-1
HEALTH_REDIS_CONTAINER:    stockix-shared-stockix-redis-1
```

Under Swarm, container names follow the pattern `{stack}_{service}.{replica}.{task-id}`. The `docker exec` calls in the backup scripts will fail silently if the stack runs under Swarm.

**Fix:** Either commit to Compose mode (safe for single-node) or make backup scripts use `docker compose exec` with the project/service name rather than hard-coded container names.

---

### M-10 — Shared-infra hostnames split between validated config schema and raw process.env reads

**File:** `infra/worker-service/domain/provisioner.ts:46,60` vs `packages/config/src/env.ts:230-231`

`MYSQL_PROXY_HOST`/`MYSQL_PROXY_PORT` pass through the validated `@repo/config` schema. `SHARED_MYSQL_HOST`, `SHARED_MONGO_HOST`, `TENANT_REDIS_HOST` are read directly via `process.env` with no validation, no type coercion, and no default documented in the schema. Missing values silently produce `undefined` rather than a startup error.

**Fix:** Add `SHARED_MYSQL_HOST`, `SHARED_MONGO_HOST`, `TENANT_REDIS_HOST` to the `@repo/config` env schema with proper required-in-production guards.

---

### M-11 — Finance `PORT` never explicitly set results in silent fallback dependency

See M-5. Additional note: `common/config/queue.ts` reads `QUEUE_HOST`/`QUEUE_PORT` separately from `REDIS_HOST`/`REDIS_PORT` — the worker generates `REDIS_HOST`/`REDIS_PORT` but not `QUEUE_HOST`/`QUEUE_PORT`. If Finance uses BullMQ/Agenda via `QUEUE_*` vars, queue workers fail silently.

**Fix:** Audit whether Finance actually uses `QUEUE_HOST`/`QUEUE_PORT` in production. If yes, add them to `buildTenantEnvMap`.

---

### M-12 — Tenant port pool effectively capped at 900 ports despite sequence supporting 49,999

**Files:** `packages/db/drizzle/0055_raise_port_sequence.sql` (MAXVALUE 49999), `packages/db/src/allocate-tenant-port.ts`, `infra/prod/docker-compose.yml:74` (`MAX_TENANT_PORT=4999`)

The sequence was raised to 49,999 but `MAX_TENANT_PORT` defaults to 4,999. Each Finance tenant consumes 1 port, each POS tenant consumes 2. Effective capacity: ~900 Finance-only or ~300 dual-stack tenants before allocation fails.

**Fix:** Raise `MAX_TENANT_PORT` to `49999` in `infra/prod/docker-compose.yml` (or make it explicitly configured) to match the sequence cap, or document the 4999 limit as intentional policy.

---

## 🟢 Low Issues

**L-1** — `stockix_public` top-level `secrets:` block (10 secrets declared) is never consumed by any service — all values are env-interpolated. Dead configuration.

**L-2** — `infra/dev/docker-compose.full.yml` `infra-worker` missing `MYSQL_PROXY_HOST`, `TENANT_REDIS_HOST`, `SHARED_MONGO_HOST` — finance provisioning in full-dev stack would silently use wrong hosts.

**L-3** — POS dev CORS origins (localhost 3000/3010/5173-5175) are hardcoded in `apps/pos-backend/config/config.js:34-46` rather than read from `CORS_ORIGINS` env var. Dev convenience bleeds into the shared config object.

**L-4** — `Mongo{slug}_pos` database is never dropped on rollback or deprovision (except via manual cleanup script). `cleanupMysqlOrphan` handles MySQL; Mongo has no equivalent automated cleanup.

**L-5** — `AGENDA_DB_COLLECTION`, `AGENDA_POOL_TIME`, `AGENDA_CONCURRENCY` are read by Finance config but never generated by the worker (`tenant-env.ts`). `parseInt(undefined)` → `NaN` for concurrency. If Agenda is active, job concurrency is broken.

**L-6** — ProxySQL admin port `6032` has no `WORKER_MYSQL_PROXY_ADMIN_PORT` override. Host-run worker always falls back to `docker exec` for admin commands; fine for current usage but inconsistent with the WORKER_* override pattern established for other ports.

**L-7** — `infra/preview/docker-compose.preview.yml` has no `mem_limit` on any service. Acceptable for ephemeral PR previews; document as intentional.

---

## Recommendations

### R-1 — Single source of truth for service ports

Create `infra/ports.yml` (or a `packages/config/src/ports.ts` constant map) that defines every internal container port once. Compose files, healthcheck commands, Dockerfiles, and worker code all reference this map. Eliminates the class of bug where compose, Dockerfile, healthcheck, and worker independently hardcode the same port.

### R-2 — Make rollback a first-class cleanup operation

Replace the status-only rollback with a `deprovisionModule(slug, module)` function that can be called both on failure and on explicit deprovision. It should: compose-down the module stack, remove ProxySQL user, drop Mongo DB, flush Redis key prefix, de-register Traefik route, and delete the env dir. Journal each cleanup step so partial cleanup is safely retried.

### R-3 — Centralise all tenant env generation into one auditable map

All vars a tenant stack needs — both secrets and operational config — should be written by `buildTenantEnvMap` to the tenant `.env` at provision time. The `persistPosSecretsToTenantEnv` / `composeEnv` split creates an invisible partial-state gap. One function, one file, all vars.

### R-4 — Add startup assertions for all production-required vars

Extend `validateRequiredEnvForProfile` (currently in `packages/config/src/env.ts`) to cover:
`PLATFORM_JWT_SECRET`, `PROXYSQL_ADMIN_USER`, `PROXYSQL_ADMIN_PASSWORD`, `SHARED_MYSQL_HOST`, `SHARED_MONGO_HOST`, `TENANT_REDIS_HOST`, `TENANT_PORT_RANGE_MIN`, `TENANT_PORT_RANGE_MAX`. The worker should refuse to start in production if any are missing.

### R-5 — Implement per-tenant POS proxy routing

Add a `tenantDeployments` lookup to the POS proxy route (keyed by `tenant_id` from the auth token). Store the allocated host port and scheme in `tenantDeployments.posUrl` at provision time. This is already stored during Finance provisioning; POS needs the same pattern.

### R-6 — Decouple POS frontend API origin from build time

Use a Next.js route handler (`/api/config`) that returns the `POS_BACKEND_URL` runtime env var, and have the frontend fetch this on first load. This makes one shared POS frontend image work correctly for all tenants without rebuilding.

### R-7 — Add retry with backoff for transient provisioning failures

Classify errors in `isPermanentWorkerError` and allow up to 3 retries with exponential backoff for transient failures. Journal the retry count. Only terminal errors (slug conflicts, invalid input, missing license) should be `noRetry: true`.

### R-8 — Fix the PMS port allocation gap

PMS provisioning must call `allocateTenantPort` twice (api + frontend) just as POS does, and persist those ports to `tenantDeployments`. Until this is done, only one PMS tenant can exist per host.

### R-9 — Commit to a single prod runtime mode

Audit the production deployment mode (Compose vs Swarm) and remove conflicting fields. If Compose: remove `deploy:` blocks, Swarm networks, external secrets. If Swarm: replace `depends_on: service_healthy` with internal readiness retries.

### R-10 — Automate post-provision validation

After every provisioning job completes (Finance, POS, PMS, Chat), run a post-provision health probe: HTTP check on each service URL, Redis connectivity, Mongo connectivity, Finance API `/health`. If any probe fails within a timeout, trigger cleanup rollback automatically. This transforms silent partial-success into a detectable state.

---

## Appendix — File Reference Map

| Area | Key Files |
|------|-----------|
| POS port bug | `module-stacks.ts:444-446`, `pos-tenant-stack/docker-compose.yml:24,33,56` |
| Deprovision ReferenceError | `domain/provisioner.ts` (`deprovisionTenant`, `envFileExists`) |
| Public network attach | `infra/prod/docker-compose.yml:777-779` |
| Finance public bind | `infra/tenant-stack/docker-compose.yml:124-125` |
| pgbouncer healthcheck | `infra/prod/docker-compose.yml:303-329` |
| POS env persistence | `module-stacks.ts:102-110, 438-460` |
| Rollback gaps | `provisioning-workflows/org-build.ts:57-185` |
| Port allocation journal | `module-stacks.ts` (`provisionPosStack`) |
| POS proxy routing | `apps/api/src/routes/pos-proxy-http.ts:552`, `packages/config/src/pos.ts:5` |
| PLATFORM_JWT_SECRET | `packages/config/src/api.ts:125-127`, `module-stacks.ts:75-99` |
| ProxySQL admin default | `domain/provisioner.ts:90-97`, `packages/config/src/env.ts:233-234` |
| Tenant env generation | `domain/provisioning/tenant-env.ts` |
| PMS port allocation | `infra/pms-tenant-stack/docker-compose.yml:17,48` |
| redisPassword dead param | `provision-runtime.ts:335`, `tenant-env.ts` |
| TENANT_ENV_ROOT mismatch | `src/worker.ts` (capacity monitor), `domain/env-paths.ts` |
