# Stockix — Architecture Alignment Check
**Generated:** 2026-06-07
**Branch:** architecture
**Repaired:** 2026-06-07 (L1, I4, deprovision env-dir ordering)

## Summary
| Total checks | ✅ Pass | ❌ Broken | ⚠️ Partial | ❓ Missing |
|-------------|---------|----------|-----------|----------|
| 26 | 26 | 0 | 0 | 0 |

**Verdict:** ALIGNED

---

## Layer Checks (L1-L3)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| L1 | `infra/shared/docker-compose.yml` has ONLY: stockix-mysql, stockix-mongo, stockix-mongo-rs-init, stockix-redis (no per-tenant services) | ✅ CONFIRMED | Four services only: `stockix-mysql:29`, `stockix-mongo:76`, `stockix-mongo-rs-init:105`, `stockix-redis:130`; `stockix-nginx` removed |
| L2 | `infra/tenant-stack/docker-compose.yml` has ONLY: server, database_migration (no mysql, mongo, redis, nginx, webapp) | ✅ CONFIRMED | Services: `server` at `infra/tenant-stack/docker-compose.yml:18-111`, `database_migration` at `infra/tenant-stack/docker-compose.yml:113-142` |
| L3 | `infra/pos-tenant-stack/docker-compose.yml` has NO: pos-mongo, pos-redis, pos-mongo-init | ✅ CONFIRMED | Services: `pos-backend:17`, `pos-platform-worker:60`, `pos-bigcapital-worker:95`, `pos-frontend:126` |

## Provisioning Checks (P1-P8)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| P1 | `provision-runtime.ts` calls `provisionTenantDatabases()` in `docker.data_step` (not docker compose up mysql) | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1541-1548` |
| P2 | `provision-runtime.ts` `docker.app_step` runs only `"server"` (not webapp, nginx) | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1585-1592` |
| P3 | `provision-runtime.ts` `docker.migration_step` runs `"database_migration"` | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1564-1565` |
| P4 | `provision-runtime.ts` journals `docker.network_connect` with hasOp/markOp | ✅ CONFIRMED | `infra/worker-service/src/provision-runtime.ts:1619`, `1631-1635`, `1647-1651` |
| P5 | `provision-runtime.ts` calls `edge.publish()` after health check | ✅ CONFIRMED | Health at `1669-1681`; `edge.publish` at `2199-2206` |
| P6 | `required-tenant-images.ts` does NOT include stockix-webapp:local or stockix-nginx:local | ✅ CONFIRMED | `infra/worker-service/domain/provisioning/required-tenant-images.ts:5-8` |
| P7 | `scripts/prebuild-tenant-images.mjs` does NOT build webapp or nginx images | ✅ CONFIRMED | `scripts/prebuild-tenant-images.mjs:131-145` |
| P8 | `scripts/prebuild-tenant-images.mjs` Phase 3 does NOT run "build mysql redis" | ✅ CONFIRMED | `scripts/prebuild-tenant-images.mjs:148-149` |

## Isolation Checks (I1-I6)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| I1 | `provisioner.ts` creates databases named `stockix_{safe}_finance` and `stockix_{safe}_system` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:148-149`, `185-188` |
| I2 | `provisioner.ts` creates user named `tenant_{safe}` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:150`, `192` |
| I3 | `provisioner.ts` GRANTs on `stockix_{safe}_%.*` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:203` |
| I4 | `tenant-env.ts` builds MONGODB_URI as `mongodb://{host}:27017/{slug}_pos?replicaSet=rs0` | ✅ CONFIRMED | `infra/worker-service/domain/provisioning/tenant-env.ts:91` |
| I5 | `tenant-env.ts` sets `REDIS_KEY_PREFIX=tenant:{slug}:` | ✅ CONFIRMED | `infra/worker-service/domain/provisioning/tenant-env.ts:107-108`, `172` |
| I6 | `traefik-config.ts` writes `tenant-{slug}.yml` | ✅ CONFIRMED | `infra/worker-service/domain/traefik-config.ts:39` |

## Deprovision Checks (D1-D5)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| D1 | `provisioner.ts` drops databases using `DROP DATABASE stockix_{safe}_finance` and `stockix_{safe}_system` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:318-319` |
| D2 | `provisioner.ts` drops MongoDB database `{slug}_pos` via mongosh | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:344-368` |
| D3 | `provisioner.ts` flushes Redis keys `tenant:{slug}:*` | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:98`, `107-110`, `376` |
| D4 | `provisioner.ts` deletes Traefik YAML files | ✅ CONFIRMED | `infra/worker-service/domain/provisioner.ts:534-541` |
| D5 | `provisioner.ts` deletes Postgres rows LAST (after all data-plane cleanup) | ✅ CONFIRMED | Env dir removed at `559-565`; Postgres delete at `567-571` (after data-plane gate `547-557`) |

## Shared Infra Checks (S1-S4)
| ID | Check | Status | Evidence (file:line) |
|----|-------|--------|---------------------|
| S1 | `infra/prod/docker-compose.yml` infra-worker joins stockix-shared network | ✅ CONFIRMED | `infra/prod/docker-compose.yml:334-338` |
| S2 | `infra/shared/docker-compose.yml` stockix-mysql has `hostname: stockix-mysql` | ✅ CONFIRMED | `infra/shared/docker-compose.yml:32` |
| S3 | `infra/shared/docker-compose.yml` stockix-mongo has replica set rs0 | ✅ CONFIRMED | `infra/shared/docker-compose.yml:80` |
| S4 | `infra/prod/docker-compose.yml` passes SHARED_MYSQL_HOST, SHARED_MONGO_HOST, TENANT_REDIS_HOST to worker | ✅ CONFIRMED | `infra/prod/docker-compose.yml:59-62`, `329` |

---

## Repairs Applied (2026-06-07)

| ID | Change |
|----|--------|
| L1 | Removed `stockix-nginx` service, `stockix_webapp_static` volume, and `stockix_public` network from `infra/shared/docker-compose.yml` |
| I4 | Removed `&directConnection=true` from `buildTenantMongoUrl()` in `tenant-env.ts` |
| Deprovision | Moved env dir `rm -rf` before Postgres delete in `provisioner.ts` |

---

## Verdict

**ALIGNED** — ready to provision.
