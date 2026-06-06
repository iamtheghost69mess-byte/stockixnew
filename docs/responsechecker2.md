# Stockix — rechecker22 Repair Verification Report

**Generated:** 2026-06-07  
**Branch:** architecture  
**Purpose:** Verify every rechecker22 Wave 1–6 repair is actually in code.  
**Rule:** Every row cites exact file:line. No assumptions.

---

## Executive Summary

| Category | Count |
|----------|-------|
| ✅ VERIFIED in code | 22 |
| ❌ CLAIMED but NOT found in code | 0 |
| ⚠️ PARTIAL — incomplete implementation | 0 |
| 📋 OPEN — not yet fixed (expected) | 4 |
| Total rechecker22 Wave 1–6 checks | 22 |

**Overall repair confidence:** 100% (22 verified / 22 Wave 1–6 automated checks)

**Test run (2026-06-07):** 54/54 worker+readiness tests ✅ · 312/312 full API suite ✅ · `tsc --noEmit` ✅ · `/health` 200 ✅ · `provision-diagnose` ❌ (401 on `/owners` — auth required)

**Note:** Section 12 cross-cutting repairs (preflight `-v` default removal, compose log redaction, Redis prefix tests) were implemented after the original Wave 1–6 plan and are documented under “Still Open / Post-Wave discrepancies” below.

---

## Wave 1 — Signin, Outcomes, Failure Logs

### W1.1 — finance-auth-client.ts structured signin codes

**Claimed:** New file with structured codes (`signin_no_organization`, `signin_invalid_credentials`, etc.)  
**Status:** ✅  
**Evidence:**

| Code | File:line |
|------|-----------|
| `signin_no_organization` | `infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:48` |
| `signin_invalid_credentials` | `infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:51` |
| `signin_http_` | `infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:53` |
| `signin_parse_failed` | `infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:88`, `:96` |
| `signin_network_error` | `infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:103` |
| `signin_org_mismatch` | `infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:144` |

**Verification output:**

```
  found signin_no_organization at L48
  found signin_invalid_credentials at L51
  found signin_http_ at L53
  found signin_parse_failed at L88
  found signin_network_error at L103
PASS W1.1: finance-auth-client.ts has all structured signin codes
```

---

### W1.2 — fetch-stockix-finance-build-org.ts uses finance-auth-client

**Claimed:** Uses `signinToFinanceSession` / `signinWithRetry`; no bare `"signin_failed"` emitted  
**Status:** ✅  
**Evidence:**

- Import: `fetch-stockix-finance-build-org.ts:2-6`
- `signinWithRetry` / `signinToFinanceSession`: `fetch-stockix-finance-build-org.ts:99-112`
- Errors via `formatSigninError(signinResult)`: `fetch-stockix-finance-build-org.ts:114-116`

**Verification output:**

```
  OK: imports finance-auth-client
  OK: no bare signin_failed string emitted
  OK: uses structured signin
PASS W1.2
```

---

### W1.3 — Bootstrap camelCase firstName/lastName

**Claimed:** No snake_case `first_name` / `last_name` in bootstrap payload  
**Status:** ✅  
**Evidence:** `fetch-stockix-finance-bootstrap.ts:95-96` — `firstName`, `lastName` in JSON body  
**Verification output:**

```
PASS W1.3: firstName at L95, lastName at L96
```

---

### W1.4 — provision-failure.ts logs errors not silent catch

**Claimed:** `logger.error` instead of `.catch(() => undefined)`  
**Status:** ✅  
**Evidence:**

- Logger import: `apps/api/src/provisioning/provision-failure.ts:12`
- `appendProvisionFailureEvent` logs on failure: `provision-failure.ts:156-161`
- `markLifecycleJobTerminalFailure` logs on failure: `provision-failure.ts:183-184`

**Verification output:**

```
PASS W1.4: logger imported at L12, no silent catches
```

---

### W1.5 — POS partial returns ok:false, API URL uses controlPlane host

**Claimed:** `resolveProvisionJobOutcome`, `controlPlaneApiBaseUrl` used  
**Status:** ✅  
**Evidence:**

- `resolveProvisionJobOutcome`: `infra/worker-service/src/worker.ts:45-46`, called at `worker.ts:561-564`
- POS partial `ok: false`: `provision-runtime.ts:1230`
- `apiConfig.controlPlaneApiBaseUrl` for org PATCH: `provision-runtime.ts:1924`

**Verification output:**

```
  OK: partial outcome handled
  OK: uses controlPlaneApiBaseUrl not localhost
PASS W1.5: provision-runtime partial outcomes fixed
```

---

## Wave 2 — Compose Port, Migration, Mongo RS0

### W2.1 — Finance port bound to PUBLIC_PROXY_PORT

**Claimed:** `0.0.0.0:${PUBLIC_PROXY_PORT}:3000` not ephemeral  
**Status:** ✅  
**Evidence:** `infra/tenant-stack/docker-compose.yml:111` — `"0.0.0.0:${PUBLIC_PROXY_PORT}:3000"`  
**Verification output:**

```
PASS W2.1: port bound at L111
```

---

### W2.2 — server depends_on database_migration

**Claimed:** `condition: service_completed_successfully`  
**Status:** ✅  
**Evidence:** `infra/tenant-stack/docker-compose.yml:112-114`  
**Verification output:**

```
PASS W2.2: depends_on at L114
```

---

### W2.3 — Migration healthcheck removed

**Claimed:** No fake `exit 0` healthcheck  
**Status:** ✅  
**Evidence:** `database_migration` block (`docker-compose.yml:119-138`) has no `healthcheck:` stanza  
**Verification output:**

```
PASS W2.3: no fake exit 0 in compose
```

---

### W2.4 — Mongo RS0 PRIMARY check

**Claimed:** `ensureSharedMongoReplicaSetReady` called before POS/Finance Mongo use  
**Status:** ✅  
**Evidence:**

- Called from `provisionTenantDatabases`: `provisioner.ts:210`
- Defined: `provisioner.ts:431+`

**Verification output:**

```
  OK: ensureSharedMongoReplicaSetReady called
PASS W2.4: Mongo RS preflight present
```

---

## Wave 3 — POS Env-File, Socket Proxy, Prebuild

### W3.1 — POS uses --env-file or ExecaDockerComposeRunner

**Claimed:** `module-stacks.ts` POS uses tenant env file  
**Status:** ✅  
**Evidence:**

- `ExecaDockerComposeRunner`: `module-stacks.ts:21`, `48`
- `resolvePosTenantEnvPath`: `module-stacks.ts:51-52`
- `posDockerRunner.run(..., envPath, ...)`: `module-stacks.ts:461-467`

**Verification output:**

```
PASS W3.1: POS env-file pattern at L21
```

---

### W3.2 — Socket proxy BUILD:0

**Claimed:** BUILD capability disabled on socket-proxy  
**Status:** ✅  
**Evidence:** `infra/prod/docker-compose.yml:117` — `BUILD: 0`  
**Verification output:**

```
PASS W3.2: BUILD:0 at L117
```

---

### W3.3 — Traefik uses socket-proxy not direct docker.sock

**Claimed:** `--providers.docker.endpoint=tcp://socket-proxy:2375`  
**Status:** ✅  
**Evidence:** `infra/prod/docker-compose.yml:161` — no `docker.sock` mount on `traefik:` service (lines 140-165)  
**Verification output:**

```
PASS W3.3: Traefik docker provider via socket-proxy at L161
```

---

## Wave 4 — POS Secrets, NODE_ENV, Build Stanzas

### W4.1 — POS compose has all secrets in all 3 services

**Claimed:** `JWT_SECRET`, `LICENSE_SIGNING_SECRET`, `PLATFORM_JWT_SECRET` in pos-backend, pos-platform-worker, pos-bigcapital-worker  
**Status:** ✅  
**Evidence:** `infra/pos-tenant-stack/docker-compose.yml`

| Secret | Lines (backend / platform-worker / bigcapital-worker) |
|--------|------------------------------------------------------|
| `JWT_SECRET` | 40, 76, 115 |
| `PLATFORM_JWT_SECRET` | 41, 77, 116 |
| `LICENSE_SIGNING_SECRET` | 42, 78, 117 |

**Verification output:**

```
PASS W4.1: POS secrets in all 3 services (jwt:12, lic:6, plat:6)
```

---

### W4.2 — module-stacks.ts injects secrets via resolvePosJwtEnv

**Claimed:** `resolvePosJwtEnv()` function exists and is called  
**Status:** ✅  
**Evidence:**

- Function: `module-stacks.ts:69-95`
- Called in `composeEnv`: `module-stacks.ts:419-421`

**Verification output:**

```
PASS W4.2: resolvePosJwtEnv at L69
```

---

### W4.3 — Finance compose NODE_ENV=production

**Claimed:** `NODE_ENV=production` in server environment  
**Status:** ✅  
**Evidence:** `infra/tenant-stack/docker-compose.yml:39`  
**Verification output:**

```
PASS W4.3: NODE_ENV=production at L39
```

---

### W4.4 — No build stanzas in prod Finance compose

**Claimed:** `build:` targets removed; dev overrides in `docker-compose.dev.yml`  
**Status:** ✅  
**Evidence:** `infra/tenant-stack/docker-compose.yml` — image-only (`server` L18, `database_migration` L120); dev builds in `infra/tenant-stack/docker-compose.dev.yml:4-13`  
**Verification output:**

```
PASS W4.4: no build stanzas in prod compose
```

---

## Wave 5 — Branding, PERFIX, MySQL, Resend

### W5.1 — Branding vars in Finance compose

**Claimed:** `REACT_APP_STOCKIX_*` vars in `server.environment`  
**Status:** ✅  
**Evidence:** `infra/tenant-stack/docker-compose.yml:103-108`  
**Verification output:**

```
  found REACT_APP_STOCKIX_APP_NAME at L106
  found REACT_APP_STOCKIX_LOGO_URL at L107
  found REACT_APP_STOCKIX_PRIMARY_COLOR at L108
  found REACT_APP_STOCKIX_DISCOVERY_SLUG at L105
PASS W5.1: all branding vars present in Finance compose
```

---

### W5.2 — TENANT_DB_NAME_PERFIX documented as legacy

**Claimed:** PERFIX kept with legacy comment explaining Finance compat  
**Status:** ✅  
**Evidence:**

- Legacy comment: `tenant-env.ts:158`
- PERFIX alias: `tenant-env.ts:159`

**Verification output:**

```
PASS W5.2: TENANT_DB_NAME_PERFIX at L159 (legacy comment at L158)
```

---

### W5.3 — MySQL host fail-fast

**Claimed:** `assertWorkerCanReachSharedMysql` or equivalent preflight  
**Status:** ✅  
**Evidence:**

- `assertWorkerCanReachSharedMysql`: `provisioner.ts:393-414`
- Called before MySQL provision: `provisioner.ts:160`

**Verification output:**

```
  OK: MySQL host preflight present
PASS W5.3: MySQL host fail-fast present
```

---

### W5.4 — RESEND_API_KEY no MAIL_PASSWORD fallback

**Claimed:** `resolvePosResendApiKey` function, no MAIL_PASSWORD fallback  
**Status:** ✅  
**Evidence:**

- `resolvePosResendApiKey`: `module-stacks.ts:96-104`
- Used at provision: `module-stacks.ts:394`

**Verification output:**

```
PASS W5.4: resolvePosResendApiKey at L96
```

---

## Wave 6 — Early Publish, Networks, Stuck, API URL

### W6.1 — edge.publish moved earlier in pipeline

**Claimed:** Traefik YAML written after health check, not after org build  
**Status:** ✅  
**Evidence:**

- Health check completes: `provision-runtime.ts:1671-1672`
- `edge.publish` starts: `provision-runtime.ts:1679-1702`
- Bootstrap admin starts after edge: `provision-runtime.ts:1707+`

**Verification output:**

```
  edge.publish step start at L1680, health done at L1672
PASS W6.1: edge.publish after health check (before org build)
```

---

### W6.2 — ensure-tenant-networks fails in production if missing

**Claimed:** Production preflight fails if `stockix-shared` / `stockix_public` missing  
**Status:** ✅  
**Evidence:** `ensure-tenant-networks.ts:22-28` — `NODE_ENV === "production"` throws for missing networks  
**Verification output:**

```
  OK: production check present
  OK: both networks checked
PASS W6.2: network preflight has production guard
```

---

### W6.3 — stuck-reconciler uses worker timeout not hardcoded

**Claimed:** `STUCK_MS = workerJobExecutionTimeoutMs + 5min`  
**Status:** ✅  
**Evidence:** `apps/api/src/provisioning/stuck-reconciler.ts:21`  
**Verification output:**

```
PASS W6.3: STUCK_MS uses workerJobExecutionTimeoutMs at L21
```

---

### W6.4 — financeOrganizationId save uses controlPlaneApiBaseUrl

**Claimed:** No localhost hardcode; uses `apiConfig.controlPlaneApiBaseUrl`  
**Status:** ✅  
**Evidence:** `provision-runtime.ts:1924-1925`  
**Verification output:**

```
PASS W6.4: controlPlaneApiBaseUrl at L1924
```

---

### W6.5 — readiness-engine gates on edge.publish

**Claimed:** Readiness checks `edge.publish` journal op before reporting route active  
**Status:** ✅  
**Evidence:**

- Gate function: `readiness-engine.ts:81-92`
- Used for `financeRouteActive`: `readiness-engine.ts:285`
- Exported test wrapper: `readiness-engine.ts:96-100`

**Verification output:**

```
PASS W6.5: edge.publish gate at L90
```

---

## Still Open Items (Wave 7–8, expected NOT fixed)

| ID | Item | Status | Evidence |
|----|------|--------|----------|
| OPEN.1 | System DB dropped on every migration | 📋 OPEN | `provisioner.ts:218-247` — `resetSystemDatabaseForMigration` runs unconditional `DROP DATABASE IF EXISTS` on system DB; no `FORCE_CLEAN_MIGRATION` gate |
| OPEN.2 | Preflight compose down `-v` | ✅ FIXED (§12) | Preflight uses `buildPreflightDownArgs(input.cleanSlate === true)` at `provision-runtime.ts:1527` — no `-v` by default. Rollback path still uses `-v` at `provision-runtime.ts:488-490` (intentional) |
| OPEN.3 | Legacy `_finance` DB creation | 📋 OPEN | `provisioner.ts:148`, `180-181` — `CREATE DATABASE IF NOT EXISTS stockix_{safe}_finance` |
| OPEN.4 | Redis prefix integration test | ✅ FIXED (§12) | `infra/worker-service/domain/provisioning/redis-key-prefix.test.ts` exists |
| OPEN.5 | Docs pgcrypto/Postgres tenant DB reference | 📋 OPEN | `.github/GITHUB_WORKFLOWS.md:318` references `pgcrypto`; tenant runtime uses shared MySQL per `rechecker22.md:5` |
| OPEN.6 | Plaintext secrets in compose logs | ✅ FIXED (§12) | `redactComposeLogLine` imported at `provision-runtime.ts:58`, used at `provision-runtime.ts:835`; `module-stacks.ts:25`, `471` |
| OPEN.7 | Finance signin 401 UserTenant root cause | ⚠️ SMOKE PENDING | Worker surfaces structured codes (`finance-auth-client.ts:47-48`); `services/stockix-finance/.../Auth.controller.ts` not modified in this audit |

---

## Discrepancies Found (claimed fixed but NOT in code)

No Wave 1–6 automated check returned FAIL.

| Wave | Item | Claimed | Actual in code | Risk |
|------|------|---------|---------------|------|
| — | — | — | — | — |

**Script false positives (manual correction):**

| Check | Script said | Actual |
|-------|-------------|--------|
| OPEN.2 | `-v` at L490 | L490 is **rollback** cleanup, not preflight. Preflight fixed at L1527 via `buildPreflightDownArgs`. |
| OPEN.3 | CREATE not found | Script required `_finance` and `CREATE` on same line; CREATE is at `provisioner.ts:181` with `financeDb` at L148. |
| OPEN.4 / OPEN.6 | “Still open” | Fixed in Section 12 repairs (post Wave 1–6). |

---

## TypeScript Build Status

Run: `cd apps/api && pnpm tsc --noEmit`  
Result: **Exit code 0** (no output — zero errors)

Root `pnpm tsc --noEmit` prints CLI help (no root tsconfig); use `apps/api` project for control-plane typecheck.

---

## Test Execution Results (2026-06-07, 01:55 local)

All commands run from `apps/api` unless noted.

| Check | Command | Result | Detail |
|-------|---------|--------|--------|
| Worker + readiness | `pnpm test ../../infra/worker-service tests/readiness-module-gating.test.ts` | ✅ **PASS** | 54/54 tests, 17 files, vitest 14.3s |
| Full control-plane | `pnpm test` | ✅ **PASS** | 312/312 tests, 71 files, vitest 56.2s |
| Typecheck | `pnpm tsc --noEmit` | ✅ **PASS** | Exit code 0 |
| API liveness | `GET http://127.0.0.1:4000/health` | ✅ **PASS** | HTTP 200 |
| Provision smoke | `pnpm provision-diagnose -- --slug smoke-responsechecker2 --admin-email admin@localhost` | ❌ **FAIL** | Exit 1 — `GET /owners -> 401 unauthorized` |

### What is working (automated)

| Area | Status | Evidence |
|------|--------|----------|
| Wave 1 signin codes | ✅ | `finance-auth-client.test.ts` — structured codes; no bare `signin_failed` |
| Wave 1 provision outcomes | ✅ | `provision-outcome-rules.test.ts`, `retry-provision-partial.test.ts` |
| Wave 1 failure event logging | ✅ | `provision-failure.test.ts` |
| Wave 2 compose / Mongo rs0 | ✅ | `tenant-stack-compose.test.ts`, `provisioner.mongo-rs.test.ts` |
| Wave 3 POS compose / docker runner | ✅ | `module-stacks.pos-compose.test.ts`, `execa-docker-compose-runner.test.ts` |
| Wave 4 dev/prod compose split | ✅ | `tenant-stack-dev-compose.test.ts`, `prod-compose-contract.test.ts` |
| Wave 5 networks / Redis prefix | ✅ | `ensure-tenant-networks.test.ts`, `redis-key-prefix.test.ts` |
| Wave 6 runtime compose args | ✅ | `provision-runtime.compose-args.test.ts` |
| Wave 6 readiness / edge.publish | ✅ | `readiness-module-gating.test.ts` |
| §12 preflight down (no default `-v`) | ✅ | `build-preflight-down-args.test.ts` |
| §12 compose log redaction | ✅ | `redact-compose-log.test.ts` |
| §12 Redis prefix inventory | ✅ | `redis-key-prefix.test.ts` |
| Static code verification (22 checks) | ✅ | All Wave 1–6 file:line checks in this report |

### What is not working / not yet validated

| Item | Status | Blocker |
|------|--------|---------|
| End-to-end `provision-diagnose` | ❌ | `GET /owners` returns 401 without `--owner-id`, `OWNER_ID`, or `PROVISION_AUTH_BEARER` |
| Finance signin after bootstrap (OPEN.7) | ⚠️ smoke pending | Requires authenticated provision run + live Finance stack |
| System DB drop on migration (OPEN.1) | 📋 open | No code fix yet |
| Orphan `_finance` DB (OPEN.3) | 📋 open | No code fix yet |
| pgcrypto / Postgres doc drift (OPEN.5) | 📋 open | Docs only |

### Smoke failure output (captured)

```
[2026-06-06T22:55:40.666Z] API=http://localhost:4000
❌ GET /owners -> 401 (pass --owner-id or set OWNER_ID for protected environments)
{ "error": "unauthorized" }
```

---

## Final Verdict

**Repairs verified in code:** 22 / 22 (Wave 1–6 automated checks)  
**Unit tests (worker + readiness):** 54 / 54 ✅  
**Unit tests (full apps/api):** 312 / 312 ✅  
**Typecheck:** ✅  
**API health:** ✅ 200  
**Repairs with issues:** 0  
**Open items (expected Wave 7–8):** 4 (OPEN.1, OPEN.3, OPEN.5, OPEN.7)  
**Smoke test:** ❌ blocked on owner auth (not connectivity)

**Production readiness:** **READY FOR AUTHENTICATED SMOKE** — all automated tests pass; `provision-diagnose` needs owner bearer token or `--owner-id` before provision path can be exercised.

### Next Steps:

1. Run `pnpm --filter api provision-diagnose -- --slug smoke-<unique> --admin-email <email> --auth-bearer <token>` (or `--owner-id <uuid>`) with full Docker stack and worker running.
2. Defer Wave 7 (migration reset gate, orphan `_finance` DB) and Wave 8 (ops doc cleanup for pgcrypto references) until after smoke passes.
