# Stockix — Architecture Alignment Checker
**Generated:** 2026-06-05 (post-repair)
**Branch:** architecture
**Purpose:** Verify no old per-tenant infrastructure patterns remain active.

---

## Summary
| Category | Count |
|----------|-------|
| 🔴 BROKEN — must fix | 0 |
| 🟡 STALE — comments/docs to clean | 3 |
| 🟢 OK — false positives | 14 |
| Total matches found | 17 |

**Overall verdict:** CLEAN

---

## Resolved (2026-06-05 repair)

| ID | Issue | Fix applied |
|----|-------|-------------|
| B1 | Prebuild Phase 3 `build mysql redis` | Removed from `scripts/prebuild-tenant-images.mjs` |
| B2 | `REQUIRED_STOCKIX_TENANT_IMAGES` required webapp/nginx | Trimmed to `server` + `database_migration` only |
| B3 | Prebuild built deprecated webapp/nginx | Removed build steps; slimmed base image pulls |
| — | Hostname defaults `shared-mysql` / `tenant-redis` | Canonicalized to `stockix-mysql` / `stockix-mongo` / `stockix-redis` |
| — | `mysqlVolumeName` / `MYSQL_VOLUME_NAME` legacy | Removed from provision path |
| — | Dead `executeDataStep` / `executeAppStep` | Removed from `tenant-docker-workflow.ts` |
| — | `docker-compose.local-webapp.yml` | Deleted (no `webapp` service in base compose) |
| — | `infra/prod/.env` stale Mongo URL | Updated to per-slug placeholder pattern |

---

## 🔴 BROKEN — Active code with old patterns (must fix)

None.

---

## 🟡 STALE — Comments/docs with old references (should clean)

| # | File:line | Old reference | Action needed |
|---|-----------|--------------|---------------|
| 1 | `services/stockix-finance/docker-compose.prod.yml:11` | `stockix-nginx-gateway` | Legacy standalone compose — deprecation banner added; archive when confirmed unused |
| 2 | `services/stockix-finance/docker-compose.prod.yml:35` | `stockix-webapp` | Same as #1 |
| 3 | `services/stockix-finance/docker-compose.prod.yml:70,107` | `DB_HOST=mysql` | Same as #1 — not used by tenant provisioner |

---

## 🟢 OK — False positives (no action needed)

| # | File:line | Why it's OK |
|---|-----------|-------------|
| 1 | `infra/shared/docker-compose.yml:30` | Shared `stockix-mysql` service — not per-tenant |
| 2 | `infra/shared/docker-compose.yml:52` | `shared-mysql` Docker network alias for `stockix-mysql` |
| 3 | `infra/shared/docker-compose.yml:86` | `shared-mongo` alias for `stockix-mongo` |
| 4 | `infra/shared/docker-compose.yml:155` | `tenant-redis` alias for `stockix-redis` |
| 5 | `infra/shared/docker-compose.yml:174` | Shared `stockix-nginx` gateway (new architecture) |
| 6 | `infra/shared/docker-compose.yml:185` | `stockix-nginx` network alias |
| 7 | `infra/tenant-stack/docker-compose.yml:13` | Comment referencing shared `stockix-nginx` CDN |
| 8 | `infra/worker-service/domain/traefik-config.ts:22` | Comment referencing shared `stockix-nginx` |
| 9 | `services/stockix-finance/.github/workflows/generate-openapi.yml:71` | CI test `mysql:8.0` |
| 10 | `services/stockix-finance/.github/workflows/e2e.yml:34` | CI test `mariadb:10.6` |
| 11 | `services/chatlive/docker-compose*.yaml` | Separate ChatLive product stacks |
| 12 | `services/chatlive/.github/workflows/run_foss_spec.yml:79` | ChatLive CI |
| 13 | `services/stockix-finance/docker-compose.yml:47-48` | Local Finance dev volume — standalone dev only |
| 14 | `infra/worker-service/src/provision-runtime.ts:849` | `mongoUrlPersisted` uses `buildTenantMongoUrl()` — correct per-slug URL |

---

## Check Results by Category

### Check 1 — Old per-tenant DB images
```
infra/shared/docker-compose.yml:30:    image: mysql:8.0-bookworm          [🟢 OK — shared stockix-mysql]
services/stockix-finance/.github/workflows/generate-openapi.yml:71       [🟢 OK — CI]
services/stockix-finance/.github/workflows/e2e.yml:34                    [🟢 OK — CI]
services/chatlive/docker-compose*.yaml + CI                              [🟢 OK — ChatLive]
scripts/                                                                 ✅ No matches
```
No per-tenant `stockix-prebuild-mysql`, `mongo:5.0`, or tenant-stack DB services.

### Check 2 — Old webapp/nginx services
```
infra/shared/docker-compose.yml:174,185                                  [🟢 OK — shared gateway]
infra/tenant-stack/docker-compose.yml:13                                 [🟢 OK — comment]
infra/worker-service/domain/traefik-config.ts:22                         [🟢 OK — comment]
services/stockix-finance/docker-compose.prod.yml:11,35                   [🟡 STALE — deprecated legacy]
scripts/                                                                 ✅ No matches
required-tenant-images.ts                                                ✅ No webapp/nginx required
```

### Check 3 — Old shared MongoDB URL
✅ No matches found in `infra/`, `packages/`, `apps/`, `scripts/`

### Check 4 — Old hostname references (shared-mysql, tenant-redis)
```
infra/shared/docker-compose.yml:52,86,155                                [🟢 OK — intentional network aliases]
```
All tenant/provision defaults now use `stockix-mysql`, `stockix-mongo`, `stockix-redis`.

### Check 5 — Old POS services (pos-mongo, pos-redis)
✅ No matches found

### Check 6 — Old prebuild Phase 3
✅ No matches found

### Check 7 — Node 20 remaining
✅ No matches found

### Check 8 — Old compose up (webapp, nginx)
✅ No matches found in `infra/worker-service/`

### Check 9 — Old MYSQL_VOLUME_NAME
```
services/stockix-finance/docker-compose.yml:47-48                        [🟢 OK — local Finance dev only]
infra/, scripts/                                                       ✅ No provision-path matches
```

### Check 10 — Old DB_HOST=mysql
```
services/stockix-finance/docker-compose.prod.yml:70,107                  [🟡 STALE — deprecated legacy]
infra/                                                                   ✅ No matches
```

### Check 11 — Old mongoUrl persisted value
```
infra/worker-service/src/provision-runtime.ts:849,1275                   [🟢 OK — buildTenantMongoUrl()]
packages/db/src/schema.ts                                                ✅ Updated JSDoc
```

### Check 12 — Old network default names
✅ No matches found

---

## Action Plan

### Immediate fixes (🔴 BROKEN items):
None required — all broken items resolved.

### Optional cleanup (🟡 STALE items):
1. Archive or remove `services/stockix-finance/docker-compose.prod.yml` once standalone Finance deploys are confirmed retired.

---

## Architecture Alignment Score
- Checks run: 12
- Clean checks: 12
- Checks with issues: 0 (active provisioning paths)
- Broken items: 0
- Score: 100%

**Provisioning path:** `REQUIRED_STOCKIX_TENANT_IMAGES` = `stockix-server:local` + `stockix-database-migration:local` — matches `infra/tenant-stack/docker-compose.yml`.
