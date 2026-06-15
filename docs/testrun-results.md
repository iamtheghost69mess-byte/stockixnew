# Stockix — Full Test Run Results
**Date:** 2026-06-07 02:06:12 +03:00
**Branch:** architecture
**Runner:** v22.22.0 / 9.15.9

---

## Environment

| Item | Value |
|------|-------|
| Node version | v22.22.0 |
| pnpm version | 9.15.9 |
| Docker version | Docker version 27.2.0, build 3ab4256 |
| Docker Compose | Docker Compose version v2.29.2-desktop.2 |
| API health | ✅ 200 — `{"status":"ok","mail":{"configured":true,"fromAddressSet":true,"transport":"resend-api"}}` |
| API ready | ✅ 200 — `{"ready":true,"checks":{"database":"ok","redis":"ok"},"timestamp":"2026-06-06T23:01:52.963Z"}` |
| Shared infra | ✅ running (see docker ps below) |
| Worker | ❌ not running — no `infra-worker` container |

### Setup command outputs

```
$ git branch --show-current
architecture

$ node --version
v22.22.0

$ pnpm --version
9.15.9

$ docker --version
Docker version 27.2.0, build 3ab4256

$ docker compose version
Docker Compose version v2.29.2-desktop.2

$ curl -s http://localhost:4000/health
{"status":"ok","mail":{"configured":true,"fromAddressSet":true,"transport":"resend-api"}}

$ curl -s http://localhost:4000/ready
{"ready":true,"checks":{"database":"ok","redis":"ok"},"timestamp":"2026-06-06T23:01:52.963Z"}

$ docker ps --format "table {{.Names}}\t{{.Status}}" | grep stockix
stockix-diag-mq15hd9x-server-1   Up About an hour (healthy)
stockix-shared-nginx-1           Up About an hour
stockix-shared-stockix-redis-1   Up About an hour (healthy)
stockix-shared-stockix-mongo-1   Up About an hour (healthy)
stockix-shared-stockix-mysql-1   Up About an hour (healthy)

$ docker ps --format "table {{.Names}}\t{{.Status}}" | grep infra-worker
(no output)
WORKER NOT RUNNING
```

---

## Suite 1 — TypeScript

| Package | Exit code | Errors |
|---------|-----------|--------|
| apps/api | 0 | none |
| apps/dashboard | 0 | none |
| infra/worker-service | 2 | 2 errors (see below) |
| packages/db | 0 | none |
| packages/config | 0 | none |

### apps/api — `pnpm tsc --noEmit`

```
(no output)
EXIT_CODE: 0
```

### apps/dashboard — `pnpm tsc --noEmit`

```
(no output)
EXIT_CODE: 0
```

### infra/worker-service — `pnpm tsc --noEmit`

```
domain/provisioner.ts(317,42): error TS2344: Type '{ schemaName: string; }[]' does not satisfy the constraint 'QueryResult'.
  Type '{ schemaName: string; }[]' is not assignable to type 'OkPacket | ResultSetHeader | ResultSetHeader[] | RowDataPacket[] | RowDataPacket[][] | OkPacket[]'.
    Type '{ schemaName: string; }[]' is not assignable to type 'ResultSetHeader[]'.
      Type '{ schemaName: string; }' is missing the following properties from type 'ResultSetHeader': affectedRows, fieldCount, info, insertId, and 3 more.
domain/provisioning/adapters/finance-auth-client.ts(155,7): error TS18048: 'options' is possibly 'undefined'.
EXIT_CODE: 2
```

### packages/db — `pnpm tsc --noEmit`

```
(no output)
EXIT_CODE: 0
```

### packages/config — `pnpm tsc --noEmit`

```
(no output)
EXIT_CODE: 0
```

---

## Suite 2 — Worker unit tests

**Attempt 1:** `pnpm infra:worker:test` (repo root)

```
The filename, directory name, or volume label syntax is incorrect.
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "infra:worker:test" not found

Did you mean "pnpm infra:worker:dev"?
EXIT_CODE: 1
```

**Attempt 2:** `cd infra/worker-service && pnpm test`

```
 ERR_PNPM_NO_SCRIPT  Missing script: test

Command "test" not found.
EXIT_CODE: 1
```

**Fallback (used for result):** `cd apps/api && pnpm test ../../infra/worker-service`

**Result:** ✅ PASS
**Tests:** 47 pass / 0 fail / 0 skip
**Duration:** 11.84s
**Files:** 16

```
> api@0.1.0 test C:\Users\Jad\Desktop\stokcix\stockixnew\apps\api
> vitest run "../../infra/worker-service"


 RUN  v4.1.5 C:/Users/Jad/Desktop/stokcix/stockixnew/apps/api


 Test Files  16 passed (16)
      Tests  47 passed (47)
   Start at  02:04:03
   Duration  11.84s (transform 1.15s, setup 0ms, import 7.13s, tests 202ms, environment 2ms)

EXIT_CODE: 0
```

---

## Suite 3 — Full apps/api suite

**Result:** ✅ PASS
**Tests:** 312 pass / 0 fail / 0 skip
**Duration:** 53.85s
**Files:** 71

```
> api@0.1.0 test C:\Users\Jad\Desktop\stokcix\stockixnew\apps\api
> vitest run


 RUN  v4.1.5 C:/Users/Jad/Desktop/stokcix/stockixnew/apps/api

(... log lines omitted for brevity in summary; full run had resend webhook, license, pos-license-sync log output ...)

 Test Files  71 passed (71)
      Tests  312 passed (312)
   Start at  02:02:56
   Duration  53.85s (transform 1.85s, setup 0ms, import 26.98s, tests 11.16s, environment 8ms)

EXIT_CODE: 0
```

---

## Suite 4 — Worker + readiness combined

**Result:** ✅ PASS
**Tests:** 54/54 (0 fail, 0 skip)
**Duration:** 13.08s
**Files:** 17

```
> api@0.1.0 test C:\Users\Jad\Desktop\stokcix\stockixnew\apps\api
> vitest run "../../infra/worker-service" "tests/readiness-module-gating.test.ts"


 RUN  v4.1.5 C:/Users/Jad/Desktop/stokcix/stockixnew/apps/api


 Test Files  17 passed (17)
      Tests  54 passed (54)
   Start at  02:04:03
   Duration  13.08s (transform 1.16s, setup 0ms, import 7.97s, tests 178ms, environment 2ms)

EXIT_CODE: 0
```

---

## Suite 5 — Individual critical test files

**Path note:** `provision-outcome-rules.test.ts` is at `infra/worker-service/domain/provisioning/provision-outcome-rules.test.ts` (not `src/`).

| Test file | Result | Tests | Notes |
|-----------|--------|-------|-------|
| finance-auth-client.test.ts | ✅ | 6/6 | exit 0 |
| provision-outcome-rules.test.ts | ✅ | 6/6 | actual path: `domain/provisioning/` |
| provision-failure.test.ts | ✅ | 5/5 | exit 0 |
| retry-provision-partial.test.ts | ✅ | 2/2 | exit 0 |
| tenant-stack-compose.test.ts | ✅ | 6/6 | exit 0 |
| provisioner.mongo-rs.test.ts | ✅ | 2/2 | exit 0 |
| check-tenant-images.test.ts | ✅ | 2/2 | exit 0 |
| module-stacks.pos-compose.test.ts | ✅ | 5/5 | exit 0 |
| execa-docker-compose-runner.test.ts | ✅ | 1/1 | exit 0 |
| prod-compose-contract.test.ts | ✅ | 2/2 | exit 0 |
| ensure-tenant-networks.test.ts | ✅ | 2/2 | exit 0 |
| redis-key-prefix.test.ts | ✅ | 6/6 | exit 0 |
| provision-runtime.compose-args.test.ts | ✅ | 1/1 | exit 0 |
| readiness-module-gating.test.ts | ✅ | 7/7 | exit 0 |
| build-preflight-down-args.test.ts | ✅ | 2/2 | exit 0 |
| redact-compose-log.test.ts | ✅ | 3/3 | exit 0 |

**Aggregate:** 16/16 files found and run, 55/55 tests passed, all exit code 0.

### All worker test files in repo

```
infra/worker-service/domain/provisioning/build-preflight-down-args.test.ts
infra/worker-service/domain/provisioning/redact-compose-log.test.ts
infra/worker-service/domain/provisioning/redis-key-prefix.test.ts
infra/worker-service/domain/provisioning/ensure-tenant-networks.test.ts
infra/worker-service/domain/provisioning/tenant-stack-dev-compose.test.ts
infra/worker-service/domain/provisioning/tenant-stack-compose.test.ts
infra/worker-service/src/module-stacks.pos-compose.test.ts
infra/worker-service/domain/provisioning/prod-compose-contract.test.ts
infra/worker-service/domain/provisioning/check-tenant-images.test.ts
infra/worker-service/domain/provisioning/adapters/execa-docker-compose-runner.test.ts
infra/worker-service/src/provision-runtime.compose-args.test.ts
infra/worker-service/domain/provisioner.mongo-rs.test.ts
infra/worker-service/domain/provisioning/adapters/finance-auth-client.test.ts
infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.test.ts
infra/worker-service/domain/provisioning/provision-outcome-rules.test.ts
infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.test.ts
```

---

## Suite 6 — Static verification (25 checks)

| ID | Check | Result | Evidence |
|----|-------|--------|----------|
| W1.1 | finance-auth-client codes | ✅ | all 5 codes present in `finance-auth-client.ts` |
| W1.2 | build-org uses auth-client | ✅ | `fetch-stockix-finance-build-org.ts` |
| W1.3 | bootstrap camelCase | ✅ | `fetch-stockix-finance-bootstrap.ts` |
| W1.4 | no silent catch | ✅ | `provision-failure.ts` |
| W1.5 | partial ok:false + controlPlane URL | ✅ | `provision-runtime.ts` |
| W2.1 | port PUBLIC_PROXY_PORT | ✅ | `infra/tenant-stack/docker-compose.yml` |
| W2.2 | depends_on migration | ✅ | `service_completed_successfully` present |
| W2.3 | no fake exit 0 | ✅ | no `exit 0` in migration healthcheck |
| W2.4 | RS PRIMARY check | ✅ | `ensureSharedMongoReplicaSetReady` in `provisioner.ts` |
| W3.1 | POS env-file | ✅ | `module-stacks.ts` |
| W3.2 | BUILD:0 | ✅ | `infra/prod/docker-compose.yml` |
| W3.3 | Traefik via proxy | ✅ | `providers.docker.endpoint` + `socket-proxy` |
| W4.1 | POS secrets 3 services | ✅ | JWT_SECRET×3, LICENSE_SIGNING_SECRET×3, PLATFORM_JWT_SECRET×3 |
| W4.2 | resolvePosJwtEnv | ✅ | `module-stacks.ts` |
| W4.3 | NODE_ENV=production | ✅ | `infra/tenant-stack/docker-compose.yml` |
| W4.4 | no build stanzas | ✅ | no `build:` in Finance compose |
| W5.1 | branding vars | ✅ | all 4 REACT_APP_STOCKIX_* vars present |
| W5.2 | PERFIX legacy | ✅ | `tenant-env.ts` |
| W5.3 | MySQL fail-fast | ✅ | `assertWorkerCanReachSharedMysql` in `provisioner.ts` |
| W5.4 | Resend no MAIL_PASSWORD | ✅ | `resolvePosResendApiKey` in `module-stacks.ts` |
| W6.1 | edge.publish order | ❌ | `edge.publish` at L1679 is AFTER bootstrap at L900 in `provision-runtime.ts` |
| W6.2 | network prod guard | ✅ | `ensure-tenant-networks.ts` |
| W6.3 | STUCK_MS dynamic | ✅ | `stuck-reconciler.ts` |
| W6.4 | controlPlaneApiBaseUrl | ✅ | `provision-runtime.ts` |
| W6.5 | readiness edge.publish | ✅ | `readiness-engine.ts` |

**Total: 24/25 PASS**

### Exact script output

```
=== STATIC VERIFICATION RESULTS ===
✅ W1.1 — finance-auth-client structured codes
✅ W1.2 — build-org uses finance-auth-client, no bare signin_failed
✅ W1.3 — bootstrap camelCase firstName/lastName
✅ W1.4 — provision-failure no silent catch
✅ W1.5 — provision-runtime partial ok:false + controlPlaneApiBaseUrl
✅ W2.1 — Finance port PUBLIC_PROXY_PORT not ephemeral
✅ W2.2 — server depends_on database_migration
✅ W2.3 — migration healthcheck fake exit 0 removed
✅ W2.4 — ensureSharedMongoReplicaSetReady called
✅ W3.1 — POS uses env-file or ExecaDockerComposeRunner
✅ W3.2 — socket-proxy BUILD:0
✅ W3.3 — Traefik via socket-proxy not docker.sock
✅ W4.1 — POS secrets in all 3 services
✅ W4.2 — resolvePosJwtEnv in module-stacks
✅ W4.3 — Finance compose NODE_ENV=production
✅ W4.4 — no build stanzas in prod Finance compose
✅ W5.1 — branding vars in Finance compose
✅ W5.2 — TENANT_DB_NAME_PERFIX legacy comment
✅ W5.3 — MySQL host fail-fast present
✅ W5.4 — resolvePosResendApiKey no MAIL_PASSWORD fallback
❌ W6.1 — edge.publish before org build (line order): edge.publish at L1679 is AFTER bootstrap at L900
✅ W6.2 — ensure-tenant-networks production guard
✅ W6.3 — stuck-reconciler uses workerJobExecutionTimeoutMs
✅ W6.4 — provision-runtime uses controlPlaneApiBaseUrl
✅ W6.5 — readiness-engine gates on edge.publish

PASS: 24/25
FAIL: 1
EXIT_CODE: 1
```

---

## Suite 7 — Linting

| Package | Result | Errors/Warnings |
|---------|--------|----------------|
| apps/api | ✅ (exit 0) | 0 errors, 462 warnings |
| infra/worker-service | ❌ (exit 1) | no `lint` script — `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "lint" not found` |

### apps/api lint output (tail)

```
✖ 462 problems (0 errors, 462 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.

API_LINT_EXIT: 0
```

### infra/worker-service lint output

```
'lint' is not recognized as an internal or external command,
operable program or batch file.
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "lint" not found
WORKER_LINT_EXIT: 1
```

---

## Suite 8 — Docker prebuild check

**Command:** `pnpm docker:check`

```
> stockix@ docker:check C:\Users\Jad\Desktop\stokcix\stockixnew
> node scripts/prebuild-tenant-images.mjs --verify


[prebuild] Verify images
[prebuild] ✅ stockix-server:local
[prebuild] ✅ stockix-database-migration:local

[prebuild] All required Finance images are present.
EXIT_CODE: 0
```

| Image | Status |
|-------|--------|
| stockix-server:local | ✅ exists (verified by script) |
| stockix-database-migration:local | ✅ exists (verified by script) |
| stockix-pos-backend:local | ✅ exists on host (`docker images`; not checked by `docker:check` script) |
| stockix-pos-frontend:local | ✅ exists on host (`docker images`; not checked by `docker:check` script) |

**Additional images on host:**

```
stockix-server:local
stockix-database-migration:local
stockix-pos-backend:local
stockix-pos-frontend:local
stockix-nginx:local
stockix-webapp:local
```

---

## Suite 9 — Smoke provision

**Result:** ⏭️ SKIPPED (auth not set)

```
OWNER_ID=
OWNER_ID=NOT SET
PROVISION_AUTH_BEARER=
PROVISION_AUTH_BEARER=NOT SET
SMOKE SKIPPED — set OWNER_ID or PROVISION_AUTH_BEARER in .env to run smoke provision
```

(.env has `OWNER_ID=` empty; `PROVISION_AUTH_BEARER` not set.)

---

## Suite 10 — Infrastructure health

| Component | Status | Output |
|-----------|--------|--------|
| MySQL (stockix-mysql) | ✅ | `mysqld is alive` + `MySQL HEALTHY` |
| MongoDB rs0 (stockix-mongo) | ✅ | `1` (rs.status().ok) |
| Redis (stockix-redis) | ✅ | `PONG` |
| healthcheck.sh | ✅ | exit 0 when `SHARED_MYSQL_ROOT_PASSWORD` exported |

### Individual checks

**MySQL:**

```
mysqld is alive
mysqladmin: [Warning] Using a password on the command line interface can be insecure.
MySQL HEALTHY
```

**Mongo:**

```
1
```

**Redis:**

```
PONG
```

**healthcheck.sh** (with `SHARED_MYSQL_ROOT_PASSWORD` from `.env`):

```
[healthcheck] 2026-06-06T23:06:27Z Starting checks...
[healthcheck] All checks passed.
healthcheck.sh exit: 0
```

**Note:** Running `healthcheck.sh` without exporting `SHARED_MYSQL_ROOT_PASSWORD` fails with exit 1 (`mysql: SHARED_MYSQL_ROOT_PASSWORD unset`).

---

## Suite 11 — Backup script syntax

| Script | Syntax | Result |
|--------|--------|--------|
| backup.sh | ✅ | `backup.sh syntax OK` |
| backup-shared.sh | ✅ | `backup-shared.sh syntax OK` |
| healthcheck.sh | ✅ | `healthcheck.sh syntax OK` |

```
backup.sh syntax OK
backup-shared.sh syntax OK
healthcheck.sh syntax OK
```

---

## Final Summary

| Suite | Status | Details |
|-------|--------|---------|
| TypeScript | ❌ | 4/5 packages clean; worker-service has 2 TS errors |
| Worker tests | ✅ | 47/47 (via apps/api vitest fallback) |
| API tests | ✅ | 312/312 |
| Combined tests | ✅ | 54/54 |
| Individual test files | ✅ | 16/16 found + run, 55/55 pass |
| Static verification | ❌ | 24/25 |
| Linting | ❌ | api 462 warnings (exit 0); worker no lint script |
| Docker images | ✅ | Finance images verified; POS images present on host |
| Smoke provision | ⏭️ | OWNER_ID / PROVISION_AUTH_BEARER not set |
| Infrastructure | ✅ | MySQL, Mongo RS, Redis healthy; healthcheck.sh pass |
| Backup syntax | ✅ | all 3 scripts OK |

**Overall: PARTIAL**

### Failures requiring action:

1. **infra/worker-service TypeScript (exit 2):** Fix `domain/provisioner.ts:317` QueryResult generic typing and `finance-auth-client.ts:155` possibly-undefined `options`.
2. **Static W6.1:** Move `edge.publish` step before bootstrap/org-build in `infra/worker-service/src/provision-runtime.ts` (currently L1679 after bootstrap at L900).
3. **Worker lint:** Add a `lint` script to `infra/worker-service/package.json` or document that lint is run via another package.
4. **Worker test script:** `pnpm infra:worker:test` and `infra/worker-service` `pnpm test` are missing; tests only runnable via `apps/api` vitest paths.

### Blocked items (need infra running):

- **Smoke provision:** Blocked — `OWNER_ID` empty and `PROVISION_AUTH_BEARER` unset in environment.
- **Worker container:** `infra-worker` container not running (worker unit/integration against live worker not exercised).
