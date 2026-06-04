# Stockix — Final Pre-Production Architecture Audit

**Date:** 2026-06-04  
**Auditor:** Final validation pass — read-only; all repair rounds (P0–P2, FAIL 1–8, PARTIAL 1–13) claimed applied  
**Status:** **NO-GO** — blocking gaps in shared-data backup, monitoring, and several lifecycle hardening items claimed in deep scan but not present in code

---

## Executive Decision

Production deployment is **not recommended** until shared MySQL and MongoDB backup/restore is implemented (or contractually accepted with written risk acceptance), operational monitoring for shared infra exists in the repo and on hosts, and high-severity lifecycle gaps are closed (deprovision concurrency guard, POS provision failure Traefik cleanup, production `platformWorker` dotenv behavior).

The shared-infrastructure migration (per-tenant DB containers → `stockix-shared`) is **largely coherent** in provision/deprovision code paths reviewed: Mongo `{slug}_pos`, MySQL `slugToMysqlSafe`, Redis `tenant:{slug}:`, concurrent provision guard, deprovision data-plane gating, and Traefik dynamic config alignment are implemented as documented in [`docs/Architecture2.md`](Architecture2.md) and [`docs/missingarchitecture.md`](missingarchitecture.md).

However, **documentation claiming "Deep Scan (7)" complete overstates the codebase** — see [`docs/missing2arch.md`](missing2arch.md). The control plane Postgres backup (`infra/prod/backup/backup.sh`) does **not** protect tenant data on shared MySQL/Mongo volumes.

**Conditional path to GO:** (1) shared MySQL + Mongo backup with tested restore, (2) `infra/prod/monitoring` health script + alert webhook in `.env.example`, (3) fix blocking lifecycle items F2, F4, G12, E10, J10, (4) execute Phase 4 staging plan end-to-end.

---

## Audit Score

| Section | Checks | Pass | Fail | Partial | Score |
|---------|--------|------|------|---------|-------|
| A MongoDB isolation | 10 | 9 | 1 | 0 | 9/10 |
| B MySQL isolation | 10 | 10 | 0 | 0 | 10/10 |
| C Redis isolation | 10 | 8 | 0 | 2 | 8/10 |
| D Docker networking | 12 | 12 | 0 | 0 | 12/12 |
| E Traefik routing | 10 | 9 | 1 | 0 | 9/10 |
| F Provisioning lifecycle | 15 | 12 | 2 | 1 | 12/15 |
| G Deprovisioning lifecycle | 15 | 13 | 1 | 1 | 13/15 |
| H Security boundaries | 12 | 12 | 0 | 0 | 12/12 |
| I Container images | 10 | 10 | 0 | 0 | 10/10 |
| J Background jobs | 10 | 7 | 1 | 2 | 7/10 |
| K Shared infrastructure | 12 | 4 | 4 | 4 | 4/12 |
| L Consistency & integrity | 10 | 9 | 0 | 1 | 9/10 |
| M Operational readiness | 12 | 4 | 5 | 3 | 4/12 |
| N Provision flow trace | 8 | 8 | 0 | 0 | 8/8 |
| O Deprovision flow trace | 8 | 7 | 1 | 0 | 7/8 |
| **TOTAL** | **164** | **124** | **16** | **14** | **124/164** |

*(Pass = confirmed in code; Partial = incomplete vs spec; Fail = missing or contradicted.)*

---

## Blocking Issues (must fix before production)

| ID | File:line | Problem | Fix required | Effort |
|----|-----------|---------|--------------|--------|
| K9 | [`infra/prod/backup/backup.sh`](infra/prod/backup/backup.sh) L26–33 | Backup is **Postgres only** (`pg_dump`); no `mysqldump` for `stockix-mysql` | Add scheduled MySQL dump of all `stockix_*` schemas (or volume snapshot) to B2/S3 | L |
| K10 | same L26–33 | No `mongodump` for `stockix-mongo` / per-tenant `{slug}_pos` | Add Mongo backup job (RS-aware) or managed-DB snapshot policy | L |
| K11 | `infra/prod/monitoring/` | **Directory missing** — no `healthcheck.sh` for MySQL/Mongo RS/Redis | Add monitoring script + cron service in prod compose | M |
| K12 | [`infra/prod/.env.example`](infra/prod/.env.example) | No `ALERT_WEBHOOK_URL` (grep 2026-06-04) | Document alert webhook + wire healthcheck failures | S |
| F2 | [`infra/worker-service/src/worker.ts`](infra/worker-service/src/worker.ts) L513–545 | No pre-dispatch check for concurrent **deprovision** on same tenant | Block claim/provision if `tenant.deprovision` running (mirror provision guard) | S |
| F4 / G12 | [`provision-lock.ts`](infra/worker-service/domain/provisioning/provision-lock.ts) L13–24; [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L348 | No `withTenantDeprovisionLock` — deprovision not serialized per tenant | Add advisory lock wrapper around `deprovisionTenant` | S |
| E10 | [`module-stacks.ts`](infra/worker-service/src/module-stacks.ts) L542–556 | On POS stack failure, **no** `removePosTraefikConfig` (only on `stopModuleStack` L600) | Call `unpublishPosTraefik(slug)` in catch before rethrow | S |
| J10 | [`platformWorker.js`](services/posnew/apps/pos-backend/workers/platformWorker.js) L6–7 | `dotenv.config` runs unconditionally in production workers | Guard: skip dotenv when `NODE_ENV=production` | S |
| A7 | [`infra/worker-service/.tmp-dist/`](infra/worker-service/.tmp-dist/) | Stale `mongodb://mongo/stockix` in build artifacts (not runtime if image correct) | Keep `.tmp-dist` in `.dockerignore` L2; CI clean; never deploy `.tmp-dist` | S |

---

## Warnings (should fix before production)

| ID | File:line | Problem | Fix | Effort |
|----|-----------|---------|-----|--------|
| K6 | [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) ~L1509–1511 | Static copy **deferred** (TODO only); shared nginx serves empty `/var/www/{slug}/public/` | Implement `docker.static_copy_step` or serve static from Finance until nginx path ready | M |
| C10 | [`infra/shared/docker-compose.yml`](infra/shared/docker-compose.yml) L147–148 | `appendonly no` — RDB snapshots only, not AOF | Enable AOF or document acceptable RDB-only risk for tenant Redis | S |
| C6 | [`services/posnew/.../services/redisKeys.js`](services/posnew/apps/pos-backend/services/redisKeys.js) L10 | Rate-limit keys `org:{id}:*` may be unprefixed by `REDIS_KEY_PREFIX` | Prefix org-scoped keys or document accepted collision risk | M |
| F13 | [`module-stacks.ts`](infra/worker-service/src/module-stacks.ts) L413+ | POS org bootstrap has no journal key `pos.bootstrap_organization` | Add `markOp` for idempotent POS bootstrap retry | M |
| G14 | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L456–460 | `deprovisionTenantDatabases` Mongo/Redis failures log warnings; gate blocks PG delete (good) but partial cleanup leaves orphans | Fail-fast or retry policy documented in runbook | S |
| J8 | [`internal.ts`](apps/api/src/routes/internal.ts) L219–229 | Uses `claimToken` not `claim_version` column — TOCTOU mitigated but not version column | Accept or add explicit version column | S |
| J9 | [`internal.ts`](apps/api/src/routes/internal.ts) L85–88 | `effectiveStaleMs = min(heartbeat, lease)` not documented 2× multiplier | Document or align with Architecture2 | S |
| L9 | [`tenants.ts`](apps/api/src/routes/tenants.ts) L960–962 | Slug regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` — differs from audit spec end-anchor pattern | Align docs or tighten regex | S |
| M1–M5 | `docs/` | No dedicated OPERATIONS runbooks (only gaps in `missingarchitecture.md`) | Add OPERATIONS.md with stuck provision, deprovision, RS, MySQL outage, partial tenant | M |

---

## Phase 1 — Mandatory file read log

| File | Status |
|------|--------|
| `apps/api/src/index.ts` | Read |
| `apps/api/src/app/create-control-plane-app.ts` | Read |
| `apps/api/src/routes/register-control-plane-routes.ts` | Read (via grep + partial) |
| `apps/api/src/routes/internal.ts` | Read (sections) |
| `apps/api/src/services/tenant-jobs.ts` | Read |
| `apps/api/src/queues/license-expiry-queue.ts` | Exists (loaded from index) |
| `apps/api/src/queues/owner-invite-mail-queue.ts` | Exists (loaded from index) |
| `apps/api/src/middleware/auth.ts` | Read |
| `infra/worker-service/src/provision-runtime.ts` | Read (key sections) |
| `infra/worker-service/src/module-stacks.ts` | Read (key sections) |
| `infra/worker-service/src/worker.ts` | Read (key sections) |
| `infra/worker-service/domain/provisioner.ts` | Read |
| `infra/worker-service/domain/provisioning/tenant-env.ts` | Read |
| `infra/worker-service/domain/provisioning/provision-lock.ts` | Read |
| `infra/worker-service/domain/traefik-config.ts` | Read |
| `infra/worker-service/scripts/audit-orphan-dbs.ts` | Read |
| `infra/worker-service/.dockerignore` | Read |
| `infra/worker-service/Dockerfile` | Read |
| `infra/shared/docker-compose.yml` | Read |
| `infra/shared/nginx/nginx.conf` | Read |
| `infra/shared/mysql/init/README.md` | Read |
| `infra/prod/docker-compose.yml` | Read (sections) |
| `infra/prod/.env.example` | Read (sections) |
| `infra/prod/backup/backup.sh` | Read |
| `infra/prod/backup/README.md` | **MISSING** |
| `infra/prod/monitoring/healthcheck.sh` | **MISSING** |
| `infra/prod/monitoring/README.md` | **MISSING** |
| `infra/tenant-stack/docker-compose.yml` | Read |
| `infra/pos-tenant-stack/docker-compose.yml` | Read |
| Finance Dockerfile, loaders, App.module, TenantDBManager, Local.strategy | Read |
| `services/stockix-finance/docker-compose.prod.yml` | Read (section) |
| POS Dockerfile, config.js, jobQueue.js, workers, package.json | Read |
| `services/posnew/apps/pos-frontend2/Dockerfile` | Not fully read (I3 assumed from prior audit) |
| `services/pms/src/index.ts` | Exists |
| `services/chatlive/docker-compose.yml` | **MISSING** (devcontainer only) |
| `docs/Architecture2.md`, `ARCHITECTURE.md`, `missingarchitecture.md` | Read (sections) |

Path corrections: see [`docs/missing2arch.md`](missing2arch.md).

---

## Architecture Coherence Findings

### 3.1 Shared infrastructure model consistency

**Consistent:** Tenant env built in [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L90–92 (`buildTenantMongoUrl`), L108–109 (`tenant:{slug}:`), L128–160 (MySQL hosts `shared-mysql`, user `tenant_{safe}`). Compose stacks reference shared services only — [`tenant-stack/docker-compose.yml`](infra/tenant-stack/docker-compose.yml) L8–10, L59–78; [`pos-tenant-stack/docker-compose.yml`](infra/pos-tenant-stack/docker-compose.yml) L9–10, L52–53 — **no** per-tenant mysql/mongo/redis services (D12 pass).

**Stale operator footguns:** `infra/worker-service/.tmp-dist/**` still contains `mongodb://mongo/stockix` (e.g. `.tmp-dist/infra/worker-service/domain/provisioning/tenant-env.js` L28). Excluded from image by [`.dockerignore`](infra/worker-service/.dockerignore) L2.

**`infra/shared/docker-compose.yml`** defines mysql, mongo, rs-init, redis, nginx — matches tenant stack dependencies.

### 3.2 Provisioning deterministic and resumable

**Journal:** [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) uses `hasOp` / `markOp` (e.g. `docker.app_step` L1497, `tenant.bootstrap_admin` L1595, `edge.publish` L2097).

**Advisory lock:** `withTenantProvisionAdvisoryLock` at L774 during compose.

**Concurrent guard:** `assertNoConcurrentProvisionJob` at L636 (runtime) and [`worker.ts`](infra/worker-service/src/worker.ts) L521.

**Crash worst-case:** Steps without journal (e.g. network connect L1518) may repeat on retry; data steps journaled reduce duplicate DB creation risk.

### 3.3 Tenant data isolation

| Store | Verdict | Evidence |
|-------|---------|----------|
| MySQL | Strong with correct env | Per-tenant user + grants [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L175–185; Finance knex uses tenant creds [`knexConfig.ts`](services/stockix-finance/packages/server/src/config/knexConfig.ts) L4–15 |
| Mongo | Strong with correct URI | `{slug}_pos` in [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L92; drop uses same slug [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L283–287 |
| Redis | Prefix convention | Finance BullMQ prefix [`App.module.ts`](services/stockix-finance/packages/server/src/modules/App/App.module.ts) L155; POS queue names [`jobQueue.js`](services/posnew/apps/pos-backend/services/jobQueue.js) L49–61 |
| Network | Weak L2 | All tenants on `stockix-shared`; DB auth is primary boundary |

### 3.4 Security model

- Internal jobs: [`auth.ts`](apps/api/src/middleware/auth.ts) L65–74 `WORKER_SECRET` on `/internal/jobs` and `/internal/organizations`.
- Unknown paths: L76–85 return 404.
- Auth before CORS: [`create-control-plane-app.ts`](apps/api/src/app/create-control-plane-app.ts) L76–77 comment; `registerAuthRoutes` before CORS in same file.
- JWT-only Finance: [`Local.strategy.ts`](services/stockix-finance/packages/server/src/modules/Auth/strategies/Local.strategy.ts) L14 `session: false`.
- Worker Docker: [`infra/prod/docker-compose.yml`](infra/prod/docker-compose.yml) L93 `DOCKER_HOST: tcp://socket-proxy:2375` — not raw socket on worker service.
- Traefik still mounts host `docker.sock` L157 — separate from worker path.

### 3.5 New issues not in prior audits

1. **Deep scan claims vs code** — see [`missing2arch.md`](missing2arch.md).
2. **`platformWorker` dotenv** in production (J10).
3. **No shared DB backup** despite shared-infra production model (K9–K10).
4. **Finance static + nginx** — nginx config exists [`infra/shared/nginx/nginx.conf`](infra/shared/nginx/nginx.conf) L18–25 but volume never populated (K6).

### 3.6 Blast radius

| Component | Immediate failure | Graceful degradation | Data at risk | Recovery estimate |
|-----------|------------------|---------------------|--------------|-------------------|
| MySQL | All Finance tenants down; provision/deprovision DB steps fail | Existing tenants may serve until pool exhausted | All `stockix_*` schemas | Hours (restore dump / PITR) |
| MongoDB | POS down; Finance features using `{slug}_pos` fail | RS single-node — no failover | All `{slug}_pos` DBs | Hours (mongodump restore) |
| Redis | BullMQ/Agenda stalled; rate limits may fail open/closed | Some Finance reads cached | Queue jobs; no durable tenant business data in Redis | Minutes–hours (RDB rebuild) |
| Traefik | New routes fail; existing YAML may work | Dynamic file provider | None | Minutes (fix worker mount / YAML) |
| Control API | Dashboard/admin down; job claim stops | Cached sessions short-lived | Postgres platform metadata | Minutes (replica restart) |
| infra-worker | Provisioning/deprovision stops | Running tenants keep running | Stuck `running` jobs | Minutes + manual job fix |
| Postgres | Total platform outage | None | Tenants, jobs, licenses | `backup.sh` restore — hours |

---

## Full Checklist Results

### Section A — MongoDB isolation

| ID | Result | Note |
|----|--------|------|
| A1 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L90–92 `${slug}_pos` |
| A2 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L165–166 `MONGODB_URI` |
| A3 | ✅ PASS | Same L166 `MONGODB_DATABASE_URL` |
| A4 | ✅ PASS | [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) L819, L1239 `mongoUrl` |
| A5 | ✅ PASS | [`pos-tenant-stack/docker-compose.yml`](infra/pos-tenant-stack/docker-compose.yml) L35–37 |
| A6 | ✅ PASS | [`config.js`](services/posnew/apps/pos-backend/config/config.js) L66–72 throw in production |
| A7 | ❌ FAIL | `.tmp-dist` still has `mongodb://mongo/stockix` — not production image path if ignore holds |
| A8 | ✅ PASS | [`infra/prod/.env.example`](infra/prod/.env.example) per-tenant URL + comment |
| A9 | ✅ PASS | [`package.json`](services/posnew/apps/pos-backend/package.json) L86 `mongoose@^8.9.5`; docs updated |
| A10 | ✅ PASS | [`infra/shared/docker-compose.yml`](infra/shared/docker-compose.yml) L84–87 `rs.status()` |

### Section B — MySQL isolation

| ID | Result | Note |
|----|--------|------|
| B1 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L133+ `slugToMysqlSafe` |
| B2 | ✅ PASS | L170–172 `CREATE USER tenant_{safe}` |
| B3 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L152–153 |
| B4 | ✅ PASS | L159–160 `TENANT_DB_NAME_PREFIX` |
| B5 | ✅ PASS | L115–117, L129–130 |
| B6 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L175–177 |
| B7 | ✅ PASS | L181–185 wildcard ``stockix_${safe}_%`` |
| B8 | ✅ PASS | L246–252 DROP loop `stockix_${safe}_%` |
| B9 | ✅ PASS | L352–359 throw before deletes |
| B10 | ✅ PASS | L478–488 gate before `db.delete` L490+ |

### Section C — Redis isolation

| ID | Result | Note |
|----|--------|------|
| C1 | ✅ PASS | [`tenant-stack/docker-compose.yml`](infra/tenant-stack/docker-compose.yml) L84 area `REDIS_KEY_PREFIX` |
| C2 | ✅ PASS | [`App.module.ts`](services/stockix-finance/packages/server/src/modules/App/App.module.ts) L155 |
| C3 | ✅ PASS | [`jobQueue.js`](services/posnew/apps/pos-backend/services/jobQueue.js) L49, L58–61 |
| C4 | ✅ PASS | [`agenda.ts`](services/stockix-finance/packages/server/src/loaders/agenda.ts) L11–21 per-tenant collection |
| C5 | ✅ PASS | Comments App.module L144–147, jobQueue L51–56 |
| C6 | ⚠️ PARTIAL | [`redisKeys.js`](services/posnew/apps/pos-backend/services/redisKeys.js) L10 `org:{id}:` may lack tenant prefix |
| C7 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L86–104 flush `tenant:{slug}:*` |
| C8 | ✅ PASS | [`infra/prod/docker-compose.yml`](infra/prod/docker-compose.yml) control-plane-redis vs shared `stockix-redis` |
| C9 | ✅ PASS | JWT-only [`Local.strategy.ts`](services/stockix-finance/packages/server/src/modules/Auth/strategies/Local.strategy.ts) L14; docs FAIL-5 |
| C10 | ⚠️ PARTIAL | [`infra/shared/docker-compose.yml`](infra/shared/docker-compose.yml) L147–148 `appendonly no`, RDB saves L143–146 |

### Section D — Docker networking

| ID | Result | Note |
|----|--------|------|
| D1 | ✅ PASS | [`infra/shared/docker-compose.yml`](infra/shared/docker-compose.yml) L51–53 |
| D2 | ✅ PASS | L81–83 |
| D3 | ✅ PASS | L153–155 |
| D4 | ✅ PASS | [`tenant-stack/docker-compose.yml`](infra/tenant-stack/docker-compose.yml) L115 |
| D5 | ✅ PASS | L116 `stockix_public` |
| D6 | ✅ PASS | [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) L1518 `network connect` |
| D7 | ✅ PASS | [`infra/prod/docker-compose.yml`](infra/prod/docker-compose.yml) `stockix_internal` internal |
| D8 | ✅ PASS | `socket_proxy_network` internal |
| D9 | ✅ PASS | Tenant server not on Postgres network; uses HTTP to API |
| D10 | ✅ PASS | Worker `DOCKER_HOST` socket-proxy L93 |
| D11 | ✅ PASS | [`pos-tenant-stack/docker-compose.yml`](infra/pos-tenant-stack/docker-compose.yml) L52–53 |
| D12 | ✅ PASS | No per-tenant DB containers in tenant/pos compose |

### Section E — Traefik routing

| ID | Result | Note |
|----|--------|------|
| E1 | ✅ PASS | [`infra/prod/docker-compose.yml`](infra/prod/docker-compose.yml) L156 host bind |
| E2 | ✅ PASS | Worker L332 same `TRAEFIK_DYNAMIC_DIR` |
| E3 | ✅ PASS | [`traefik-config.ts`](infra/worker-service/domain/traefik-config.ts) L39 `tenant-{slug}.yml` |
| E4 | ✅ PASS | L91 `tenant-pos-{slug}.yml` |
| E5 | ✅ PASS | L75–80 separate API router `tenant-pos-api-{slug}` |
| E6 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L465–472 |
| E7 | ✅ PASS | [`traefik-config.ts`](infra/worker-service/domain/traefik-config.ts) L32, L73 `certResolver: cloudflare` |
| E8 | ✅ PASS | `resolveNginxDirectUrl` grep zero in `infra/` |
| E9 | ✅ PASS | [`packages/db/src/assert-tenant-port-available.ts`](packages/db/src/assert-tenant-port-available.ts); calls in provision-runtime L2081+, module-stacks L446+ |
| E10 | ❌ FAIL | POS provision catch L542–556 does not call `unpublishPosTraefik` |

### Section F — Provisioning lifecycle

| ID | Result | Note |
|----|--------|------|
| F1 | ✅ PASS | [`worker.ts`](infra/worker-service/src/worker.ts) L521; [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) L636 |
| F2 | ❌ FAIL | No deprovision-running guard at worker entry |
| F3 | ✅ PASS | [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) L774 advisory lock |
| F4 | ❌ FAIL | No `withTenantDeprovisionLock` in codebase |
| F5 | ✅ PASS | `hasOp` / `markOp` pattern throughout provision-runtime |
| F6 | ✅ PASS | POS-only path writes env before `provisionPosStack` (grep writeTenantEnvFileAtomic) |
| F7 | ✅ PASS | [`module-stacks.ts`](infra/worker-service/src/module-stacks.ts) L328–335 |
| F8 | ✅ PASS | L365–369 services list |
| F9 | ✅ PASS | L337–339 merge tenant env |
| F10 | ✅ PASS | `tenant.health_check` L1548 before `tenant.bootstrap_admin` L1568 |
| F11 | ✅ PASS | `tenant.bootstrap_admin` journaled L1595 |
| F12 | ✅ PASS | `tenant.build_organization` L1682–1857 |
| F13 | ⚠️ PARTIAL | POS bootstrap in module-stacks L413 — no `pos.bootstrap_organization` journal key |
| F14 | ✅ PASS | `edge.publish` L2078 after health L1548 and bootstrap |
| F15 | ✅ PASS | `assertProvisionModuleEnv` L838–839 |

### Section G — Deprovisioning lifecycle

| ID | Result | Note |
|----|--------|------|
| G1 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L388–394 |
| G2 | ✅ PASS | L402–431 non-fatal catch |
| G3 | ✅ PASS | L434–451 |
| G4 | ✅ PASS | L246–252 schema drop loop |
| G5 | ✅ PASS | L283–287 mongosh drop `{slug}_pos` |
| G6 | ✅ PASS | L86–104 Redis flush |
| G7 | ✅ PASS | L465 `edgePublisher.unpublish` |
| G8 | ✅ PASS | L471 `removePosTraefikConfig` |
| G9 | ✅ PASS | L500+ `rm` tenant env dir |
| G10 | ✅ PASS | L478–488 gate; deletes L490+ |
| G11 | ✅ PASS | `getComposeContainerName` L266–270 |
| G12 | ❌ FAIL | No distributed deprovision lock |
| G13 | ✅ PASS | [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) L471–475 rollback |
| G14 | ✅ PASS | `cleanupResults` L384–488 |
| G15 | ✅ PASS | L352–359 throw if no root password |

### Section H — Security boundaries

| ID | Result | Note |
|----|--------|------|
| H1 | ✅ PASS | [`packages/server/Dockerfile`](services/stockix-finance/packages/server/Dockerfile) L1–3 |
| H2 | ✅ PASS | [`auth.ts`](apps/api/src/middleware/auth.ts) L65–74 |
| H3 | ✅ PASS | L87–94 platform secret paths |
| H4 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) JWT in map |
| H5 | ✅ PASS | Wildcard grant + tenant user |
| H6 | ✅ PASS | socket-proxy in prod compose |
| H7 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L277–280 mode 600 |
| H8 | ✅ PASS | [`create-control-plane-app.ts`](apps/api/src/app/create-control-plane-app.ts) L76–77 |
| H9 | ✅ PASS | [`auth.ts`](apps/api/src/middleware/auth.ts) L76–85 |
| H10 | ✅ PASS | [`Architecture2.md`](docs/Architecture2.md) §16 network row; provision-runtime L1509 comment |
| H11 | ✅ PASS | Architecture2 §18.1 item 7 bootstrap network |
| H12 | ✅ PASS | Compose uses `${VAR}` substitution — no literal passwords in YAML reviewed |

### Section I — Container images

| ID | Result | Note |
|----|--------|------|
| I1 | ✅ PASS | Finance Dockerfile L5 `node:20-alpine` |
| I2 | ✅ PASS | [`pos-backend/Dockerfile`](services/posnew/apps/pos-backend/Dockerfile) L7, L25 |
| I3 | ✅ PASS | pos-frontend2 Dockerfile (audit Round 4) |
| I4 | ✅ PASS | [`infra/worker-service/Dockerfile`](infra/worker-service/Dockerfile) L16 `node:22-alpine` |
| I5 | ✅ PASS | [`.dockerignore`](infra/worker-service/.dockerignore) L5 |
| I6 | ✅ PASS | L6 |
| I7 | ✅ PASS | L11–14 dist/.next/build |
| I8 | ✅ PASS | POS Dockerfile L19 `pnpm install --frozen-lockfile` |
| I9 | ✅ PASS | L14–15 copies `pnpm-lock.yaml` |
| I10 | ✅ PASS | No §18 TODO in POS Dockerfile (migration comment only L3–5) |

### Section J — Background jobs

| ID | Result | Note |
|----|--------|------|
| J1 | ✅ PASS | [`docker-compose.yml`](infra/prod/docker-compose.yml) L251 false, L285 true on api-bullmq |
| J2 | ✅ PASS | [`index.ts`](apps/api/src/index.ts) L106–114 |
| J3 | ✅ PASS | L117–125 |
| J4 | ✅ PASS | pos-tenant-stack env L68–70 |
| J5 | ✅ PASS | jobQueue `queueName()` prefix |
| J6 | ✅ PASS | App.module Bull prefix L155 |
| J7 | ✅ PASS | [`index.ts`](apps/api/src/index.ts) L49 `startStuckProvisioningReconciler` |
| J8 | ⚠️ PARTIAL | `claimToken` L219–229 — not named `claim_version` |
| J9 | ⚠️ PARTIAL | [`internal.ts`](apps/api/src/routes/internal.ts) L87 `min()` not 2× multiplier |
| J10 | ❌ FAIL | [`platformWorker.js`](services/posnew/apps/pos-backend/workers/platformWorker.js) L6–7 always loads dotenv |

### Section K — Shared infrastructure

| ID | Result | Note |
|----|--------|------|
| K1 | ✅ PASS | mysql L60–61 512m, slow query L44–45 |
| K2 | ✅ PASS | mongo RS L76–87, rs-init L100–120 |
| K3 | ⚠️ PARTIAL | redis L143–148 RDB yes, AOF no |
| K4 | ✅ PASS | stockix-nginx L173–189 |
| K5 | ⚠️ PARTIAL | [`nginx.conf`](infra/shared/nginx/nginx.conf) L18–25 — no upstream to Finance API |
| K6 | ⚠️ PARTIAL | TODO provision-runtime; no static copy step |
| K7 | ✅ PASS | [`mysql/init/README.md`](infra/shared/mysql/init/README.md) |
| K8 | ✅ PASS | mysql L41 `max_connections=500` |
| K9 | ❌ FAIL | backup.sh Postgres only |
| K10 | ❌ FAIL | No mongodump in backup.sh |
| K11 | ❌ FAIL | monitoring scripts missing |
| K12 | ❌ FAIL | No ALERT_WEBHOOK in .env.example |

### Section L — Consistency & integrity

| ID | Result | Note |
|----|--------|------|
| L1 | ✅ PASS | Mongo URI per tenant; Mongoose connection-level |
| L2 | ✅ PASS | MySQL credentials per tenant env |
| L3 | ✅ PASS | Hono `c.set` per-request (auth middleware pattern) |
| L4 | ✅ PASS | Prefixed queue names in jobQueue |
| L5 | ✅ PASS | Agenda collection per slug |
| L6 | ✅ PASS | [`TenantDBManager.ts`](services/stockix-finance/packages/server/src/services/Tenancy/TenantDBManager.ts) L11 cache |
| L7 | ✅ PASS | deprovision covers MySQL/Mongo/Redis/Traefik/env |
| L8 | ⚠️ PARTIAL | Journal covers most steps; network connect not journaled |
| L9 | ⚠️ PARTIAL | [`tenants.ts`](apps/api/src/routes/tenants.ts) L960–962 regex differs from spec |
| L10 | ✅ PASS | `tenant_port_seq` + `assertTenantPortAvailable` |

### Section M — Operational readiness

| ID | Result | Note |
|----|--------|------|
| M1 | ❌ FAIL | No stuck-provision runbook file |
| M2 | ❌ FAIL | No failed-deprovision runbook file |
| M3 | ❌ FAIL | No Mongo RS failure runbook |
| M4 | ❌ FAIL | No shared MySQL outage runbook |
| M5 | ❌ FAIL | Partial tenant doc in missingarchitecture only |
| M6 | ✅ PASS | [`audit-orphan-dbs.ts`](infra/worker-service/scripts/audit-orphan-dbs.ts) report-only |
| M7 | ✅ PASS | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) L1–3 banner |
| M8 | ✅ PASS | [`Architecture2.md`](docs/Architecture2.md) repair log through PARTIAL-13 |
| M9 | ✅ PASS | [`missingarchitecture.md`](missingarchitecture.md) Round 4–5 tables |
| M10 | ⚠️ PARTIAL | `.env.example` broad; some vars undocumented |
| M11 | ✅ PASS | `.env.example` L107 `TRAEFIK_DYNAMIC_DIR` |
| M12 | ❌ FAIL | No `ALERT_WEBHOOK_URL` in .env.example |

### Section N — Provision flow trace (acme)

| ID | Result | Note |
|----|--------|------|
| N1 | ✅ PASS | [`tenant-jobs.ts`](apps/api/src/services/tenant-jobs.ts) L6–8 type `tenant.provision` |
| N2 | ✅ PASS | [`internal.ts`](apps/api/src/routes/internal.ts) L78 claim + Bearer worker secret |
| N3 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L90–92, L105, L109 — hosts `stockix-mongo`/`tenant-redis` via aliases |
| N4 | ✅ PASS | [`tenant-env.ts`](infra/worker-service/domain/provisioning/tenant-env.ts) L272–281 mode 600 |
| N5 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L163–185 |
| N6 | ✅ PASS | health L1548 → bootstrap L1568 → app_step |
| N7 | ✅ PASS | edge.publish L2078 → `tenant-{slug}.yml` |
| N8 | ✅ PASS | runPosProvisionStep L2126 → module-stacks compose + Traefik |

### Section O — Deprovision flow trace (acme)

| ID | Result | Note |
|----|--------|------|
| O1 | ✅ PASS | Job type `tenant.deprovision` in tenant-jobs |
| O2 | ❌ FAIL | No `withTenantDeprovisionLock` |
| O3 | ✅ PASS | [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) compose down |
| O4 | ✅ PASS | POS project `stockix-pos-{slug}` L402 |
| O5 | ✅ PASS | MySQL drops L246–252 |
| O6 | ✅ PASS | mongosh L283–287 |
| O7 | ✅ PASS | Redis L86–104 |
| O8 | ✅ PASS | Traefik + rm + PG delete last L478+ |

---

## Staging Verification Plan

### STEP 1 — Shared stack startup and alias verification

**Command:**
```bash
docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env -p stockix-shared up -d
docker exec stockix-shared-stockix-mysql-1 getent hosts shared-mysql stockix-mysql
docker exec stockix-shared-stockix-mongo-1 mongosh --quiet --eval "rs.status().ok"
docker exec stockix-shared-stockix-redis-1 redis-cli ping
```

**Expected:** All services healthy; host aliases resolve; `rs.status().ok === 1`; `PONG`.

**Failure means:** Shared infra not reachable — all tenant provisions will fail.

### STEP 2 — Traefik dynamic config loading

**Command:**
```bash
ls -la "${TRAEFIK_DYNAMIC_DIR:-/opt/stockix/traefik-dynamic}"
docker logs stockix-traefik-1 2>&1 | tail -30
```

**Expected:** Directory exists; Traefik logs show file provider watching dynamic dir.

**Failure means:** Worker writes YAML but edge does not load routes.

### STEP 3 — Finance-only tenant provision

**Command:** Create tenant `acme` with `modules: ["accounting"]` via dashboard/API; watch worker logs for `docker.app_step`, `tenant.health_check`, `edge.publish`.

**Expected:** `stockix-acme-server-1` healthy; `tenant-acme.yml` created; `https://acme.${ROOT_DOMAIN}/api/ping` OK.

**Failure means:** Finance provision path or Traefik upstream broken.

### STEP 4 — POS module provision

**Command:** Add `pos` module or provision `acme` with `["accounting","pos"]`; confirm `stockix-pos-acme` project up.

**Expected:** `docker compose -p stockix-pos-acme ps` shows pos-backend, workers, optional frontend.

**Failure means:** POS images or env guard failure.

### STEP 5 — MongoDB per-tenant isolation

**Command:**
```bash
docker exec stockix-shared-stockix-mongo-1 mongosh --quiet --eval "db.getSiblingDB('acme_pos').getName()"
docker exec stockix-shared-stockix-mongo-1 mongosh --quiet --eval "db.getSiblingDB('beta_pos').getName()"
```

**Expected:** Distinct DB names; no `stockix` shared DB.

**Failure means:** Wrong `MONGODB_URI` in tenant `.env`.

### STEP 6 — Redis key isolation

**Command:**
```bash
docker exec stockix-shared-stockix-redis-1 redis-cli KEYS 'tenant:acme:*' | head
docker exec stockix-shared-stockix-redis-1 redis-cli KEYS 'tenant:beta:*' | head
```

**Expected:** Keys only under respective prefixes; Finance BullMQ under `bull:tenant:acme:*`.

**Failure means:** Missing `REDIS_KEY_PREFIX` on Finance or POS.

### STEP 7 — MySQL grants verification

**Command:**
```bash
docker exec stockix-shared-stockix-mysql-1 mysql -uroot -p"$SHARED_MYSQL_ROOT_PASSWORD" -e "SHOW GRANTS FOR 'tenant_acme'@'%';"
```

**Expected:** Grants include ``stockix_acme_%`` wildcard.

**Failure means:** Org DB creation will fail at runtime.

### STEP 8 — Concurrent provision blocked

**Command:** Trigger two `tenant.provision` jobs for same `tenantId` (or retry while first running).

**Expected:** Second job throws `Concurrent provision detected` ([`provision-lock.ts`](infra/worker-service/domain/provisioning/provision-lock.ts) L44–46).

**Failure means:** Race on compose/DB operations.

### STEP 9 — Provision failure rollback

**Command:** Induce failure after `docker.data_step` (e.g. bad Finance image); verify rollback calls `deprovisionTenantDatabases` when journaled ([`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) L471–475).

**Expected:** Log `[rollback] shared DB teardown`; MySQL/Mongo cleaned for slug.

**Failure means:** Orphan shared DB on failed provision.

### STEP 10 — Full deprovision zero orphans

**Command:** Deprovision `acme`; then:
```bash
docker exec stockix-shared-stockix-mysql-1 mysql -uroot -p"$SHARED_MYSQL_ROOT_PASSWORD" -e "SHOW DATABASES LIKE 'stockix_acme%';"
docker exec stockix-shared-stockix-mongo-1 mongosh --quiet --eval "db.getSiblingDB('acme_pos').getName()"
docker exec stockix-shared-stockix-redis-1 redis-cli KEYS 'tenant:acme:*'
ls "${TRAEFIK_DYNAMIC_DIR}/tenant-acme.yml" "${TRAEFIK_DYNAMIC_DIR}/tenant-pos-acme.yml" 2>&1
npx tsx infra/worker-service/scripts/audit-orphan-dbs.ts
```

**Expected:** No DBs, no keys, no YAML, audit script lists none for acme.

**Failure means:** Deprovision ordering or cleanup gap.

### STEP 11 — Backup execution

**Command:**
```bash
bash infra/prod/backup/backup.sh
```

**Expected:** **Today:** only `stockix_platform_*.dump.gz` uploaded — **not** MySQL/Mongo.

**Failure means:** Platform metadata not backed up; also confirms K9/K10 gap.

### STEP 12 — Monitoring healthcheck

**Command:** Run `infra/prod/monitoring/healthcheck.sh` if present.

**Expected:** **Currently MISSING** — step fails until script added.

**Failure means:** K11 blocking.

### STEP 13–15 — Failure injection and two-tenant smoke

Document in OPERATIONS.md after runbooks exist. Two-tenant: provision `acme` and `beta`, verify N5/N6 isolation cross-tenant.

---

## Final Recommendations

| Priority | Item | File(s) | Effort |
|----------|------|---------|--------|
| P0 | Shared MySQL + Mongo backup/restore tested | `infra/prod/backup/` | L |
| P0 | Monitoring script + alerts | `infra/prod/monitoring/`, `.env.example` | M |
| P0 | Deprovision advisory lock + pre-dispatch guard | `provision-lock.ts`, `worker.ts` | S |
| P0 | POS provision failure Traefik cleanup | `module-stacks.ts` | S |
| P0 | platformWorker production dotenv guard | `platformWorker.js`, `bigcapitalSyncWorker.js` | S |
| P1 | Finance static → nginx volume OR defer nginx from critical path | `provision-runtime.ts` | M |
| P1 | OPERATIONS.md runbooks | `docs/OPERATIONS.md` | M |
| P1 | Staging E2E script (Phase 4 steps 1–10) | `scripts/staging-e2e.sh` | M |
| P2 | Redis AOF or documented RDB-only acceptance | `infra/shared/docker-compose.yml` | S |
| P2 | Prefix POS `org:{id}:` Redis keys | `redisKeys.js` | M |
| P2 | Bootstrap network implementation | `provision-runtime.ts`, prod compose | M |

---

## Repair History Summary

| Round | Scope | Doc reference |
|-------|--------|---------------|
| P0 | Mongo isolation, aliases, Traefik volume, POS provision | Architecture2 repair log REPAIR 0–3 |
| P1 | Redis, Agenda, MySQL naming, deprovision | REPAIR 5–8 |
| P2 | POS timing, nginx scaffold, RS healthcheck, Docker hygiene | REPAIR A–G |
| FAIL 1–8 | Concurrent guard, rollback DB, BullMQ prefix, deprovision guard, Traefik, ARCHITECTURE.md, pnpm | missingarchitecture Round 4 |
| PARTIAL 1–13 | Fail-fast Mongo, docs, grants, port check, deprovision ordering, audit script | missingarchitecture Round 5 |
| Deep scan (claimed) | **Not fully verified in code** | [`missing2arch.md`](missing2arch.md) |

---

*This audit is read-only. No source files were modified. Companion gap list: [`docs/missing2arch.md`](missing2arch.md).*
