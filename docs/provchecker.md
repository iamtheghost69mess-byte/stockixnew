# Stockix — Docker Images & Provisioning Audit

**Date:** 2026-06-05  
**Scope:** Docker images (all), Provisioning (accounting + POS paths only)

---

## PART 1 — Docker Image Registry

### 1.1 Image Inventory Table

| Image name:tag | Referenced in | Dockerfile | Build script | Exists locally | CMD / entrypoint | Base image | Target stage | Notes |
|----------------|---------------|------------|--------------|----------------|------------------|------------|--------------|-------|
| `stockix-server:local` | `infra/tenant-stack/docker-compose.yml` → `server` | `services/stockix-finance/packages/server/Dockerfile` | `pnpm docker:prebuild` → `docker build -t stockix-server:local -f packages/server/Dockerfile --target app .` (cwd: `services/stockix-finance`) | **YES** (317 MB, built 2026-06-05T10:35Z) | Entrypoint: `docker-entrypoint.sh`; CMD: `node ./packages/server/build/index.js` | `node:22-alpine` (floating) | `app` | Required by `assertRequiredTenantImages()` |
| `stockix-database-migration:local` | `infra/tenant-stack/docker-compose.yml` → `database_migration` | `services/stockix-finance/packages/server/Dockerfile` | `pnpm docker:prebuild` → `docker build -t stockix-database-migration:local -f packages/server/Dockerfile --target migration .` | **YES** (306 MB, rebuilt 2026-06-05T13:50Z) | Entrypoint: `docker-entrypoint.sh`; CMD: `/bin/sh -c "until (node ./build/commands.js system:migrate:unlock …; node ./build/commands.js system:migrate:latest); do … done"` | `node:22-alpine` | `migration` | **Fixed** — uses `/bin/sh` not `/bin/bash` |
| `stockix-pos-backend:local` | `infra/pos-tenant-stack/docker-compose.yml` → `pos-backend`, `pos-platform-worker`, `pos-bigcapital-worker` | `services/posnew/apps/pos-backend/Dockerfile` | `pnpm pos:images:build` → `docker compose -f infra/pos-tenant-stack/docker-compose.yml -p stockix-pos-image-build build pos-backend pos-bigcapital-worker` | **YES** (58 MB) | Entrypoint: `dumb-init --`; CMD: `node app.js` | `node:22-alpine` (build + runner) | multi-stage `build`→`runner` | Guard in `provisionPosStack()` |
| `stockix-pos-frontend:local` | `infra/pos-tenant-stack/docker-compose.yml` → `pos-frontend` | `services/posnew/apps/pos-frontend2/Dockerfile` | `pnpm pos:images:build` → compose build `pos-frontend` OR stub: `docker build -t stockix-pos-frontend:local -f infra/pos-tenant-stack/Dockerfile.pos-frontend-stub` | **YES** (78 MB) | CMD: `node apps/pos-frontend2/server.js` | `node:22-alpine` | `build`→`runner` | Optional at provision; stub rejected if label `io.stockix.image=pos-frontend-stub` |
| `mysql:8.0-bookworm` | `infra/shared/docker-compose.yml` → `stockix-mysql` | Official image | `docker pull` in prebuild Phase 1 (indirect) | **YES** | Official MySQL entrypoint | Floating minor (`8.0-bookworm`) | — | Shared DB for all tenants |
| `mongo:6.0` | `infra/shared/docker-compose.yml` → `stockix-mongo`, `stockix-mongo-rs-init` | Official image | — | **YES** | `mongod --replSet rs0` | Floating major (`6.0`) | — | RS required by tenant `MONGODB_URI` |
| `redis:7-alpine` | `infra/shared/docker-compose.yml` → `stockix-redis` | Official image | — | **YES** | `redis-server` | Floating major | — | Tenant queue prefix isolation |
| `nginx:alpine` | `infra/shared/docker-compose.yml` → `stockix-nginx` | Official image | — | **YES** (`nginx:alpine` pulled) | nginx default | **FLOATING** | — | Not used by tenant-stack provision path |
| `postgres:16-alpine` | `infra/prod/docker-compose.yml` → `postgres` | Official image | Prod deploy workflow | **YES** | Official | Floating major | — | Control-plane only |
| `redis:7-alpine` | `infra/prod/docker-compose.yml` → `control-plane-redis` | Official image | Prod deploy | **YES** | Official | Floating major | — | Control-plane only |
| `traefik:v3.4` | `infra/prod/docker-compose.yml` → `traefik` | Official image | Prod deploy | **UNKNOWN** (not inspected locally) | Traefik v3 CLI flags | Pinned minor `v3.4` | — | Not required for local accounting provision |
| `tecnativa/docker-socket-proxy:latest` | `infra/prod/docker-compose.yml` → `socket-proxy` | Upstream | Prod deploy | **UNKNOWN** | Proxy default | **FLOATING `latest`** | — | Prod worker `DOCKER_HOST` only |
| `stockix-api:latest` | `infra/prod/docker-compose.yml` → `api`, `api-bullmq` | `apps/api/Dockerfile` | Prod `docker compose build` | **NO** | `node dist/index.js` | `node:22-alpine` | `build`→`runner` | Dev uses host `pnpm dev`, not image |
| `stockix-dashboard:latest` | `infra/prod/docker-compose.yml` → `dashboard` | `apps/dashboard/Dockerfile` | Prod build | **NO** | `node server.js` (Next standalone) | `node:22-alpine` | multi-stage | Dev uses host process |
| `stockix-infra-worker:latest` | `infra/prod/docker-compose.yml` → `infra-worker` | `infra/worker-service/Dockerfile` | Prod build | **NO** | `node worker.js` | `node:22-alpine` | `base`→`build`→`worker` | Dev uses `infra/worker-service/.runtime/worker.js` |
| `alpine:3.20` | `infra/prod/docker-compose.yml` → `db-backup` | Official | Prod deploy | **UNKNOWN** | cron sidecar | Pinned minor | — | Not in provision path |
| `stockix-webapp:local` | *(not in current tenant-stack)* | `services/stockix-finance/packages/webapp/Dockerfile` | Legacy prebuild (removed) | **YES** (85 MB) | — | `node:22-bookworm-slim` | — | **STALE** — old per-tenant image, unused |
| `stockix-nginx:local` | *(not in current tenant-stack)* | — | Legacy | **YES** (280 MB) | — | — | — | **STALE** — old per-tenant image |

**Local networks (provision-related):** `stockix-shared` **EXISTS**, `stockix_public` **EXISTS** (verified via `docker network inspect`).

---

### 1.2 Build Scripts Inventory

| Script | Location | Exact command |
|--------|----------|---------------|
| `pnpm docker:prebuild` | Root `package.json` | `node scripts/prebuild-tenant-images.mjs` |
| `pnpm docker:prebuild:force` | Root `package.json` | `node scripts/prebuild-tenant-images.mjs --force` |
| `pnpm docker:check` | Root `package.json` | `node scripts/prebuild-tenant-images.mjs --verify` |
| `pnpm pos:images:build` | Root `package.json` | `node scripts/build-pos-tenant-images.mjs` |
| `pnpm pos:images:build:stub` | Root `package.json` | `node scripts/build-pos-tenant-images.mjs -- --stub-frontend` |
| Prebuild — server | `scripts/prebuild-tenant-images.mjs:133` | `docker build -t stockix-server:local -f packages/server/Dockerfile --target app .` |
| Prebuild — migration | `scripts/prebuild-tenant-images.mjs:143` | `docker build -t stockix-database-migration:local -f packages/server/Dockerfile --target migration .` |
| Prebuild — base pulls | `scripts/prebuild-tenant-images.mjs:111-112` | `docker pull node:22-bookworm-slim`; `docker pull node:22-alpine` |
| POS — compose build | `scripts/build-pos-tenant-images.mjs:104` | `docker compose -f infra/pos-tenant-stack/docker-compose.yml -p stockix-pos-image-build build <services>` |
| POS — stub frontend | `scripts/build-pos-tenant-images.mjs:93` | `docker build -t stockix-pos-frontend:local -f infra/pos-tenant-stack/Dockerfile.pos-frontend-stub <ROOT>` |
| Worker image (prod) | `infra/prod/docker-compose.yml` | `docker compose build infra-worker` (image `stockix-infra-worker:latest`) |
| API image (prod) | `infra/prod/docker-compose.yml` | `docker compose build api` |
| Dashboard image (prod) | `infra/prod/docker-compose.yml` | `docker compose build dashboard` |

No `docker build` scripts in `services/stockix-finance/package.json` or `infra/worker-service/package.json`.

---

### 1.3 Image Issues

| Severity | Image / area | Issue |
|----------|--------------|-------|
| **PASS** | `stockix-database-migration:local` | CMD uses `/bin/sh` on Alpine; locally rebuilt and inspected |
| **PASS** | `stockix-server:local` | Multi-stage (`deps`→`build-app`→`app`); context `services/stockix-finance`; `.dockerignore` present |
| **PASS** | `stockix-pos-backend:local` | Multi-stage; context repo root; CMD `node app.js` (no bash) |
| **PASS** | `stockix-pos-frontend:local` | Built successfully locally; root `.dockerignore` no longer strips `pos-frontend2/src/` |
| **MEDIUM** | All `node:22-alpine` local builds | Floating tag, not digest-pinned |
| **MEDIUM** | `stockix-server:local` / migration | Large images (~300 MB each); expected for Finance webpack bundle |
| **MEDIUM** | `stockix-webapp:local`, `stockix-nginx:local` | Present locally but **not referenced** by current tenant-stack — cleanup candidate |
| **HIGH** | `tecnativa/docker-socket-proxy:latest` | Floating tag in prod worker path |
| **HIGH** | `nginx:alpine` (shared) | Floating tag |
| **HIGH** | Prod `stockix-*:latest` | Not built locally; irrelevant to `pnpm dev` provision |

**`.dockerignore` summary:**

| Context | Path | Excludes |
|---------|------|----------|
| Finance server build | `services/stockix-finance/.dockerignore` | `node_modules`, `build/`, tests, `.env`, docs — **does not** exclude `packages/server/src` |
| POS frontend build | Root `.dockerignore` | Excludes finance tree, PMS src, POS tests; **includes** `pos-frontend2/src` and `packages/ui` |
| Control-plane API/worker | Root `.dockerignore` | Excludes `services/stockix-finance/` entirely for api/dashboard/worker images |

---

### 1.4 Worker Image (`infra/worker-service/Dockerfile`)

| Check | Result |
|-------|--------|
| Multi-stage | **YES** — `base` → `build` → `worker` |
| `docker` CLI in final image | **YES** — `apk add docker-cli docker-cli-compose` in `worker` stage |
| `docker compose` V2 plugin | **YES** — `docker-cli-compose` package |
| pnpm version | **9.15.9** via `corepack prepare` in `base` stage |
| Final artifact | **YES** — copies only `infra/worker-service/.runtime/worker.js` |
| Build verification | `RUN test -f infra/worker-service/.runtime/worker.js` |
| Final image size (design target) | ~180 MB (comment); not built locally in this audit |
| `DOCKER_HOST` | Set only in **prod** compose (`tcp://socket-proxy:2375`); local dev uses host socket |
| Exists locally as `stockix-infra-worker:latest` | **NO** — dev runs bundled `worker.js` via `pnpm dev` |

---

## PART 2 — Provisioning Logic

### 2.1 Accounting Provision — Step Table

Path: `POST /tenants` → worker job `tenant.provision` → `executeProvisionRuntime()` in `infra/worker-service/src/provision-runtime.ts` (when `shouldProvisionFinanceStack(modules)` is true).

| Step | operationKey | What it does | Docker command | Can fail because | Rollback? |
|------|--------------|--------------|----------------|------------------|-----------|
| Start | — | Log start, mkdir finance paths | — | FS permissions | No |
| Secrets | — | Generate JWT, DB passwords, Agenda creds | — | — | No |
| Module env | — | `assertProvisionModuleEnv(licensedModules)` | — | Missing `POS_PLATFORM_API_KEY` if POS in modules | No |
| DB insert | — | `allocateTenantPort`, insert `tenants` + `tenant_deployments`, status `provisioning` | — | Slug exists, port exhaustion | No (throws before side effects) |
| Write `.env` | — | `writeTenantEnvFileAtomic(join(tenantEnvRoot, slug), tenantEnvMap)` | — | Disk permissions | No |
| Image gate | — | `assertRequiredTenantImages()` | — | Missing `stockix-server:local` or `stockix-database-migration:local` | No |
| Network preflight | — | `ensureTenantExternalNetworks(log)` | `docker network create` if missing | Docker daemon down | No (throws) |
| Preflight cleanup | `preflight.cleanup` | `docker compose down --remove-orphans -v` | See §2.4 invocation #1 | Stale project (non-fatal `.catch`) | N/A |
| **Data step** | `docker.data_step` | `provisionTenantDatabases(slug, password)` — MySQL CREATE DB/USER/GRANT + Mongo TCP ping | **No compose** — `mysql2` from host/worker to `WORKER_SHARED_MYSQL_HOST:3306` | Wrong host, missing `SHARED_MYSQL_ROOT_PASSWORD`, SQL error | **YES** — `deprovisionTenantDatabases` if journal has `docker.data_step` |
| **Migration** | `docker.migration_step` | One-shot system DB migrations | See §2.4 invocation #2 | Bad image CMD, network missing, MySQL unreachable, migration SQL error | **YES** — compose down + DB deprovision |
| **App step** | `docker.app_step` | Start Finance server container | See §2.4 invocation #3 | Image missing, port bind, network missing, container crash | **YES** |
| Network connect | `docker.network_connect` | `docker network connect stockix_internal <project>-server-1` | **Not compose** | `stockix_internal` absent in local dev (warn + fallback) | Partial — logged warn, continues |
| Health check | `tenant.health_check` | HTTP poll Finance `/api/ping` via internal URL | — | Server not ready, Mongo connect fail in server | **YES** |
| Bootstrap admin | `tenant.bootstrap_admin` | `finance.registerBootstrapAdmin()` | — | `INTERNAL_API_SECRET` missing, API errors | **YES** |
| Fetch org settings | `tenant.fetch_org_settings` | Optional inherit from parent tenant | — | Parent unreachable | Non-fatal — defaults |
| Build organization | `tenant.build_organization` | `finance.buildOrganization()` | — | License sync fail, Finance API errors | **YES** |
| Activate warehouses | `tenant.activate_warehouses` | Finance internal API | — | API errors | **YES** |
| Seed POS defaults | `tenant.seed_pos_defaults` | Finance internal API (if POS module) | — | API errors | **YES** |
| Edge publish | `edge.publish` | Write Traefik dynamic YAML | — | Port conflict, filesystem | **YES** |
| POS step | `pos.*` | See §2.2 (if `pos` in modules) | Separate compose project | POS-specific | Partial tenant if accounting+POS |
| Wire integration | `tenant.wire_pos_integration` | BigCapital/POS wiring | — | Missing finance IDs | Partial status |
| Finalize | — | `tenants.status = active`, deployment `active` | — | — | — |

**Journal/resume:** Each `markOp(operationKey)` persists to provision journal; `hasOp(key)` skips completed steps on retry.

**Rollback trigger:** `catch` at `provision-runtime.ts:2362-2369` calls `rollbackProvision()` when `tenantId` exists and `sideEffectsStarted` may pass `composeCtx`.

---

### 2.2 POS Provision — Step Table

Entry: `runPosProvisionStep()` → `provisionPosStackTracked()` → `provisionPosStack()` in `infra/worker-service/src/module-stacks.ts`.

**Guard:** Runs only if `licensedModules.includes("pos")` && `tenantId` defined. For accounting+POS, runs **after** Finance steps (`edge.publish`). For POS-only path, runs after `writeTenantEnvFileAtomic` without Finance compose.

| Step | What it does | Images required | Env vars needed | Can fail because |
|------|--------------|-----------------|-----------------|------------------|
| Port allocation | `allocateTenantPort` ×2 (backend + frontend) | — | — | Port exhaustion |
| Read tenant `.env` | `readTenantEnvFile(slug)` — **requires accounting step wrote file first** (or POS-only path wrote it) | — | `MONGODB_URI`, `REDIS_URL`, `REDIS_KEY_PREFIX` must exist in file | Missing vars → explicit throw |
| Image gate | `docker image inspect stockix-pos-backend:local` | `stockix-pos-backend:local` | — | Image not built |
| Frontend gate | If `stockix-pos-frontend:local` exists, reject stub label | `stockix-pos-frontend:local` (optional) | — | Stub image → throw |
| Compose up | `docker compose up -d --no-build <services>` | backend image; frontend optional | Merged `tenantEnv` + runtime vars (see below) | Network external missing, env blank, container health fail |
| Bootstrap org | `bootstrapPosOrganization()` HTTP to POS backend | Running `pos-backend` | `POS_PLATFORM_API_KEY`, `AUTH_TOKEN_SECRET`, `TENANT_ID` | Backend not healthy, API errors |
| Traefik (prod) | `writePosTraefikConfig` if `rootDomain !== "localhost"` | — | Port availability | Port conflict |

**`upServices` list (code `module-stacks.ts:377-389`):**

```
pos-backend
pos-platform-worker
pos-bigcapital-worker
[pos-frontend]  // only if stockix-pos-frontend:local exists and not stub
```

**Compose service names in `infra/pos-tenant-stack/docker-compose.yml`:** `pos-backend`, `pos-platform-worker`, `pos-bigcapital-worker`, `pos-frontend` — **MATCH**.

**Env injected at POS compose (beyond tenant `.env`):**

```javascript
COMPOSE_PROJECT_NAME: stockix-pos-{slug}
STOCKIX_REPO_ROOT, POS_APP_ROOT
POS_HOST_PORT, POS_FRONTEND_HOST_PORT  // allocated ports
TENANT_ID, AUTH_TOKEN_SECRET, POS_PLATFORM_API_KEY
POS_BACKEND_URL, POS_FRONTEND_URL, CORS_ORIGINS, ROOT_DOMAIN
RESEND_API_KEY, RESEND_FROM_EMAIL
FINANCE_INTERNAL_BASE_URL  // if financeInternalPort > 0
```

**Networks declared external in POS compose:** `stockix-shared`, `stockix_public` — both must exist (same as accounting).

**Accounting-before-POS guard:** Accounting+POS path completes Finance stack before `runPosProvisionStep` at line 2179. POS-only path writes `.env` then calls POS directly at line 1319. `provisionPosStack` does **not** re-run accounting compose.

---

### 2.3 ENV Map Completeness

#### ACCOUNTING (`buildTenantEnvMap` in `tenant-env.ts`)

| Variable group | Keys | PASS/FAIL | Notes |
|----------------|------|-----------|-------|
| MySQL | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `SYSTEM_DB_*`, `TENANT_DB_*` | **PASS** | `DB_HOST` = `SHARED_MYSQL_HOST` default `stockix-mysql` (reachable on `stockix-shared`) |
| Mongo | `MONGODB_DATABASE_URL`, `MONGODB_URI` | **PASS** | `mongodb://stockix-mongo:27017/{slug}_pos?replicaSet=rs0&directConnection=true` — per-slug DB |
| Redis | `REDIS_HOST`, `REDIS_URL`, `REDIS_KEY_PREFIX`, `QUEUE_HOST`, `QUEUE_PORT` | **PASS** | Prefix `tenant:{slug}:` |
| Auth | `JWT_SECRET`, `INTERNAL_API_SECRET`, `DEPLOYMENT_SECRET_KEY` | **PASS** | From provision params / `apiConfig` |
| URLs | `BASE_URL`, `PUBLIC_BASE_URL` | **PASS** | `https://{slug}.{ROOT_DOMAIN}` |
| Migration | `DB_ROOT_PASSWORD` | **PASS** | Passed to `database_migration` service in compose |
| Mail / S3 / signup | `MAIL_*`, `S3_*`, `SIGNUP_*` | **PASS** | Optional mail warns if empty |

**Tenant `.env` path construction:**

```typescript
tenantEnvRoot = defaultTenantEnvRoot()  // apiConfig.tenantEnvRoot || ~/.stockix/tenants (win) || /opt/stockix/tenants (prod)
envPath = join(tenantEnvRoot, slug, ".env")
```

Observed in failed provision logs: `C:\Users\Jad\Desktop\stokcix\tenants\dajo\.env` → **`TENANT_ENV_ROOT` overridden** in `.env` (not default `~/.stockix/tenants`).

#### POS (from tenant `.env` + `provisionPosStack` merge)

| Variable | Required by POS compose | In tenant `.env`? | PASS/FAIL |
|----------|-------------------------|-------------------|-----------|
| `MONGODB_URI` | `pos-backend`, workers | **YES** (same as `MONGODB_DATABASE_URL`) | **PASS** |
| `REDIS_URL` | all POS services | **YES** | **PASS** |
| `REDIS_KEY_PREFIX` | all POS services | **YES** | **PASS** |
| `QUEUE_HOST` / `QUEUE_PORT` | Not in POS compose env list | In tenant `.env` but unused by POS compose | **N/A** — POS uses `REDIS_URL` |
| `FINANCE_INTERNAL_BASE_URL` | `pos-backend`, workers (optional `:-`) | **NOT in tenant `.env`** — injected at compose time from `buildFinanceInternalUrlForPos()` when `financeInternalPort > 0` | **PASS** (runtime injection) |
| `POS_BIGCAPITAL_URL` | — | **Does not exist in codebase** — replaced by `FINANCE_INTERNAL_BASE_URL` | **N/A** |
| `AUTH_TOKEN_SECRET` | workers | Injected from `apiConfig.authTokenSecret` at compose time | **PASS** |
| `POS_PLATFORM_API_KEY` | all | Injected from `posConfig.platformApiKey` | **PASS** |
| `TENANT_ID` | all | Injected at compose time | **PASS** |
| `POS_BACKEND_URL`, `POS_FRONTEND_URL` | backend | Built from allocated ports | **PASS** |

---

### 2.4 Compose Command Construction

**Builder:** `ExecaDockerComposeRunner.run()` in `infra/worker-service/domain/provisioning/adapters/execa-docker-compose-runner.ts`

**Exact argv pattern (accounting):**

```
docker compose -f <composeFile> -p <project> --env-file <envPath> <args...>
```

**Accounting constants (slug `dajo` example):**

| Field | Value |
|-------|-------|
| `composeFile` | `{repoRoot}/infra/tenant-stack/docker-compose.yml` |
| `project` | `stockix-dajo` (`composeProjectName(slug)`) |
| `envPath` | `{TENANT_ENV_ROOT}/dajo/.env` |
| `composeEnv` | Full `tenantEnvMap` + `COMPOSE_PROJECT_NAME` (passed as subprocess `env`, merged with host env via `extendEnv: true`) |

| # | When | Args | Mode | Services | env-file exists? | On non-zero exit |
|---|------|------|------|----------|------------------|------------------|
| 1 | Preflight | `down --remove-orphans -v --timeout 10` | down | all | After `writeTenantEnvFileAtomic` — **YES** | `.catch(() => undefined)` — non-fatal |
| 2 | `docker.migration_step` | `run --rm database_migration` | run | `database_migration` | **YES** | Throws → `rollbackProvision` |
| 3 | `docker.app_step` | `up -d --remove-orphans --force-recreate --no-build server` | up | `server` | **YES** | Throws → rollback |

**Exact migration command as constructed:**

```
docker compose -f "C:\Users\Jad\Desktop\stokcix\stockixnew\infra\tenant-stack\docker-compose.yml" -p stockix-dajo --env-file "C:\Users\Jad\Desktop\stokcix\tenants\dajo\.env" run --rm database_migration
```

**Migration container networks (compose file):** only `stockix-shared` (not `stockix_public`). Compose still validates external `stockix_public` definition at file level.

**POS compose (different — no `--env-file`):**

```
docker compose -f {repoRoot}/infra/pos-tenant-stack/docker-compose.yml -p stockix-pos-{slug} up -d --no-build pos-backend pos-platform-worker pos-bigcapital-worker [pos-frontend]
```

Env passed via `execa({ env: composeEnv })` only — includes merged `readTenantEnvFile(slug)` + runtime overrides.

**Rollback compose down (`rollbackProvision`):**

```
docker compose -f <composeFile> -p <project> --env-file <envPath> down --remove-orphans -v --timeout 30
```

Runs if `journalState.completedOps.has("docker.data_step")` → also `deprovisionTenantDatabases(slug)`.

---

### 2.5 Network Preflight

**File:** `infra/worker-service/domain/provisioning/ensure-tenant-networks.ts`

| Check | Result |
|-------|--------|
| Called before compose? | **YES** — once per provision in `executeProvisionRuntime` at line 1457, **after** `assertRequiredTenantImages`, **before** preflight `compose down` |
| Called before EVERY compose command? | **NO** — single call per provision attempt (sufficient — networks persist) |
| Creates `stockix-shared` if missing? | **YES** — `docker network create stockix-shared` |
| Creates `stockix_public` if missing? | **YES** — `docker network create stockix_public` |
| Failure handling | `execa` throws → provision aborts → `rollbackProvision` in catch |
| Also created by | `infra/shared/docker-compose.yml` (`stockix_public` network + nginx attachment); `scripts/dev-stockix.mjs` `ensureDockerNetwork("stockix_public")` |

**Verdict:** **PASS** (with note: `stockix_internal` is **not** pre-created — optional `docker network connect` step warns and falls back in local dev).

---

### 2.6 Specific Checks Table

| Check | Result | File | Notes |
|-------|--------|------|-------|
| Migration CMD uses `/bin/sh` not `/bin/bash` | **PASS** | `services/stockix-finance/packages/server/Dockerfile:35` | Local image inspected: `Cmd: ["/bin/sh","-c",...]` |
| `database_migration` does NOT `depends_on: server` | **PASS** | `infra/tenant-stack/docker-compose.yml` | `depends_on` block removed |
| `stockix_public` external in tenant-stack | **PASS** | `infra/tenant-stack/docker-compose.yml:153-155` | `external: true`, `name: stockix_public` |
| `stockix-shared` external in tenant-stack | **PASS** | `infra/tenant-stack/docker-compose.yml:149-151` | |
| Worker preflight before compose | **PASS** | `provision-runtime.ts:1456-1457` | `assertRequiredTenantImages` then `ensureTenantExternalNetworks` |
| POS compose image names | **PASS** | `infra/pos-tenant-stack/docker-compose.yml` | `stockix-pos-backend:local`, `stockix-pos-frontend:local` |
| POS `upServices` matches compose services | **PASS** | `module-stacks.ts:377-389` vs pos compose | All four names align |
| Finance server joins `stockix_internal` after `app_step` | **PARTIAL** | `provision-runtime.ts:1563-1583` | `docker network connect stockix_internal {project}-server-1` — **fails silently in local dev** if network absent; falls back to `host.docker.internal` |
| `TENANT_ENV_ROOT` set and path exists | **PASS** (when configured) | `env-paths.ts`, logs | User uses `C:\Users\Jad\Desktop\stokcix\tenants`; file written before compose |
| Rollback `compose down -v` after `docker.data_step` | **PASS** | `provision-runtime.ts:379-514` | `deprovisionTenantDatabases` when journal has `docker.data_step` |

---

## CRITICAL FINDINGS (blocks provision right now)

1. **None code-level for accounting-only** if prerequisites met — migration `/bin/sh` fix is in Dockerfile **and** local image rebuilt; networks exist; required images exist locally.

2. **Operational — API restart during provision** (`tsx watch` on `pnpm dev`): mid-provision API drop causes dashboard logout and worker `API unreachable` — not an image bug but blocks operator experience. Restart `pnpm dev` and retry.

---

## HIGH FINDINGS (will fail at runtime)

1. **Finance server Mongo startup** — server `loaders/index.ts` connects Mongoose **5.10** to **MongoDB 6.0** at container start (`docker.app_step` / `tenant.health_check`). May fail after migration succeeds.

2. **`stockix_internal` network absent in local dev** — `docker.network_connect` warns and uses `host.docker.internal` fallback; health check usually still works on Windows/Mac.

3. **POS stub frontend** — if `stockix-pos-frontend:local` has label `io.stockix.image=pos-frontend-stub`, provision **throws** even if image exists.

---

## MEDIUM FINDINGS (partial / degraded)

1. **`pnpm docker:prebuild` skips rebuild** when images exist — Dockerfile fixes require `--force` or manual `docker build`.

2. **Stale local images** `stockix-webapp:local`, `stockix-nginx:local` — confuse operators running `docker images`; not used by provision.

3. **POS compose does not use `--env-file`** — relies on `readTenantEnvFile` + env merge; if `.env` on disk stale vs memory, disk wins at read time.

4. **Large Finance images (~2 GB reported by Docker Desktop)** — slow `compose up` but functional.

---

## PASSED CHECKS

- Required accounting images exist locally: `stockix-server:local`, `stockix-database-migration:local`
- POS images exist locally: `stockix-pos-backend:local`, `stockix-pos-frontend:local`
- Migration CMD `/bin/sh` verified in running image
- External networks `stockix-shared`, `stockix_public` exist
- `ensureTenantExternalNetworks` wired before compose
- `database_migration` independent of `server` service
- `buildTenantEnvMap` complete for accounting compose + migration
- POS `upServices` names match compose file
- `assertRequiredTenantImages` fails fast before slow implicit builds
- Rollback tears down compose + shared DB when `docker.data_step` journaled

---

## Provision Readiness

### Accounting-only (`dajo`)

**GO** — conditional on:

1. `stockix-database-migration:local` is the **rebuilt** image (CMD `/bin/sh`) — **currently YES** locally
2. `stockix-server:local` present — **YES**
3. `stockix-shared` + `stockix_public` networks — **YES**
4. `SHARED_MYSQL_ROOT_PASSWORD` + `WORKER_SHARED_MYSQL_HOST=127.0.0.1` in worker env — required for `docker.data_step` on host
5. API/worker stable during provision (no hot-reload restart)

**Risk:** `tenant.health_check` may fail on Finance Mongo/Mongoose mismatch — monitor logs after migration step.

### POS module

**GO** — conditional on:

1. All accounting prerequisites above (for accounting+POS modules)
2. `stockix-pos-backend:local` — **YES** locally
3. `stockix-pos-frontend:local` — **YES** locally (verify **not** stub via `docker image inspect` labels)
4. Tenant `.env` written with `MONGODB_URI`, `REDIS_URL`, `REDIS_KEY_PREFIX` before `provisionPosStack`
5. `FINANCE_INTERNAL_BASE_URL` injected when `financeInternalPort > 0` (accounting+POS path)

**NO-GO** if: POS backend image missing; frontend is stub; tenant `.env` missing shared-infra URLs.

---

*Audit method: repository file read + `docker image inspect` / `docker network inspect` on local machine 2026-06-05.*

---

## Repairs Applied (2026-06-05)

| Repair | Description | Status |
|--------|-------------|--------|
| 1 — Mongoose 5→6 | Bump `mongoose` to `^6.12.9`, remove v5 connect options, Dockerfile rebuild comment, `pnpm install` in `services/stockix-finance` | **DONE** (manual image rebuild still required) |
| 2 — Worker MySQL/Mongo host | `WORKER_SHARED_*` helpers in `provisioner.ts`, dev warn log, `.env.example` docs, `dev-ports.yml` header comment | **DONE** |
| 3 — stockix_internal fallback | `localDevFallback` + `host.docker.internal:{port}` in `provision-runtime.ts` when network connect fails in non-production | **DONE** |
| 4 — POS stub error | `ProvisionError` class + actionable message in `module-stacks.ts`; `POS_FRONTEND_STUB_IMAGE` treated as permanent in `worker.ts` | **DONE** |
| 5 — Stale image cleanup | `scripts/cleanup-stale-images.mjs` + `pnpm docker:cleanup` for `stockix-webapp:local`, `stockix-nginx:local` | **DONE** |

---

## Post-Repair Checklist

### 1. Rebuild Finance Docker images (Repair 1)

After the Mongoose 6 upgrade, rebuild both tenant images:

```bash
cd services/stockix-finance
docker build -t stockix-server:local -f packages/server/Dockerfile --target app .
docker build -t stockix-database-migration:local -f packages/server/Dockerfile --target migration .
```

Or from repo root: `pnpm docker:prebuild:force`

### 2. Rebuild worker bundle (Repairs 3–4)

```bash
pnpm infra:worker:build
```

Restart `pnpm dev` so the host-run worker loads the new bundle.

### 3. Required `.env` variables

| Variable | Purpose |
|----------|---------|
| `WORKER_SHARED_MYSQL_HOST` | `127.0.0.1` when worker runs on host (published MySQL port) |
| `WORKER_SHARED_MONGO_HOST` | `127.0.0.1` when worker runs on host (published Mongo port) |
| `SHARED_MYSQL_ROOT_PASSWORD` | Root password for shared MySQL — required for `docker.data_step` |
| `TENANT_ENV_ROOT` | Directory where per-tenant `.env` files are written |

`pnpm dev` (`scripts/dev-stockix.mjs`) sets `WORKER_SHARED_*` defaults when unset.

### 4. Retry tenant provision

- Dashboard: trigger provision for tenant (e.g. `dajo`), or
- API: `POST /tenants` with `Idempotency-Key` header

### 5. Worker log milestones (success path)

Watch for these steps in order:

1. `docker.data_step` — shared MySQL/Mongo DBs created for tenant
2. `docker.migration_step` — `database_migration` container completes
3. `docker.app_step` — `server` container started
4. `tenant.health_check` — `/api/ping` returns 200 (Mongoose 6 + Mongo 6 compatibility proof)

### 6. Optional cleanup

```bash
pnpm docker:cleanup
```

Removes stale `stockix-webapp:local` and `stockix-nginx:local` images if present.
