# Stockix — Architecture Alignment Checker
**Generated:** 2026-06-05
**Branch:** architecture
**Purpose:** Verify no old per-tenant infrastructure patterns remain active.

---

## Summary
| Category | Count |
|----------|-------|
| 🔴 BROKEN — must fix | 3 |
| 🟡 STALE — comments/docs to clean | 38 |
| 🟢 OK — false positives | 12 |
| Total matches found | 53 |

**Overall verdict:** NEEDS FIXES

---

## 🔴 BROKEN — Active code with old patterns (must fix)

### B1 — Prebuild Phase 3 builds removed per-tenant mysql/redis services
**File:** `scripts/prebuild-tenant-images.mjs:187`
**Found:** `Compose build mysql + redis (cache warm)`
**Problem:** `infra/tenant-stack/docker-compose.yml` no longer defines `mysql` or `redis` services. `docker compose … build mysql redis` fails, breaking `pnpm docker:prebuild`.
**Fix:** Remove Phase 3 (lines 171–191) and drop `MYSQL_VOLUME_NAME: "stockix_prebuild_mysql"` from `composeEnv`. Prebuild should only build `server` and `database_migration` images (plus POS images via separate script).

### B2 — Required tenant image gate still mandates per-tenant webapp/nginx
**File:** `infra/worker-service/domain/provisioning/required-tenant-images.ts:6`
**Found:** `"stockix-webapp:local"`
**Problem:** `assertRequiredTenantImages()` throws before provision if `stockix-webapp:local` or `stockix-nginx:local` are missing, even though `infra/tenant-stack/docker-compose.yml` only runs `server` + `database_migration`. Provisioning fails unless operators build deprecated images.
**Fix:** Remove `"stockix-webapp:local"` and `"stockix-nginx:local"` from `REQUIRED_STOCKIX_TENANT_IMAGES`. Mirror the change in `scripts/prebuild-tenant-images.mjs` (`REQUIRED_FINANCE_IMAGES`) and `scripts/dev-stockix.mjs` (`TENANT_IMAGE_TAGS`).

### B3 — Prebuild still builds deprecated per-tenant webapp/nginx images
**File:** `scripts/prebuild-tenant-images.mjs:139`
**Found:** `Build stockix-webapp`
**Problem:** Prebuild spends time building images that tenant compose no longer references. Combined with B2, operators must run obsolete build steps to pass the image gate.
**Fix:** Remove webapp/nginx build steps (lines 135–168). Keep only `stockix-server:local` and `stockix-database-migration:local` in the Finance prebuild list.

---

## 🟡 STALE — Comments/docs with old references (should clean)

| # | File:line | Old reference | Action needed |
|---|-----------|--------------|---------------|
| 1 | `infra/worker-service/domain/traefik-config.ts:22` | `stockix-nginx` future routing comment | Update or remove stale TODO |
| 2 | `infra/tenant-stack/docker-compose.yml:8-10` | `shared-mysql`, `shared-mongo`, `tenant-redis` in header comments | Update to canonical `stockix-mysql`, `stockix-mongo`, `stockix-redis` |
| 3 | `infra/tenant-stack/docker-compose.yml:15-17` | Deprecated per-tenant webapp note | Keep until static-copy step lands, or close tracked item |
| 4 | `infra/tenant-stack/docker-compose.yml:59-85` | Hardcoded `DB_HOST=shared-mysql`, `REDIS_HOST=tenant-redis` | Align env defaults to `stockix-mysql` / `stockix-redis` (aliases work today) |
| 5 | `infra/tenant-stack/docker-compose.yml:126-132` | `DB_HOST=shared-mysql` in migration service | Same as #4 |
| 6 | `infra/tenant-stack/docker-compose.local-webapp.yml:17` | `stockix-webapp:local` per-tenant override | Remove file or mark archived — base compose has no `webapp` service |
| 7 | `infra/pos-tenant-stack/docker-compose.yml:9-10` | `shared-mongo`, `tenant-redis` in comments | Update to `stockix-mongo`, `stockix-redis` |
| 8 | `infra/pos-tenant-stack/docker-compose.yml:34-36` | Comments reference `shared-mongo`, `tenant-redis` | Update comment text |
| 9 | `infra/pos-tenant-stack/docker-compose.yml:149` | `shared-mongo and tenant-redis` | Update comment text |
| 10 | `infra/prod/.env.example:27-31` | `SHARED_MYSQL_HOST=shared-mysql`, etc. | Change defaults to `stockix-mysql`, `stockix-mongo`, `stockix-redis` |
| 11 | `infra/prod/docker-compose.yml:59-62` | `SHARED_MYSQL_HOST: shared-mysql`, etc. | Same as #10 |
| 12 | `infra/prod/docker-compose.yml:407` | Comment `shared-mysql, shared-mongo, tenant-redis` | Update comment |
| 13 | `infra/prod/.env:168` | `MONGODB_DATABASE_URL=mongodb://mongo/stockix` | Replace with placeholder matching `.env.example` (tenant env is built per-slug, but stale value is misleading) |
| 14 | `infra/worker-service/domain/provisioning/tenant-env.ts:70` | Default `shared-mysql` | Change fallback to `stockix-mysql` |
| 15 | `infra/worker-service/domain/provisioning/tenant-env.ts:78` | Default `tenant-redis` | Change fallback to `stockix-redis` |
| 16 | `infra/worker-service/domain/provisioning/tenant-env.ts:84-97` | Comments `shared-mongo`, `tenant-redis` | Update comments |
| 17 | `infra/worker-service/domain/provisioning/tenant-env.ts:137` | `MYSQL_VOLUME_NAME` legacy field | Remove once all callers stop passing `mysqlVolumeName` |
| 18 | `infra/worker-service/domain/provisioner.ts:37` | Default `shared-mysql` | Change to `stockix-mysql` |
| 19 | `infra/worker-service/domain/provisioner.ts:45` | Default `shared-mongo` | Change to `stockix-mongo` |
| 20 | `infra/worker-service/domain/provisioner.ts:194-196` | Log messages `shared-mongo` | Update log strings |
| 21 | `infra/worker-service/domain/provisioning/compose-project-name.ts:5-7` | `tenantMysqlVolumeName` per-tenant volume | Remove function; no per-tenant MySQL volumes in shared-infra model |
| 22 | `infra/worker-service/domain/provisioning/tenant-docker-workflow.ts:14-28` | `executeDataStep` composes `mysql`, `mongo`, `redis` | Delete dead function (provision-runtime uses `provisionTenantDatabases`) |
| 23 | `infra/worker-service/domain/provisioning/tenant-docker-workflow.ts:45-60` | `executeAppStep` composes `webapp`, `nginx`, `server` | Delete dead function (provision-runtime only runs `server`) |
| 24 | `infra/worker-service/src/provision-runtime.ts:699` | `tenantMysqlVolumeName(input.slug)` | Stop computing/passing per-tenant MySQL volume name |
| 25 | `infra/worker-service/src/provision-runtime.ts:1293` | `mysqlVolumeName` in env params | Remove from `buildTenantEnvMap` call |
| 26 | `infra/worker-service/src/provision-runtime.ts:1416` | `mysqlVolumeName` in env params | Remove from `buildTenantEnvMap` call |
| 27 | `packages/db/src/schema.ts:193` | Comment `mongodb://mongo/stockix` | Update JSDoc to `mongodb://stockix-mongo:27017/{slug}_pos?replicaSet=rs0` |
| 28 | `scripts/cleanup-tenant-docker-local.mjs:26-27` | `stockix-nginx:local`, `stockix-webapp:local` | Remove from cleanup list |
| 29 | `scripts/dev-stockix.mjs:41-44` | `TENANT_IMAGE_TAGS` includes webapp/nginx | Remove deprecated tags |
| 30 | `services/stockix-finance/docker-compose.prod.yml:6-31` | Per-tenant `nginx`, `webapp` services | Legacy standalone compose — archive or add deprecation banner |
| 31 | `services/stockix-finance/docker-compose.prod.yml:66` | `DB_HOST=mysql` | Legacy compose only; not used by tenant-stack provisioner |
| 32 | `services/stockix-finance/docker-compose.prod.yml:103` | `DB_HOST=mysql` | Same as #31 |
| 33 | `services/stockix-finance/docker-compose.prod.yml:115+` | `mysql`, `mongo`, `redis` service definitions | Entire file is pre-shared-infra standalone layout |

---

## 🟢 OK — False positives (no action needed)

| # | File:line | Why it's OK |
|---|-----------|-------------|
| 1 | `infra/shared/docker-compose.yml:30` | Shared `stockix-mysql` service correctly uses `mysql:8.0-bookworm` — not per-tenant |
| 2 | `infra/shared/docker-compose.yml:52` | `shared-mysql` is a Docker network **alias** for `stockix-mysql` (backward compat) |
| 3 | `infra/shared/docker-compose.yml:86` | `shared-mongo` alias for `stockix-mongo` |
| 4 | `infra/shared/docker-compose.yml:155` | `tenant-redis` alias for `stockix-redis` |
| 5 | `infra/shared/docker-compose.yml:174` | `stockix-nginx` is the **shared** static gateway (new architecture) |
| 6 | `infra/shared/docker-compose.yml:185` | `stockix-nginx` network alias |
| 7 | `services/stockix-finance/.github/workflows/generate-openapi.yml:71` | CI test service `mysql:8.0` — unrelated to tenant provisioning |
| 8 | `services/stockix-finance/.github/workflows/e2e.yml:34` | CI test service `mariadb:10.6` |
| 9 | `services/chatlive/docker-compose.yaml:98` | Separate ChatLive product stack |
| 10 | `services/chatlive/docker-compose.test.yaml:54` | ChatLive test stack |
| 11 | `services/chatlive/docker-compose.production.yaml:51` | ChatLive production stack |
| 12 | `services/chatlive/.github/workflows/run_foss_spec.yml:79` | ChatLive CI |
| 13 | `services/stockix-finance/docker-compose.yml:47-48` | Local Finance dev volume name — standalone dev, not tenant provisioner |
| 14 | `infra/worker-service/src/provision-runtime.ts:850` | `mongoUrlPersisted` calls `buildTenantMongoUrl()` — correct per-slug URL |
| 15 | `infra/worker-service/domain/provisioning/tenant-env.ts:74` | `sharedMongoHost()` already defaults to `stockix-mongo` |

---

## Check Results by Category

### Check 1 — Old per-tenant DB images
```
infra/shared/docker-compose.yml:30:    image: mysql:8.0-bookworm          [🟢 OK — shared stockix-mysql]
services/stockix-finance/.github/workflows/generate-openapi.yml:71:  image: mysql:8.0   [🟢 OK — CI]
services/stockix-finance/.github/workflows/e2e.yml:34:        image: mariadb:10.6     [🟢 OK — CI]
services/chatlive/docker-compose.yaml:98:                   image: redis:alpine    [🟢 OK — ChatLive]
services/chatlive/docker-compose.test.yaml:54:                image: redis:alpine    [🟢 OK — ChatLive]
services/chatlive/docker-compose.production.yaml:51:          image: redis:alpine    [🟢 OK — ChatLive]
services/chatlive/.github/workflows/run_foss_spec.yml:79:     image: redis:alpine    [🟢 OK — ChatLive CI]
```
No per-tenant `stockix-prebuild-mysql`, `mongo:5.0`, or `redis:alpine` in `infra/tenant-stack` or `infra/pos-tenant-stack`.

### Check 2 — Old webapp/nginx services
```
infra/shared/docker-compose.yml:174:                          stockix-nginx:        [🟢 OK — shared gateway]
infra/shared/docker-compose.yml:185:                          - stockix-nginx       [🟢 OK — alias]
infra/worker-service/domain/traefik-config.ts:22:             stockix-nginx         [🟡 STALE — comment]
infra/tenant-stack/docker-compose.yml:16:                     stockix-nginx         [🟡 STALE — comment]
infra/worker-service/domain/provisioning/required-tenant-images.ts:6:  stockix-webapp:local  [🔴 BROKEN]
infra/worker-service/domain/provisioning/required-tenant-images.ts:9:  stockix-nginx:local   [🔴 BROKEN]
infra/tenant-stack/docker-compose.local-webapp.yml:17:        stockix-webapp:local  [🟡 STALE]
services/stockix-finance/docker-compose.prod.yml:7:           stockix-nginx-gateway [🟡 STALE — legacy]
services/stockix-finance/docker-compose.prod.yml:31:          stockix-webapp        [🟡 STALE — legacy]
scripts/prebuild-tenant-images.mjs:44:                        stockix-webapp:local  [🔴 BROKEN — with B2/B3]
scripts/prebuild-tenant-images.mjs:47:                        stockix-nginx:local   [🔴 BROKEN — with B2/B3]
scripts/prebuild-tenant-images.mjs:135-140:                   stockix-webapp build  [🔴 BROKEN]
scripts/prebuild-tenant-images.mjs:165-168:                   stockix-nginx build   [🔴 BROKEN]
scripts/prebuild-tenant-images.mjs:177:                       stockix-prebuild      [🟡 STALE — project name in Phase 3]
scripts/prebuild-tenant-images.mjs:188:                       stockix-prebuild build mysql redis [🔴 BROKEN]
scripts/cleanup-tenant-docker-local.mjs:26-27:                stockix-nginx/webapp  [🟡 STALE]
scripts/dev-stockix.mjs:41-44:                                stockix-webapp/nginx  [🟡 STALE]
```

### Check 3 — Old shared MongoDB URL
```
infra/prod/.env:168:                    MONGODB_DATABASE_URL=mongodb://mongo/stockix  [🟡 STALE]
packages/db/src/schema.ts:193:          mongodb://mongo/stockix (JSDoc example)       [🟡 STALE]
```
Note: `infra/prod/.env.example:166` already documents the correct `{slug}_pos` URL pattern.

### Check 4 — Old hostname references (shared-mysql, tenant-redis)
```
infra/shared/docker-compose.yml:52:           - shared-mysql       [🟢 OK — alias]
infra/shared/docker-compose.yml:86:           - shared-mongo       [🟢 OK — alias]
infra/shared/docker-compose.yml:155:          - tenant-redis       [🟢 OK — alias]
infra/prod/.env.example:27:                   SHARED_MYSQL_HOST=shared-mysql     [🟡 STALE]
infra/prod/.env.example:29:                   SHARED_MONGO_HOST=shared-mongo     [🟡 STALE]
infra/prod/.env.example:31:                   TENANT_REDIS_HOST=tenant-redis    [🟡 STALE]
infra/prod/docker-compose.yml:59:             SHARED_MYSQL_HOST: shared-mysql    [🟡 STALE]
infra/prod/docker-compose.yml:61:             SHARED_MONGO_HOST: shared-mongo    [🟡 STALE]
infra/prod/docker-compose.yml:62:             TENANT_REDIS_HOST: tenant-redis     [🟡 STALE]
infra/prod/docker-compose.yml:407:            comment shared-mysql/shared-mongo/tenant-redis [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:70:   shared-mysql default  [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:78:   tenant-redis default  [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:141:  comment shared-mysql  [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:164:  comment shared-mongo  [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:169:  comment tenant-redis  [🟡 STALE]
infra/worker-service/domain/provisioner.ts:37:               shared-mysql default  [🟡 STALE]
infra/worker-service/domain/provisioner.ts:45:               shared-mongo default  [🟡 STALE]
infra/worker-service/domain/provisioner.ts:128:              comment shared-mongo  [🟡 STALE]
infra/worker-service/domain/provisioner.ts:194-196:          shared-mongo logs     [🟡 STALE]
infra/tenant-stack/docker-compose.yml:8-10:                  comments              [🟡 STALE]
infra/tenant-stack/docker-compose.yml:59-85:                 DB_HOST/REDIS_HOST    [🟡 STALE — aliases work]
infra/tenant-stack/docker-compose.yml:126-132:               DB_HOST migration     [🟡 STALE]
infra/tenant-stack/docker-compose.yml:152:                   comment               [🟡 STALE]
infra/pos-tenant-stack/docker-compose.yml:9-10:              comments              [🟡 STALE]
infra/pos-tenant-stack/docker-compose.yml:34-36:             comments              [🟡 STALE]
infra/pos-tenant-stack/docker-compose.yml:149:             comment               [🟡 STALE]
```
Runtime note: all three legacy hostnames resolve today via Docker network aliases on `stockix-shared`. Issue is naming alignment, not connectivity.

### Check 5 — Old POS services (pos-mongo, pos-redis)
✅ No matches found

### Check 6 — Old prebuild Phase 3
```
scripts/prebuild-tenant-images.mjs:171:  Warm mysql/redis build cache (comment)
scripts/prebuild-tenant-images.mjs:187:  Compose build mysql + redis (cache warm)  [🔴 BROKEN]
scripts/prebuild-tenant-images.mjs:188:  docker compose … build mysql redis        [🔴 BROKEN]
```

### Check 7 — Node 20 remaining
✅ No matches found

### Check 8 — Old compose up (webapp, nginx)
```
infra/worker-service/domain/provisioning/tenant-docker-workflow.ts:57:  "webapp"  [🟡 STALE — dead code]
infra/worker-service/domain/provisioning/tenant-docker-workflow.ts:58:  "nginx"   [🟡 STALE — dead code]
```
Active provision path (`provision-runtime.ts:1531-1537`) correctly runs only `"server"`.

### Check 9 — Old MYSQL_VOLUME_NAME
```
infra/worker-service/src/provision-runtime.ts:699:   mysqlVolumeName = tenantMysqlVolumeName(...)  [🟡 STALE]
infra/worker-service/src/provision-runtime.ts:1293:  mysqlVolumeName                               [🟡 STALE]
infra/worker-service/src/provision-runtime.ts:1416:  mysqlVolumeName                               [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:13:   mysqlVolumeName param             [🟡 STALE]
infra/worker-service/domain/provisioning/tenant-env.ts:137:  MYSQL_VOLUME_NAME in env map      [🟡 STALE]
services/stockix-finance/docker-compose.yml:47-48:     MYSQL_VOLUME_NAME local dev           [🟢 OK]
scripts/prebuild-tenant-images.mjs:183:              stockix_prebuild_mysql                [🔴 BROKEN — Phase 3]
```

### Check 10 — Old DB_HOST=mysql
```
services/stockix-finance/docker-compose.prod.yml:66:   DB_HOST=mysql  [🟡 STALE — legacy standalone compose]
services/stockix-finance/docker-compose.prod.yml:103:  DB_HOST=mysql  [🟡 STALE — legacy standalone compose]
```
`infra/tenant-stack/docker-compose.yml` correctly uses `DB_HOST=shared-mysql` (alias). No `DB_HOST=mysql` in `infra/`.

### Check 11 — Old mongoUrl persisted value
```
infra/worker-service/src/provision-runtime.ts:850:   mongoUrlPersisted = buildTenantMongoUrl(input.slug)  [🟢 OK]
infra/worker-service/src/provision-runtime.ts:1276:  mongoUrl: mongoUrlPersisted                        [🟢 OK]
packages/db/src/schema.ts:193:                       mongodb://mongo/stockix (JSDoc)                    [🟡 STALE]
```
`buildTenantMongoUrl()` produces `mongodb://{host}:27017/{slug}_pos?replicaSet=rs0&directConnection=true`.

### Check 12 — Old network default names
✅ No matches found

---

## Action Plan

### Immediate fixes (🔴 BROKEN items):
1. **`scripts/prebuild-tenant-images.mjs`** — Delete Phase 3 (`build mysql redis`) and webapp/nginx build blocks. Keep only `stockix-server:local` + `stockix-database-migration:local`.
2. **`infra/worker-service/domain/provisioning/required-tenant-images.ts`** — Remove `stockix-webapp:local` and `stockix-nginx:local` from `REQUIRED_STOCKIX_TENANT_IMAGES`.
3. **`scripts/dev-stockix.mjs`** — Remove webapp/nginx from `TENANT_IMAGE_TAGS` so dev startup matches the slim tenant compose.

### Cleanup (🟡 STALE items):
1. Rename env defaults from `shared-mysql` / `shared-mongo` / `tenant-redis` → `stockix-mysql` / `stockix-mongo` / `stockix-redis` in `infra/prod/.env.example`, `infra/prod/docker-compose.yml`, `tenant-env.ts`, `provisioner.ts`, and `infra/tenant-stack/docker-compose.yml`.
2. Fix `infra/prod/.env:168` `MONGODB_DATABASE_URL` to match `.env.example` placeholder (or remove — value is built per-tenant).
3. Delete dead functions `executeDataStep` / `executeAppStep` in `tenant-docker-workflow.ts`.
4. Remove `tenantMysqlVolumeName`, `mysqlVolumeName`, and `MYSQL_VOLUME_NAME` plumbing from provision-runtime + tenant-env.
5. Archive or banner `services/stockix-finance/docker-compose.prod.yml` and `infra/tenant-stack/docker-compose.local-webapp.yml`.
6. Update JSDoc in `packages/db/src/schema.ts:193`.
7. Update `scripts/cleanup-tenant-docker-local.mjs` image list.

---

## Architecture Alignment Score
- Checks run: 12
- Clean checks: 3 (Checks 5, 7, 12)
- Checks with issues: 9
- Broken items: 3
- Score: 25%
