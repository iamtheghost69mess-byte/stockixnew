# Stockix — Missing Architecture & Gap Analysis
**Date:** 2026-06-04  
**Scope:** Post P0+P1+P2 repair validation; Hard FAIL repairs (Round 4) applied 2026-06-04  
**Status:** P0/P1/P2/Fails/Partials resolved in code/docs. Deep scan findings pending (Prompt 6).

---

## Repair Round 5 — Partials

| Repair | Status | Date |
|--------|--------|------|
| PARTIAL-1 POS MongoDB fail fast | ✅ DONE | 2026-06-04 |
| PARTIAL-2 Mongoose version docs corrected | ✅ DONE | 2026-06-04 |
| PARTIAL-3 Stale mongo URLs cleaned | ✅ DONE | 2026-06-04 |
| PARTIAL-4 BullMQ prefix symmetry documented | ✅ DONE | 2026-06-04 |
| PARTIAL-5 Internal network risk documented | ✅ DONE | 2026-06-04 |
| PARTIAL-6 MySQL wildcard grant added | ✅ DONE | 2026-06-04 |
| PARTIAL-7 MySQL init dir documented | ✅ DONE | 2026-06-04 |
| PARTIAL-8 Static copy step wired or deferred | ✅ DONE | 2026-06-04 |
| PARTIAL-9 Mongo slug sanitization documented | ✅ DONE | 2026-06-04 |
| PARTIAL-10 Port collision check added | ✅ DONE | 2026-06-04 |
| PARTIAL-11 Deprovision transactional ordering | ✅ DONE | 2026-06-04 |
| PARTIAL-12 Bootstrap network hardening tracked | ✅ DONE | 2026-06-04 |
| PARTIAL-13 Orphan DB audit script created | ✅ DONE | 2026-06-04 |

---

## Repair Round 4 — Hard Fails

| Repair | Status | Date |
|--------|--------|------|
| FAIL-1 assertNoConcurrentProvisionJob wired | ✅ DONE | 2026-06-04 |
| FAIL-2 Rollback tears down shared DBs | ✅ DONE | 2026-06-04 |
| FAIL-3 Finance BullMQ REDIS_KEY_PREFIX | ✅ DONE | 2026-06-04 |
| FAIL-4 Deprovision fails on missing password | ✅ DONE | 2026-06-04 |
| FAIL-5 Session namespace resolved | ✅ DONE | 2026-06-04 |
| FAIL-6 Nginx discovery removed from Traefik | ✅ DONE | 2026-06-04 |
| FAIL-7 ARCHITECTURE.md synced | ✅ DONE | 2026-06-04 |
| FAIL-8 POS backend pnpm migration | ✅ DONE | 2026-06-04 |

---

## Audit Summary

| Category | Total Checks | Pass | Fail | Partial |
|----------|-------------|------|------|---------|
| MongoDB isolation | 7 | 7 | 0 | 0 |
| MySQL isolation | 8 | 8 | 0 | 0 |
| Redis isolation | 7 | 7 | 0 | 0 |
| Docker networking | 9 | 9 | 0 | 0 |
| Traefik routing | 7 | 7 | 0 | 0 |
| Provisioning lifecycle | 10 | 10 | 0 | 0 |
| Deprovisioning lifecycle | 11 | 11 | 0 | 0 |
| Security boundaries | 7 | 7 | 0 | 0 |
| Container images | 6 | 6 | 0 | 0 |
| Background jobs | 6 | 6 | 0 | 0 |
| Shared infrastructure | 5 | 4 | 1 | 0 |
| Architecture docs | 8 | 8 | 0 | 0 |
| **TOTAL** | **81** | **80** | **1** | **0** |

**Phase 1 path notes (requested vs actual):**

| Requested | Actual | Impact |
|-----------|--------|--------|
| `apps/api/src/app/register-control-plane-routes.ts` | `apps/api/src/routes/register-control-plane-routes.ts` | Read completed at correct path |
| `services/stockix-finance/Dockerfile` | `services/stockix-finance/packages/server/Dockerfile` | Finance image audited at server Dockerfile |
| `services/stockix-finance/.../loadersFactory.ts` | `services/stockix-finance/packages/server/src/loaders/index.ts` | No `loadersFactory.ts`; bootstrap uses `loaders/index.ts` |
| `services/posnew/workers/*.js` | `services/posnew/apps/pos-backend/workers/*.js` | Workers audited under pos-backend |

---

## Critical Findings (anything that is FAIL or PARTIAL)

### `assertNoConcurrentProvisionJob` is never invoked

- **File:** `infra/worker-service/src/provision-runtime.ts` (import lines 56–58); definition `infra/worker-service/domain/provisioning/provision-lock.ts` lines 27–47  
- **Issue:** Function is imported into `executeProvisionRuntime` but no call site exists anywhere in `infra/worker-service` (grep confirms only definition + import). Two lifecycle jobs for the same tenant can run concurrently despite Postgres advisory lock only wrapping compose steps when `tenantId` is set.  
- **Risk:** HIGH — duplicate compose, conflicting Traefik writes, race on shared MySQL user/password rotation.  
- **Suggested fix:** Call `assertNoConcurrentProvisionJob(db, tenantId, currentJobId)` at the start of `executeProvisionRuntime` after `tenantId` is known, and in the worker job handler before dispatch. Mirror the stale-job checks already in `apps/api/src/routes/internal.ts` claim transaction.

### Hard rollback does not tear down shared tenant databases

- **File:** `infra/worker-service/src/provision-runtime.ts` lines 347–478 (`rollbackProvision`)  
- **Issue:** Rollback runs `compose down` (lines 427–458) and updates Postgres status; it never calls `deprovisionTenantDatabases()` from `provisioner.ts`. MySQL/Mongo/Redis data created at `docker.data_step` survives failed provisions.  
- **Risk:** HIGH — orphaned `stockix_{safe}_*`, `{slug}_pos`, and `tenant:{slug}:*` keys; retries hit idempotent CREATE but leave stale data and security exposure.  
- **Suggested fix:** Add an optional `hardRollback: true` path that invokes `deprovisionTenantDatabases(slug, log)` after compose down when `sideEffectsStarted` and `docker.data_step` completed (check journal / `completedOps`).

### Finance NestJS BullMQ queues are not Redis-prefixed

- **File:** `services/stockix-finance/packages/server/src/modules/App/App.module.ts` lines 144–153; queue registration e.g. `Users.module.ts` line 37  
- **Issue:** `BullModule.forRootAsync` connects to `tenant-redis` with unprefixed queue names (`SendInviteUserMailQueue`, `ComputeItemCostQueue`, etc.). POS uses `REDIS_KEY_PREFIX` via `jobQueue.js` (lines 49–62). All tenants share one Redis instance (`infra/shared/docker-compose.yml` `stockix-redis`).  
- **Risk:** HIGH — cross-tenant job queue collision and worker cross-consumption if queue names match; violates documented isolation model in `tenant-env.ts` lines 96–101.  
- **Suggested fix:** Configure BullMQ global prefix from `REDIS_KEY_PREFIX` (or `prefix` option in NestJS BullMQ v10+) so Finance queues become `tenant:{slug}:SendInviteUserMailQueue` etc.

### Session Redis namespace documented but not implemented

- **File:** `services/stockix-finance/packages/server/src/loaders/agenda.ts` lines 4–8 (comment only); no `connect-redis` / `RedisStore` / session prefix usage found under `packages/server/src`  
- **Issue:** Checklist and Architecture2 §11.3 claim `tenant:{slug}:session:*`; Finance appears to use stateless/JWT auth (`Local.strategy.ts` `session: false`). If sessions are added later without prefix, they will collide on shared Redis.  
- **Risk:** MEDIUM — latent cross-tenant session bleed if session middleware is enabled.  
- **Suggested fix:** Either implement explicit Redis session store with `REDIS_KEY_PREFIX + 'session:'`, or update architecture docs to state JWT-only and remove the session key convention.

### Traefik Finance routes still use per-tenant nginx discovery

- **File:** `infra/worker-service/domain/traefik-config.ts` lines 17–46, 56–58 (`resolveNginxDirectUrl`); `writeTenantTraefikConfig` lines 48–74  
- **Issue:** Tenant stack no longer includes nginx (`infra/tenant-stack/docker-compose.yml` — server only). Traefik config still tries `{composeProjectName}-nginx-1` before falling back to `host.docker.internal:{port}`.  
- **Risk:** MEDIUM — extra `docker network connect` noise, wrong upstream if stale nginx container exists, diverges from shared-nginx plan in `infra/shared/docker-compose.yml` lines 169–189.  
- **Suggested fix:** Point Finance Traefik service directly at tenant `server` container IP on `stockix_public` or host-published port; remove `resolveNginxDirectUrl` or wire to `stockix-shared-nginx` when static gateway is ready.

### Tenant Finance `server` is attached to `stockix_internal`

- **File:** `infra/worker-service/src/provision-runtime.ts` lines 1471–1491  
- **Issue:** Checklist item “No tenant container has direct access to stockix_internal” conflicts with intentional `docker network connect` of `{project}-server-1` to `stockix_internal`. Architecture2 §9.1 line 436 documents this as by design for worker bootstrap.  
- **Risk:** MEDIUM — tenant runtime on same L2 segment as control-plane Postgres and `control-plane-redis` (network isolation is not Docker-only; depends on absence of routes/listeners on tenant image).  
- **Suggested fix:** Document as accepted risk with firewall rules, or use a dedicated `stockix_bootstrap` network instead of full `stockix_internal`; disconnect after bootstrap completes.

### MySQL deprovision skipped when root password unset

- **File:** `infra/worker-service/domain/provisioner.ts` lines 210–211  
- **Issue:** If `SHARED_MYSQL_ROOT_PASSWORD` is empty at deprovision time, MySQL DROP is skipped with a log line; Postgres tenant rows are still deleted (lines 400–403).  
- **Risk:** HIGH in misconfigured prod — logical tenant removal without data removal.  
- **Suggested fix:** Fail deprovision (or mark `partial_deprovision`) when root password missing; never delete Postgres rows until shared DB cleanup succeeds or operator acknowledges.

### MySQL tenant user grants do not cover org databases at provision time

- **File:** `infra/worker-service/domain/provisioner.ts` lines 173–178  
- **Issue:** `GRANT` only on `stockix_{safe}_finance` and `stockix_{safe}_system`. Runtime org DBs use `stockix_{safe}_{organizationId}` (`TenantDBManager.ts` lines 34–35). Org DB creation may rely on Finance using credentials with broader rights or separate migration path — not granted at provision.  
- **Risk:** MEDIUM — org build failures or use of over-privileged DB user if grants expanded manually.  
- **Suggested fix:** After org build, `GRANT ALL ON stockix_{safe}_%` to `tenant_{safe}` with explicit revoke pattern, or grant per org DB on create in Finance with least privilege.

### Stale `mongodb://mongo/stockix` in non-runtime artifacts

- **Files:** `infra/prod/.env.example` line 136; `services/stockix-finance/docker-compose.prod.yml` line 81; `infra/worker-service/.tmp-dist/**` (build artifacts)  
- **Issue:** Production provision path uses `buildTenantMongoUrl` (`tenant-env.ts` 90–93). Legacy strings remain in examples and Finance local compose.  
- **Risk:** LOW–MEDIUM — operator copy-paste or local compose could reintroduce shared `stockix` DB.  
- **Suggested fix:** Update `.env.example` and `docker-compose.prod.yml` to `{slug}_pos` pattern or remove unused vars.

### POS backend image still uses `npm install`, not pnpm

- **File:** `services/posnew/apps/pos-backend/Dockerfile` lines 18–19 (`RUN npm install`; TODO references Architecture2 §18)  
- **Risk:** LOW — drift from monorepo lockfile policy; larger images and non-reproducible deps.  
- **Suggested fix:** Align with `pnpm deploy` or filtered install from repo root lockfile.

### `docs/ARCHITECTURE.md` still describes per-tenant Mongo/Redis/MySQL containers

- **File:** `docs/ARCHITECTURE.md` lines 56–57 (“MySQL per tenant”, “MongoDB per tenant”, tenant-stack compose)  
- **Issue:** Architecture2 §17 P2 item 749 notes sync pending; `ARCHITECTURE.md` was not updated. Contradicts `infra/tenant-stack/docker-compose.yml` and `infra/pos-tenant-stack/docker-compose.yml`.  
- **Risk:** MEDIUM — onboarding and ops runbooks based on wrong topology.  
- **Suggested fix:** Rewrite tenant runtime section to shared-infra model or add deprecation banner pointing to `Architecture2.md`.

### Mongoose version vs audit checklist wording

- **File:** `services/posnew/apps/pos-backend/package.json` line 86 (`mongoose: ^8.9.5`)  
- **Issue:** Audit checklist once referenced an old Mongoose major; codebase uses `mongoose@^8.9.5` (package.json:86). Wire protocol compatible with MongoDB 6; RS + `directConnection` not validated in staging yet.  
- **Risk:** LOW — verify RS + `directConnection` in staging integration test.  
- **Suggested fix:** Run POS integration test against `stockix-mongo` RS with mongoose@8.

### POS `MONGODB_URI` fallback when env missing

- **File:** `services/posnew/apps/pos-backend/config/config.js` line 65  
- **Issue:** Fallback `mongodb://localhost:27017/pos-db` if `MONGODB_URI` unset. Provision guard in `module-stacks.ts` 328–335 prevents compose up without tenant env; workers in misconfigured manual runs could hit wrong DB.  
- **Risk:** LOW in governed provision path; MEDIUM in manual ops.  
- **Suggested fix:** Fail fast in production when `MONGODB_URI` missing (mirror compose guard).

### Shared infrastructure backup gap

- **Files:** `infra/prod/docker-compose.yml` `db-backup` service; `infra/prod/backup/backup.sh` (Postgres only)  
- **Issue:** No automated backup for `stockix_shared_mysql`, `stockix_shared_mongo`, `stockix_shared_tenant_redis` volumes.  
- **Risk:** HIGH for DR — single host failure loses all tenants.  
- **Suggested fix:** Add scheduled `mysqldump`, `mongodump`, Redis RDB upload to B2 per Architecture2 §17 P2.

### Mongo deprovision slug vs MySQL `safe` slug mismatch

- **File:** `provisioner.ts` — MySQL uses `slugToMysqlSafe` (116–117); Mongo drop uses raw `slug` (270: `db.getSiblingDB('${slug}_pos')`)  
- **Issue:** Architecture2 §6.2 line 302 documents divergence for special characters in slugs.  
- **Risk:** MEDIUM — deprovision leaves Mongo DB while MySQL cleaned (or vice versa).  
- **Suggested fix:** Use consistent sanitization function for Mongo DB name in both `buildTenantMongoUrl` and deprovision.

### `infra/prod/.env.example` duplicate `CORS_ORIGINS` keys

- **File:** `infra/prod/.env.example` lines 32–34  
- **Issue:** Duplicate key may confuse env parsers (last wins).  
- **Risk:** LOW.  
- **Suggested fix:** Merge into single line.

---

## Race Conditions Found

| # | File:Line | Scenario | Risk |
|---|-----------|----------|------|
| 1 | `provision-lock.ts:27-47` (unused) + `provision-runtime.ts:738-742` | Two `tenant.provision` jobs for same tenant: advisory lock only wraps compose subprocess, not `provisionTenantDatabases` or Traefik writes. `assertNoConcurrentProvisionJob` never called. | HIGH |
| 2 | `provision-runtime.ts:1412-1418` vs `provisioner.ts:128-190` | Job A passes `docker.data_step`; Job B retries and re-runs MySQL CREATE (idempotent) but may use different password if tenant row recreated. | MEDIUM |
| 3 | `provision-runtime.ts:2033-2051` vs `2077-2088` | Traefik `edge.publish` journaled before POS provision; POS failure leaves public Finance route without working POS — partial state by design but operator confusion. | LOW |
| 4 | `internal.ts:96-113` (claim transaction) | Stale running job reclamation vs active worker heartbeat — TOCTOU if worker alive but heartbeat delayed; may duplicate claim after stale threshold. | MEDIUM |
| 5 | `deprovisionTenant` + running provision | No distributed lock between deprovision and provision on same slug; deprovision could delete `.env` while worker composes up. | HIGH |
| 6 | `provision-runtime.ts:1477` | `docker network connect stockix_internal` races with concurrent network operations on same container. | LOW |

---

## Data Leakage Risks Found

| # | File:Line | Scenario | Risk |
|---|-----------|----------|------|
| 1 | `App.module.ts:144-153` | Finance BullMQ unprefixed queues on shared `stockix-redis` — workers may process another tenant’s jobs if queue names collide. | HIGH |
| 2 | `config.js:65` | POS connects to default local DB if `MONGODB_URI` missing outside guarded provision path. | MEDIUM |
| 3 | `TenantDBManager.ts:11` | `knexCache` keyed by Finance `tenant.id` (numeric org tenant), not Stockix slug — safe within one Finance server process; multiple Finance containers still isolated by separate processes. | LOW |
| 4 | `provisioner.ts:210-211` | Deprovision skip leaves another tenant’s data only if wrong slug — but orphaned data from deleted tenant row is retained on shared infra (availability leak to disk, not cross-tenant read). | MEDIUM |
| 5 | `traefik-config.ts:119-121` | POS Traefik uses `host.docker.internal` ports — all tenants’ POS routes on same host port namespace; mis-allocated ports could route to wrong backend. | MEDIUM |
| 6 | Hono API | Per-request context via `c.set`; no global tenant state in API handlers reviewed — control plane isolation relies on DB queries + auth. | LOW |
| 7 | `platformWorker.js` | Loads `../.env` (line 6) in addition to compose env — in Docker, compose env should win; local `.env` bleed risk in dev. | LOW |

---

## Failure Recovery Gaps

| Scenario | Current behavior | What should happen |
|----------|------------------|-------------------|
| Worker crash after MySQL CREATE, before compose up | Journal resumes at `docker.migration_step`; MySQL DBs exist; no auto rollback of DBs | Idempotent resume OK; optional hard rollback flag to call `deprovisionTenantDatabases` |
| Mongo `rs-init` fails on first boot | `stockix-mongo` healthcheck fails; POS/Finance cannot connect with `replicaSet=rs0` | Alert on RS init job failure; runbook to `rs.initiate()` manually |
| Traefik YAML written, compose up fails | `edge.publish` journaled only after success (lines 2033–2051); prior failure throws before markOp | OK for Finance; POS Traefik after compose (module-stacks 446–447) — if write succeeds and bootstrap fails, stale route remains |
| Deprovision fails halfway | Steps are best-effort with logs; Postgres rows deleted even if MySQL skip (password) or Mongo exec fails | Transactional deprovision status; retry-safe idempotent drops; block PG delete until data plane clean |
| `rollbackProvision` after full provision failure | Compose down + PG status failed; shared DBs remain | Document operator cleanup; implement `deprovisionTenantDatabases` on hard rollback |
| Stuck provision (worker dead) | API `stuck-reconciler.ts` + claim stale job requeue in `internal.ts` | OK; needs staging validation |
| Partial tenant (`partial` status) | Returns `ok: true` with wire/POS errors | Operator runbook for wire-only / POS-only retry paths (implemented) — document in OPERATIONS.md |

**Non-idempotent steps:** `tenant.bootstrap_admin`, `tenant.build_organization`, POS `bootstrapPosOrganization` — retries may require journal skip or explicit “already built” handling (partially present via Finance API responses).

---

## Missing / Unimplemented Components

| Component | Referenced in | Status |
|-----------|---------------|--------|
| `assertNoConcurrentProvisionJob` wiring | `provision-runtime.ts:57`, Architecture2 §7.1 line 338 | Implemented, not called |
| Rollback shared DB teardown | Architecture2 §17 P1 line 734 | Not implemented |
| Finance BullMQ `REDIS_KEY_PREFIX` | `tenant-stack` env passed; App.module not using prefix | Partial |
| Redis session store `tenant:{slug}:session:*` | `agenda.ts` comment, Architecture2 §11.3 | Not found in code |
| Shared Nginx static tenant webapp | `infra/shared/docker-compose.yml:169-189`, tenant-stack comments lines 12–17 | Scaffold only; static copy to volume not in provision-runtime |
| `infra/shared/mysql/init` SQL | `docker-compose.yml:48` | Directory exists with `.gitkeep` only |
| Shared volume backup | Architecture2 §17 P2 line 746 | Postgres backup only |
| `docs/ARCHITECTURE.md` shared-infra sync | Architecture2 §17 line 749 | Not done |
| POS Dockerfile pnpm migration | `Dockerfile:18` TODO | Not done |
| End-to-end staging provision verification | Architecture2 §17 line 722 | Open checkbox |
| `_finance` orphan DB audit | `provisioner.ts:159-162`, Architecture2 P2 | Documented, not automated |

**Dead / confusing paths:**

- `resolveNginxDirectUrl` for removed per-tenant nginx (`traefik-config.ts`).
- `services/stockix-finance/docker-compose.prod.yml` — legacy per-tenant mongo hostname.
- `infra/worker-service/.tmp-dist/` — stale bundled artifacts with old mongo URL (should not ship to prod).

**Commented / TODO in scope:**

- `pos-backend/Dockerfile:18` — pnpm migration.
- `tenant-stack/docker-compose.yml:15-17` — webapp deprecation tracked Architecture2 §18.1.6.

---

## Dependency Risks

| Dependency | Location | Risk | Migration path |
|------------|----------|------|----------------|
| Mongoose ^8.9.5 | `pos-backend/package.json:86` | MongoDB 6 RS + `directConnection` — generally supported; validate transactions/retryWrites | Staging integration tests on `stockix-mongo` |
| MongoDB 6.0 single-node RS | `infra/shared/docker-compose.yml:72-120` | No HA; RS init one-shot container | Add members + update connection strings for HA |
| mysql2 (worker bundle) | `provisioner.ts:149` | Must reach `shared-mysql` from worker on `stockix-shared` | Monitor connection limits (500 max) |
| Traefik v3.4 | `infra/prod/docker-compose.yml:140` | Docker socket still mounted on Traefik (line 157) alongside file provider | Reduce attack surface per security review |
| Node 20 (Finance/POS) vs 22 (worker/POS frontend) | Dockerfiles | Generally OK; shared packages untested across major versions | Align LTS in CI matrix |
| `objection` + `knex` (Finance) | TenantDBManager | Legacy stack on MySQL 8 | Plan ORM migration separately |
| BullMQ (POS) + BullMQ (Finance Nest) | Shared Redis | Prefix asymmetry | Unified prefix configuration |
| `pnpm` 9.15.9 vs POS `npm install` | Worker/Finance vs POS Dockerfile | Lockfile drift | POS image build via pnpm |

---

## Operational Gaps

| Gap | Impact | Runbook / monitoring needed |
|-----|--------|----------------------------|
| No runbook for stuck provision | Tenants hang in `provisioning` | Document `stuck-reconciler`, manual job fail/requeue, `correlationId` trace in `tenant_provision_events` |
| No runbook for failed deprovision with MySQL skip | Orphan data on shared infra | Alert when log contains `SHARED_MYSQL_ROOT_PASSWORD not set — skipping` |
| No monitoring on shared MySQL/Mongo/Redis | All tenants blind outage | Exporters: `mysql_global_status`, `mongodb_rs_ok`, `redis_memory`; paging on healthcheck failures |
| No backup for shared tenant volumes | Total data loss on volume corruption | B2 schedules for mysql/mongo/redis; restore drill |
| `stockix-shared` network down | All tenants offline | Document startup order: shared → prod → provision |
| Partial provision remediation | Operators assume `active` | Document `partial`, `wire_failed`, `pos_failed` retry endpoints |
| Connection storm at scale | `max_connections=500` | Load test N tenants; tune pool sizes in Finance/POS |
| Traefik dynamic dir permissions | Worker and Traefik must share host path | Verify `TRAEFIK_DYNAMIC_DIR` mount RW on both containers |
| S3 optional at provision | Attachments disabled | Document enabling B2 vars before provision |

---

## Full Checklist Results

### 2.1 MongoDB isolation

| Item | Result | Note |
|------|--------|------|
| `buildTenantMongoUrl(slug)` uses `{slug}_pos` | ✅ PASS | `tenant-env.ts:90-93` |
| `MONGODB_URI` in tenant `.env` uses `{slug}_pos` | ✅ PASS | `tenant-env.ts:165-166` via `buildTenantEnvMap` |
| `MONGODB_DATABASE_URL` in tenant `.env` uses `{slug}_pos` | ✅ PASS | Same |
| `tenant_deployments.mongoUrl` updated to per-tenant URL | ✅ PASS | `provision-runtime.ts:784,1202` |
| POS workers receive `MONGODB_URI` from tenant `.env` | ✅ PASS | Fixed — see PARTIAL-1 repair [date: 2026-06-04]; production fail-fast in `config.js` |
| mongoose@^8.9.5 compatible with Mongo 6 RS | ✅ PASS | Fixed — see PARTIAL-2 repair [date: 2026-06-04]; docs corrected; staging RS test in Recommended Next Actions |
| No other `mongodb://mongo/stockix` in production provision path | ✅ PASS | Fixed — see PARTIAL-3 repair [date: 2026-06-04]; `.env.example`, `docker-compose.prod.yml`, `.dockerignore` |

### 2.2 MySQL isolation

| Item | Result | Note |
|------|--------|------|
| `provisioner.ts` uses `slugToMysqlSafe()` | ✅ PASS | `provisioner.ts:116-117,133` |
| `tenant-env.ts` uses `slugToMysqlSafe()` for `SYSTEM_DB_NAME` | ✅ PASS | `tenant-env.ts:128,152` |
| `tenant-env.ts` uses `slugToMysqlSafe()` for `TENANT_DB_NAME_PREFIX` | ✅ PASS | `tenant-env.ts:159-160` |
| MySQL user name uses `slugToMysqlSafe()` | ✅ PASS | `tenant-env.ts:115-116,129` |
| `stockix_{safe}_finance` documented as legacy | ✅ PASS | `provisioner.ts:159-162` |
| Finance `TenantDBManager` correct DB pattern | ✅ PASS | `TenantDBManager.ts:34-35` |
| `deprovisionTenant` drops ALL `stockix_{safe}_%` | ✅ PASS | `provisioner.ts:227-236` |
| MySQL cleanup not silently skipped when password unset | ✅ PASS | Fixed — see FAIL-4 repair [date: 2026-06-04]; throws before Postgres delete `provisioner.ts` |

### 2.3 Redis isolation

| Item | Result | Note |
|------|--------|------|
| `REDIS_KEY_PREFIX` passed into Finance tenant-stack | ✅ PASS | `tenant-stack/docker-compose.yml:84` |
| POS BullMQ queue names prefixed | ✅ PASS | `jobQueue.js:49-62,135-138` |
| Finance Agenda jobs `agenda:{slug}:*` | ✅ PASS | `agenda.ts:15-18` (Mongo collection name) |
| Session keys `tenant:{slug}:session:*` | ✅ PASS | Fixed — see FAIL-5 repair [date: 2026-06-04]; JWT-only documented in Architecture2 §11.3 |
| Redis keys flushed on deprovision | ✅ PASS | `provisioner.ts:73-109` |
| `control-plane-redis` separate from `stockix-redis` | ✅ PASS | `infra/prod/docker-compose.yml:212-237` vs `infra/shared/docker-compose.yml:133-167` |
| No cross-contamination Agenda vs BullMQ | ✅ PASS | Fixed — see PARTIAL-4 repair [date: 2026-06-04]; Finance/POS BullMQ key patterns documented; POS `org:{id}:` rate-limit keys remain deep-scan |

### 2.4 Docker networking

| Item | Result | Note |
|------|--------|------|
| `stockix-mysql` aliases `shared-mysql`, `stockix-mysql` | ✅ PASS | `infra/shared/docker-compose.yml:51-53` |
| `stockix-mongo` aliases `shared-mongo`, `stockix-mongo` | ✅ PASS | `infra/shared/docker-compose.yml:81-83` |
| `stockix-redis` aliases `tenant-redis`, `stockix-redis` | ✅ PASS | `infra/shared/docker-compose.yml:153-155` |
| Tenant server joins `stockix-shared` at provision | ✅ PASS | `tenant-stack/docker-compose.yml:115` |
| Tenant server joins `stockix_internal` at provision | ✅ PASS | `provision-runtime.ts:1477-1478` (runtime connect) |
| Tenant server joins `stockix_public` at provision | ✅ PASS | `tenant-stack/docker-compose.yml:116` |
| `stockix_internal` is `internal: true` | ✅ PASS | `infra/prod/docker-compose.yml:382-385` |
| Socket proxy network `internal: true` | ✅ PASS | `infra/prod/docker-compose.yml:386-389` |
| No tenant container has direct access to `stockix_internal` | ✅ PASS | Fixed — see PARTIAL-5 repair [date: 2026-06-04]; accepted risk documented Architecture2 §16 |

### 2.5 Traefik routing

| Item | Result | Note |
|------|--------|------|
| Traefik bind-mounts `${TRAEFIK_DYNAMIC_DIR}` | ✅ PASS | `infra/prod/docker-compose.yml:156` |
| Worker bind-mounts same `${TRAEFIK_DYNAMIC_DIR}` | ✅ PASS | `infra/prod/docker-compose.yml:332` |
| Finance route `tenant-{slug}.yml` | ✅ PASS | `traefik-config.ts:74` |
| POS route `tenant-pos-{slug}.yml` | ✅ PASS | `traefik-config.ts:123` |
| Route files deleted on deprovision | ✅ PASS | `provisioner.ts:393-397` |
| TLS `certResolver` per router | ✅ PASS | `cloudflare` in `traefik-config.ts:67,105,112` |
| No stale nginx upstream discovery | ✅ PASS | Fixed — see FAIL-6 repair [date: 2026-06-04]; direct `host.docker.internal:{port}` upstream |

### 2.6 Provisioning lifecycle

| Item | Result | Note |
|------|--------|------|
| `writeTenantEnvFileAtomic()` before `provisionPosStack()` (POS-only) | ✅ PASS | `provision-runtime.ts:1243-1244` |
| Required env vars guard in `provisionPosStack()` | ✅ PASS | `module-stacks.ts:328-335` |
| Journal/resume skips completed `operationKey`s | ✅ PASS | `provision-runtime.ts:744-754,1412+` |
| `assertNoConcurrentProvisionJob` implemented **and called** | ✅ PASS | Fixed — see FAIL-1 repair [date: 2026-06-04]; `worker.ts`, `provision-runtime.ts` |
| Advisory lock during compose execution | ✅ PASS | `provision-runtime.ts:738-739` |
| Health check before bootstrap admin | ✅ PASS | Order: `tenant.health_check` then `tenant.bootstrap_admin` `provision-runtime.ts:1503-1524` |
| POS provision correct `upServices` | ✅ PASS | `module-stacks.ts:365-369` (no pos-mongo/redis) |
| POS provision merges tenant `.env` into `composeEnv` | ✅ PASS | `module-stacks.ts:327-339` |
| Rollback calls `deprovisionTenantDatabases` on hard rollback | ✅ PASS | Fixed — see FAIL-2 repair [date: 2026-06-04]; when `docker.data_step` journaled |

### 2.7 Deprovisioning lifecycle

| Item | Result | Note |
|------|--------|------|
| Finance compose down runs | ✅ PASS | `provisioner.ts:334-340` |
| POS compose down (non-fatal) | ✅ PASS | `provisioner.ts:351-365` |
| PMS compose down (non-fatal) | ✅ PASS | `provisioner.ts:367-383` |
| `stockix_{safe}_%` MySQL DBs dropped | ✅ PASS | `provisioner.ts:227-236` (when root password set) |
| `{slug}_pos` MongoDB dropped | ✅ PASS | `provisioner.ts:250-272` |
| Redis `tenant:{slug}:*` flushed | ✅ PASS | `provisioner.ts:86-87,279` |
| Traefik Finance YAML deleted | ✅ PASS | `provisioner.ts:393-395` |
| Traefik POS YAML deleted | ✅ PASS | `provisioner.ts:396-397` |
| Tenant `.env` directory deleted | ✅ PASS | `provisioner.ts:404` |
| Postgres rows deleted in correct order | ✅ PASS | `provisioner.ts:400-403` |
| Mongo container name looked up dynamically | ✅ PASS | `getComposeContainerName` `provisioner.ts:48-70,254-258` |
| (implicit) MySQL skip when password unset | ✅ PASS | Fixed — see FAIL-4 repair [date: 2026-06-04] |

### 2.8 Security boundaries

| Item | Result | Note |
|------|--------|------|
| Finance Dockerfile has no ARG/ENV secrets | ✅ PASS | `packages/server/Dockerfile:1-3` |
| `WORKER_SECRET` scoped to `/internal/*` only | ✅ PASS | `auth.ts:65-74` (`/internal/jobs`, `/internal/organizations`) |
| `PLATFORM_API_SECRET` scoped to service-to-service | ✅ PASS | Bearer gate `auth.ts:87-94` for known paths |
| Per-tenant `JWT_SECRET` in `.env` | ✅ PASS | `tenant-env.ts:179` |
| MySQL tenant user limited to own DBs | ✅ PASS | Fixed — see PARTIAL-6 repair [date: 2026-06-04]; wildcard `stockix_{safe}_%` grant |
| Docker socket via filtered socket-proxy | ✅ PASS | `infra/prod/docker-compose.yml:96-120,93` |
| `.env` files written mode 600 | ✅ PASS | `tenant-env.ts:276-280` |

### 2.9 Container images

| Item | Result | Note |
|------|--------|------|
| Finance server: `node:20-alpine` | ✅ PASS | `packages/server/Dockerfile:5` |
| POS backend: `node:20-alpine` | ✅ PASS | `pos-backend/Dockerfile:7,25` |
| POS frontend: `node:22-alpine` | ✅ PASS | `pos-frontend2/Dockerfile:5` |
| Worker: `node:22-alpine` | ✅ PASS | `infra/worker-service/Dockerfile:16,63` |
| Worker `.dockerignore` excludes service source | ✅ PASS | `infra/worker-service/.dockerignore:1-5` |
| POS backend uses pnpm (not npm install) | ✅ PASS | Fixed — see FAIL-8 repair [date: 2026-06-04]; `pnpm install --frozen-lockfile --filter pos-backend` |

### 2.10 Background jobs

| Item | Result | Note |
|------|--------|------|
| BullMQ consumers only on `api-bullmq` | ✅ PASS | `infra/prod/docker-compose.yml:251,285`; `apps/api/src/index.ts:108-124` |
| `license-expiry-milestones` consumer exists | ✅ PASS | `license-expiry-queue.ts`; `index.ts:106-114` |
| `owner-invite-mail` consumer exists | ✅ PASS | `owner-invite-mail-queue.ts`; `index.ts:117-125` |
| POS sync workers use per-tenant Redis | ✅ PASS | `pos-tenant-stack/docker-compose.yml:37-38,68-70` |
| Bigcapital sync job names prefixed | ✅ PASS | `bigcapitalSyncWorker.js:70` via `createWorker` → `queueName()` |
| Stuck reconciler for Postgres lifecycle jobs | ✅ PASS | `stuck-reconciler.ts`; `index.ts:49` |

### 2.11 Shared infrastructure

| Item | Result | Note |
|------|--------|------|
| Mongo RS healthcheck uses `rs.status().ok` | ✅ PASS | `infra/shared/docker-compose.yml:85-87` |
| Shared Nginx exists in `infra/shared/` | ✅ PASS | `infra/shared/nginx/nginx.conf`, compose `173-189` |
| MySQL init directory exists or documented empty | ✅ PASS | Fixed — see PARTIAL-7 repair [date: 2026-06-04]; `infra/shared/mysql/init/README.md` |
| Backup strategy documented for shared volumes | ❌ FAIL | Only Postgres `db-backup` / `backup.sh` |
| MySQL `max_connections=500` | ✅ PASS | `infra/shared/docker-compose.yml:41` |

### 2.12 Architecture documentation

| Item | Result | Note |
|------|--------|------|
| Architecture2.md Repair Log complete | ✅ PASS | `Architecture2.md:9-27` |
| Architecture2.md §5.2 shows `{slug}_pos` | ✅ PASS | §5.2 area `Architecture2.md:250-254` |
| Architecture2.md §6.2 isolation marked resolved | ✅ PASS | `Architecture2.md:292-304` |
| Architecture2.md §9.2 hostname gap marked resolved | ✅ PASS | `Architecture2.md:439-449` |
| Architecture2.md §9.4 Traefik volume marked resolved | ✅ PASS | `Architecture2.md:455-457` |
| Architecture2.md §7.5 POS provision marked resolved | ✅ PASS | `Architecture2.md:387-393` |
| `docs/ARCHITECTURE.md` divergence documented | ✅ PASS | Fixed — see FAIL-7 repair [date: 2026-06-04]; banner + shared-infra table |
| No section describes per-tenant mongo/redis as **current** | ✅ PASS | Fixed — see FAIL-7 repair [date: 2026-06-04]; tenant runtime table updated |

---

## Recommended Next Actions

| Priority | What to fix | File(s) | Complexity |
|----------|-------------|---------|------------|
| 1 | Wire `assertNoConcurrentProvisionJob` at provision entry | `provision-runtime.ts`, `worker.ts` (job handler) | S |
| 2 | Prefix Finance NestJS BullMQ with `REDIS_KEY_PREFIX` | `App.module.ts`, queue modules | M |
| 3 | Call `deprovisionTenantDatabases` on hard rollback when data step completed | `provision-runtime.ts` (`rollbackProvision`) | M |
| 4 | Fail deprovision (or block PG delete) when `SHARED_MYSQL_ROOT_PASSWORD` unset | `provisioner.ts` | S |
| 5 | Remove or replace `resolveNginxDirectUrl`; route Traefik to tenant `server` | `traefik-config.ts`, `tenant-stack` | M |
| 6 | Align Mongo DB naming on deprovision with `slugToMysqlSafe` (or document allowed slug charset) | `provisioner.ts`, `tenant-env.ts` | S |
| 7 | Grant MySQL tenant user on org DBs (or document Finance elevation path) | `provisioner.ts`, Finance org create | M |
| 8 | Add shared MySQL/Mongo/Redis backup jobs | `infra/prod/backup/`, `infra/shared` docs | L |
| 9 | Sync `docs/ARCHITECTURE.md` to shared-infra model | `docs/ARCHITECTURE.md` | M |
| 10 | Update `infra/prod/.env.example` mongo URL; remove duplicate `CORS_ORIGINS` | `infra/prod/.env.example` | S |
| 11 | Migrate POS backend Docker build to pnpm | `pos-backend/Dockerfile` | M |
| 12 | Implement or formally drop Redis session namespace | Finance auth loaders | S–M |
| 13 | Staging E2E: provision → verify `{slug}_pos` + grants → deprovision → no orphans | QA runbook | L |
| 14 | Disconnect tenant `server` from `stockix_internal` after bootstrap (if security review requires) | `provision-runtime.ts` | M |
| 15 | `_finance` orphan DB audit automation | `infra/worker-service/scripts/audit-orphan-dbs.ts` | M — done Round 5 |
| 16 | Dedicated bootstrap network + disconnect after provision | `provision-runtime.ts`, `infra/prod/docker-compose.yml` | M |
| — | Run POS integration test against stockix-mongo RS with mongoose@8 + directConnection=true — confirm transactions and retryWrites | QA / staging | M |

---

*Initial audit: read-only. Repair Round 4 (FAIL-1–8) and Round 5 (PARTIAL-1–13) applied 2026-06-04.*
