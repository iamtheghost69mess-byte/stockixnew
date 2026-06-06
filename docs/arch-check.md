# Stockix — Architecture Alignment Check
**Generated:** 2026-06-07
**Branch:** architecture

## Summary
| Total checks | ✅ Pass | ❌ Broken | ⚠️ Partial | ❓ Missing |
|-------------|---------|----------|-----------|----------|
| 26 | 24 | 1 | 1 | 0 |

**Verdict:** NEEDS FIXES

---

## Layer Checks (L1-L3)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| L1 | `infra/shared/docker-compose.yml` has ONLY: stockix-mysql, stockix-mongo, stockix-mongo-rs-init, stockix-redis (no per-tenant services) | ❌ BROKEN | Expected 4 services; file also defines `stockix-nginx` at `infra/shared/docker-compose.yml:174-191` (lines 29-168 are the four required services) |
| L2 | `infra/tenant-stack/docker-compose.yml` has ONLY: server, database_migration (no mysql, mongo, redis, nginx, webapp) | ✅ CONFIRMED | Services: `server` at `infra/tenant-stack/docker-compose.yml:18-111`, `database_migration` at `infra/tenant-stack/docker-compose.yml:113-142`; no mysql/mongo/redis/nginx/webapp services |
| L3 | `infra/pos-tenant-stack/docker-compose.yml` has NO: pos-mongo, pos-redis, pos-mongo-init | ✅ CONFIRMED | Services present: `pos-backend:17`, `pos-platform-worker:60`, `pos-bigcapital-worker:95`, `pos-frontend:126`; no pos-mongo/pos-redis/pos-mongo-init |

## Provisioning Checks (P1-P8)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| P1 | `provision-runtime.ts` calls `provisionTenantDatabases()` in `docker.data_step` (not docker compose up mysql) | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1541-1548` — `hasOp("docker.data_step")` guard, dynamic import, `await provisionTenantDatabases(...)` |
| P2 | `provision-runtime.ts` `docker.app_step` runs only `"server"` (not webapp, nginx) | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1585-1592` — `runComposeWithCancellation(["up", "-d", "--remove-orphans", "--force-recreate", "--no-build", "server"])` |
| P3 | `provision-runtime.ts` `docker.migration_step` runs `"database_migration"` | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1564-1565` — `runComposeWithCancellation(["run", "--rm", "database_migration"])` |
| P4 | `provision-runtime.ts` journals `docker.network_connect` with hasOp/markOp | ✅ CONFIRMED | Guard at `infra/worker-service/src/provision-runtime.ts:1619`; `markOp("docker.network_connect", ...)` at `infra/worker-service/src/provision-runtime.ts:1631-1635`; resume skip at `1647-1651` |
| P5 | `provision-runtime.ts` calls `edge.publish()` after health check | ✅ CONFIRMED | Health check journaled at `infra/worker-service/src/provision-runtime.ts:1669-1681`; `edge.publish(...)` at `infra/worker-service/src/provision-runtime.ts:2199-2206` (after bootstrap-admin and build-organization steps) |
| P6 | `required-tenant-images.ts` does NOT include stockix-webapp:local or stockix-nginx:local | ✅ CONFIRMED | `infra/worker-service/domain/provisioning/required-tenant-images.ts:5-8` — only `stockix-server:local` and `stockix-database-migration:local` |
| P7 | `scripts/prebuild-tenant-images.mjs` does NOT build webapp or nginx images | ✅ CONFIRMED | Builds only server/migration at `scripts/prebuild-tenant-images.mjs:131-145`; no webapp/nginx references in file |
| P8 | `scripts/prebuild-tenant-images.mjs` Phase 3 does NOT run "build mysql redis" | ✅ CONFIRMED | Phase 3 is verify-only at `scripts/prebuild-tenant-images.mjs:148-149` (`verifyImages()`); no mysql/redis build commands |

## Isolation Checks (I1-I6)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| I1 | `provisioner.ts` creates databases named `stockix_{safe}_finance` and `stockix_{safe}_system` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:148-149` (names), `185-188` (`CREATE DATABASE`) |
| I2 | `provisioner.ts` creates user named `tenant_{safe}` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:150` (name), `192` (`CREATE USER IF NOT EXISTS '${tenantUser}'@'%'`) |
| I3 | `provisioner.ts` GRANTs on `stockix_{safe}_%.*` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:203` — ``GRANT ALL PRIVILEGES ON \`stockix_${safe}_%\`.* TO '${tenantUser}'@'%'`` |
| I4 | `tenant-env.ts` builds MONGODB_URI as `mongodb://{host}:27017/{slug}_pos?replicaSet=rs0` | ⚠️ PARTIAL | `infra/worker-service/domain/provisioning/tenant-env.ts:89-91` — correct host/db/replicaSet; adds `&directConnection=true` query param not in spec |
| I5 | `tenant-env.ts` sets `REDIS_KEY_PREFIX=tenant:{slug}:` | ✅ CONFIRMED | `infra/worker-service/domain/provisioning/tenant-env.ts:107-108` (`buildTenantRedisKeyPrefix`), `172` (`REDIS_KEY_PREFIX: redisKeyPrefix`) |
| I6 | `traefik-config.ts` writes `tenant-{slug}.yml` | ✅ CONFIRMED | `infra/worker-service/domain/traefik-config.ts:39` — `writeFile(join(dir, \`tenant-${slug}.yml\`), config, "utf8")`; invoked via `TraefikEdgePublisher` at `infra/worker-service/domain/provisioning/adapters/traefik-edge-publisher.ts:6` |

## Deprovision Checks (D1-D5)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| D1 | `provisioner.ts` drops databases using `DROP DATABASE stockix_{safe}_finance` and `stockix_{safe}_system` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:318-319` |
| D2 | `provisioner.ts` drops MongoDB database `{slug}_pos` via mongosh | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:344-368` — `db.getSiblingDB('${slug}_pos').dropDatabase()` via `docker exec ... mongosh` |
| D3 | `provisioner.ts` flushes Redis keys `tenant:{slug}:*` | ✅ CONFIRMED | Pattern at `infra/worker-service/domain/provisioner.ts:98`; SCAN+DEL Lua script at `107-110`; called from `deprovisionTenantDatabases` at `376` |
| D4 | `provisioner.ts` deletes Traefik YAML files | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:534-541` — `edgePublisher.unpublish(row.slug)` + `removePosTraefikConfig(row.slug)`; finance file removal in `traefik-config.ts:42-44` |
| D5 | `provisioner.ts` deletes Postgres rows LAST (after all data-plane cleanup) | ✅ CONFIRMED | Data-plane teardown first: compose down `469-520`, DB/Redis cleanup `525-529`, Traefik `531-545`; Postgres delete `559-563` only after `dataPlaneClean` gate at `547-557`; env dir removal `565-570` is post-control-plane metadata (not data-plane) |

## Shared Infra Checks (S1-S4)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| S1 | `infra/prod/docker-compose.yml` infra-worker joins stockix-shared network | ✅ CONFIRMED | `infra/prod/docker-compose.yml:334-338` — `networks:` includes `stockix-shared` |
| S2 | `infra/shared/docker-compose.yml` stockix-mysql has `hostname: stockix-mysql` | ✅ CONFIRMED | `infra/shared/docker-compose.yml:32` |
| S3 | `infra/shared/docker-compose.yml` stockix-mongo has replica set rs0 | ✅ CONFIRMED | `infra/shared/docker-compose.yml:80` — `command: ["mongod", "--replSet", "rs0", ...]` |
| S4 | `infra/prod/docker-compose.yml` passes SHARED_MYSQL_HOST, SHARED_MONGO_HOST, TENANT_REDIS_HOST to worker | ✅ CONFIRMED | `infra/prod/docker-compose.yml:59-62` in `x-stockix-platform-env`; worker inherits via `x-stockix-worker-env:75` and `infra-worker.environment:329` |

---

## Broken Items — Fix Required

### [L1] — Shared compose includes extra `stockix-nginx` service
**File:** `infra/shared/docker-compose.yml:174-191`
**Found:** A fifth service `stockix-nginx` is defined alongside the four shared data services (mysql, mongo, mongo-rs-init, redis).
**Expected:** Layer 2 shared infra should contain only `stockix-mysql`, `stockix-mongo`, `stockix-mongo-rs-init`, and `stockix-redis`.
**Fix:** Remove or relocate `stockix-nginx` from `infra/shared/docker-compose.yml` if the architecture spec is authoritative; Finance UI is already served by the per-tenant `server` container via ServeStaticModule (see `infra/tenant-stack/docker-compose.yml:12-13` and `provision-runtime.ts:1605-1608`).

### [I4] — Mongo URI includes extra query parameter (non-blocking)
**File:** `infra/worker-service/domain/provisioning/tenant-env.ts:91`
**Found:** `mongodb://${host}:27017/${slug}_pos?replicaSet=rs0&directConnection=true`
**Expected:** `mongodb://{host}:27017/{slug}_pos?replicaSet=rs0`
**Fix:** Optional — remove `&directConnection=true` if strict spec compliance is required; current value is functionally valid for single-node rs0.

---

## Additional Notes (not in checklist)

- **Deprovision env-dir ordering:** Spec step 7 (`rm -rf {TENANT_ENV_ROOT}/{slug}`) precedes step 8 (Postgres delete). Code deletes Postgres at `provisioner.ts:559-563` then removes env dir at `565-570`. Data-plane safety is preserved (D5 passes); only filesystem cleanup order differs from the written provisioning spec.
- **Control plane L1 services:** `infra/prod/docker-compose.yml` includes all expected Layer 1 services: postgres (`187`), api (`239`), api-bullmq (`273`), dashboard (`292`), traefik (`139`), control-plane-redis (`212`), infra-worker (`320`), socket-proxy (`96`), db-backup (`349`).

---

## Verdict

**NEEDS FIXES** — provisioning runtime, tenant stacks, POS stack, isolation grants, and worker env wiring align with the architecture. **Blocking item:** `stockix-nginx` in shared infra (L1) violates the Layer 2 service list. Resolve L1 before treating shared infra as spec-complete.
