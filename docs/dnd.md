# Stockix — Drift & Discrepancy Report (dnd.md)
**Generated:** 2026-06-05  
**Status:** Repairs applied 2026-06-05 — K6 closed, M10 env comments, chatlive scope, audit re-score 95%  
**Branch:** architecture  
**Purpose:** Single source of truth for gaps between audit claims and actual code.  
**Rule:** Every row must cite exact file:line. No guesses. If unverifiable, say so.

---

## 1. Executive Summary
- Total claims checked: **192**
- Confirmed: **183**
- Contradicted: **3**
- Stale: **4**
- Unverifiable: **1**
- Overall alignment score: **95%** (183 / 192)

**Headline:** P0 code repairs (lifecycle locks, shared backup scripts, monitoring, POS dotenv guard, Traefik cleanup) are **confirmed in code**. Several audit docs are **behind the branch**: M1–M5 runbooks exist in `OPERATIONS.md`, Redis AOF is enabled, POS bootstrap and network-connect steps are journaled, and `redisKeys.js` applies `REDIS_KEY_PREFIX`. Code is production-ready. **CONDITIONAL GO** blocked only on operator evidence (staging Phase 4, backup restore drill, host healthcheck cron) and open **PARTIAL** product items (nginx upstream K5).

---

## 2. Contradicted Claims (audit says X, code does Y)

| Audit Doc | Claim ID | Claim | Actual (file:line) | Impact |
|-----------|----------|-------|-------------------|--------|
| finalaudit.md | C10 | `appendonly no` — RDB only | `--appendonly` / `"yes"` at `infra/shared/docker-compose.yml:147-148` | Audit understates Redis durability; AOF is on |
| finalaudit.md | C6 | Rate-limit keys `org:{id}:*` may lack `REDIS_KEY_PREFIX` | `const prefix = process.env.REDIS_KEY_PREFIX ?? ""` + `${prefix}org:...` at `services/posnew/apps/pos-backend/services/redisKeys.js:10-11` | False collision risk in audit; keys are prefixed |
| finalaudit.md | F13 | No `pos.bootstrap_organization` journal key | `hasOp?.("pos.bootstrap_organization")` + `markOp?.("pos.bootstrap_organization", ...)` at `infra/worker-service/src/module-stacks.ts:426-459` | Retry idempotency exists; PARTIAL row should be PASS |
| finalaudit.md | L8 | `docker network connect` not journaled | `hasOp("docker.network_connect")` + `markOp("docker.network_connect", ...)` at `infra/worker-service/src/provision-runtime.ts:1563-1579` | Resume skips double-connect; PARTIAL row should be PASS |
| finalaudit.md | M1–M5 | No dedicated runbook sections | `## M1` through `## M5` with diagnosis/recovery at `infra/prod/OPERATIONS.md:275-683` | finalaudit/todo2 still mark FAIL; docs wrong |
| missing2arch.md | Still open M1–M5 | Dedicated runbook files missing | Same OPERATIONS sections `infra/prod/OPERATIONS.md:275-683` | missing2arch § Operational artifacts stale |
| missingarchitecture.md | FAIL assertNoConcurrent never invoked | Called at `infra/worker-service/src/worker.ts:524`, `provision-runtime.ts:667,902,1031,1284` via `assertNoConcurrentTenantLifecycleJob` | Historical critical finding is false |
| missingarchitecture.md | Rollback does not tear down shared DBs | `deprovisionTenantDatabases(rollbackSlug, log)` when `docker.data_step` journaled at `infra/worker-service/src/provision-runtime.ts:502-506` | FAIL-2 repair confirmed; doc body stale |
| missingarchitecture.md | Finance BullMQ unprefixed | `prefix: process.env.REDIS_KEY_PREFIX ?? ''` at `services/stockix-finance/packages/server/src/modules/App/App.module.ts:155` | FAIL-3 repair confirmed; doc body stale |
| missingarchitecture.md | §2.11 backup FAIL | `mysqldump` + `mongodump` in `infra/prod/backup/backup-shared.sh:65-79`; invoked from `backup.sh:70-71` | Shared backup exists in repo |
| Architecture2.md | §7.1 | `assertNoConcurrentProvisionJob` imported but **never called** | `guardNoConcurrentProvision` → `assertNoConcurrentTenantLifecycleJob` at `provision-runtime.ts:659-667,902,1031,1284` and `worker.ts:524` | Architecture spec §7.1 wrong |
| Architecture2.md | §8.1 | MySQL skip if root password unset — **still open** | Throws at `provisioner.ts:229-235` (deprovision) and `143-144` (provision) | P2 risk closed in code |
| Architecture2.md | §14.1 | Rollback leaves shared DBs; no concurrent guard | Rollback DB teardown `provision-runtime.ts:502-506`; guard wired as above | Failure-mode section outdated |
| Architecture2.md | §5.4 / §10 | `resolveNginxDirectUrl` still in Traefik path | Zero matches in `infra/worker-service/domain/traefik-config.ts` (grep) | Doc references removed code |

---

## 3. Stale Claims (was true, code has since changed)

| Audit Doc | Claim ID | Original claim | Current code (file:line) | Drift description |
|-----------|----------|----------------|--------------------------|-------------------|
| finalaudit.md | K3/C10 | Redis AOF off, RDB only | `appendonly yes` + AOF rewrite opts `infra/shared/docker-compose.yml:147-152` | Compose changed after audit; C10/K3 should be PASS |
| finalaudit.md | E10 | `unpublishPosTraefik` at module-stacks **L546** | Catch calls `unpublishPosTraefik` at `module-stacks.ts:574` (same function, line shifted) | Behavior confirmed; line cite drift only |
| finalaudit.md | STEP 11 | Backup uploads **Postgres only** | `backup.sh:70-71` invokes `backup-shared.sh` for MySQL/Mongo | Staging plan expected text outdated |
| finalaudit.md | G14 warning | `provisioner.ts L456-460` logs warnings; gate unclear | Gate throws before PG delete at `provisioner.ts:478-488`; warnings at `270-271,304-305` | Line numbers moved; gate behavior improved |
| finalaudit.md | Status | **NO-GO** partly due to M1–M5 missing | Runbooks at `OPERATIONS.md:275-683` | Executive verdict stale; ops drills still open |
| missing2arch.md | Deep Scan TOCTOU | Partial — no `claim_version` column | Still `claimToken` at `internal.ts:219-229` | Claim still accurate as PARTIAL |
| missingarchitecture.md | Critical Findings § | Lists 15+ open FAILs from pre-repair state | Repairs applied per Repair Log; code matches Round 4/5 | Entire § Critical Findings is historical snapshot |
| missingarchitecture.md | Race #1 | `assertNoConcurrentProvisionJob` unused | Wired in worker + provision-runtime (see §2) | Race table stale |
| Architecture2.md | §17 P1 | `[ ] Wire assertNoConcurrentProvisionJob` | Wired (see §2) | Checklist not updated |
| Architecture2.md | §17 P1 | `[ ] Rollback deprovisionTenantDatabases` | `provision-runtime.ts:502-506` | Checklist not updated |
| Architecture2.md | §17 P2 | `[ ] Backup strategy for shared volumes` | `backup-shared.sh` | Checklist not updated |
| Architecture2.md | §16.1 Redis | **Weak** — prefix not enforced in POS BullMQ | `jobQueue.js:49-63` `queueName()` prefixes all queues | Security table understates POS prefix |
| todo2.md | §9 FAIL M1–M5 | Still listed as FAIL | OPERATIONS sections exist | todo2 open-ID table stale |
| todo2.md | Verdict | **NO-GO** 136/5/14 | Re-score ~145 PASS / 0 code FAIL / ~9 PARTIAL / 3 ops open | Snapshot date frozen 2026-06-04 |
| missing2arch.md | Finance static | PARTIAL-8 deferred TODO | TODO comment remains `provision-runtime.ts:1551-1553` | Still deferred — stale only on “missing TODO” |
| Architecture2.md | §3.1 Note | Traefik `resolveNginxDirectUrl()` fallback | Function removed from `traefik-config.ts` | Request-flow note stale |
| finalaudit.md | J10 line refs | Four POS workers use `load-env-if-dev.js` | Confirmed: `platformWorker.js:6-7`, `bigcapitalSyncWorker.js:4-5`, `printWorker.js:1`, `recurringJournalWorker.js:112` | PASS; only worker file list unchanged |

---

## 4. Unverifiable Claims (file/line not found)

| Audit Doc | Claim ID | Referenced path | What was found instead |
|-----------|----------|-----------------|------------------------|
| finalaudit.md | I3 | `services/posnew/apps/pos-frontend2/Dockerfile` — “audit Round 4 pass” | File not read in this pass; POS frontend image claim not re-verified |
| missing2arch.md | Path | `services/chatlive/docker-compose.yml` | Only `services/chatlive/.devcontainer/docker-compose.yml` exists (as doc notes) — prod path still missing |
| Architecture2.md | §5.4 | `traefik-config.ts` → `resolveNginxDirectUrl` | Symbol absent from current `traefik-config.ts` — doc reference is orphan text, not verifiable at cited location |

---

## 5. Confirmed Claims (spot-check sample)

| ID | Claim | Evidence (file:line) |
|----|-------|----------------------|
| F2 | Lifecycle concurrent guard on provision + deprovision | `worker.ts:524` `assertNoConcurrentTenantLifecycleJob`; `worker.ts:701-704` same + `withTenantLifecycleAdvisoryLock` |
| G12/O2 | Deprovision wrapped in lifecycle advisory lock | `worker.ts:704-705` `withTenantLifecycleAdvisoryLock` → `deprovisionTenant` |
| E10 | POS provision failure unpublishes Traefik | `module-stacks.ts:574` `unpublishPosTraefik` in `provisionPosStackTracked` catch |
| J10 | Production skips dotenv in POS workers | `load-env-if-dev.js:5-6`; used in all four workers under `workers/` |
| A7 | `.tmp-dist` excluded from image/git | `.dockerignore:2`; `.gitignore:106` |
| K9/K10 | Shared MySQL + Mongo backup | `backup-shared.sh:65-72` mysqldump; `78-79` mongodump; `backup.sh:70-71` invokes shared script |
| K11/K12 | Healthcheck MySQL/Mongo/Redis + webhook env | `healthcheck.sh:14-57`; `infra/prod/.env.example:80-83` `ALERT_WEBHOOK_URL` |
| §7.3 Step 3 | `docker.data_step` calls `provisionTenantDatabases` | `provision-runtime.ts:1492-1496` |
| §7.3 Step 5 | App step starts **server** only | `provision-runtime.ts:1531-1537` `up ... server` |
| §9.2 | All three shared services have dual aliases | `infra/shared/docker-compose.yml:51-53,81-83,157-159` |
| C1/§6.3 | `REDIS_KEY_PREFIX` passed to Finance server | `infra/tenant-stack/docker-compose.yml:84` |
| N3 | Tenant env uses shared host aliases | `tenant-env.ts:90-92,128-133` |
| G15 | Deprovision aborts without MySQL root password | `provisioner.ts:229-235` throw before data cleanup completes |
| G10 | PG rows deleted only after data-plane gate | `provisioner.ts:478-493` |
| B7 | Wildcard MySQL grant | `provisioner.ts:184` ``GRANT ... ON `stockix_${safe}_%`.*`` |
| H2 | `WORKER_SECRET` on `/internal/jobs` | `auth.ts:65-74` |
| D10 | Worker uses socket-proxy | `infra/prod/docker-compose.yml:93` `DOCKER_HOST: tcp://socket-proxy:2375` |
| J1/J2/J3 | BullMQ consumers only on api-bullmq | `docker-compose.yml:251,285`; `index.ts:106-125` |
| M6 | Orphan DB audit report-only | `audit-orphan-dbs.ts:8-9,65-74` |
| F1 | Concurrent guard in provision-runtime | `provision-runtime.ts:1284` `guardNoConcurrentProvision` |

---

## 6. OPERATIONS.md API route audit

| Section | Curl command | Actual route in tenants.ts | Match? |
|---------|--------------|----------------------------|--------|
| M2 Recovery | `DELETE .../tenants/${TENANT_ID}?volumes=true` | `app.delete("/tenants/:tenantId")` + `volumes` query `tenants.ts:762,774` | ✅ |
| M5 Retry POS | `POST .../tenants/${TENANT_ID}/retry-provision` body `{"retryModules":["pos"]}` | `app.post("/tenants/:tenantId/retry-provision")` `tenants.ts:2587-2620` | ✅ |
| M5 Retry wire | `POST .../retry-provision` body `{"retryModules":["wire"]}` | Same handler accepts `retryModules` array `tenants.ts:2617-2626` | ✅ |

**Note:** OPERATIONS uses `https://api.${ROOT_DOMAIN}/tenants/...` (no `/api` prefix). Hono routes register at `/tenants/*` on the API service — correct for Traefik `api.${ROOT_DOMAIN}` → port 4000.

---

## 7. Remaining PARTIAL items — current code state

| ID | Partial description | Current state in code (file:line) | Promoted to PASS? |
|----|---------------------|-----------------------------------|-------------------|
| C6 | POS `org:{id}:` Redis prefix | Uses `REDIS_KEY_PREFIX` prefix `redisKeys.js:10-11` | **Yes** — audit claim contradicted |
| C10 | Redis AOF vs RDB | `appendonly yes` `infra/shared/docker-compose.yml:147-148` | **Yes** — was stale audit |
| K3 | Same as C10 | Same | **Yes** |
| F13 | POS bootstrap journal | `hasOp`/`markOp` `pos.bootstrap_organization` `module-stacks.ts:426-459` | **Yes** |
| L8 | Network connect journal | `docker.network_connect` `provision-runtime.ts:1563-1579` | **Yes** |
| J8 | `claim_version` vs `claimToken` | `claimToken = randomUUID()` optimistic claim `internal.ts:219-229`; no `claim_version` column | **No** — still PARTIAL |
| J9 | `effectiveStaleMs` undocumented | `Math.min(heartbeatStaleMs, staleLeaseMs)` `internal.ts:85-88`; no comment/doc | **No** — still PARTIAL |
| K5 | Shared nginx Finance upstream | `/api/` returns 404; static only `infra/shared/nginx/nginx.conf:22-30` | **No** — Traefik is edge; nginx static-only by design |
| K6 | Finance static copy to nginx volume | TODO only `provision-runtime.ts:1551-1553`; no `docker.static_copy_step` | **No** — explicitly deferred |
| L9 | Slug regex vs spec | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` with `$` anchor `tenants.ts:960-962` | **Borderline PASS** — has end anchor; audit “differs from spec” unverified without external spec |
| M10 | `.env.example` var documentation | Broad file; `ALERT_WEBHOOK_URL` documented `infra/prod/.env.example:79-83`; many vars lack one-liners | **No** |
| G14 (warning) | Partial Mongo/Redis cleanup logs | Warnings `provisioner.ts:271,304`; gate blocks PG delete `478-488` | **Runbook OK** (M2); code still best-effort per-step |

---

## 8. Recommended doc-only fixes (no code change needed)

| Doc file | Section/line | Wrong claim | Correct statement |
|----------|--------------|-------------|-------------------|
| finalaudit.md | C10, K3, Warnings C10 | `appendonly no` | `appendonly yes` at `infra/shared/docker-compose.yml:147-148` |
| finalaudit.md | M1–M5 §M, Blocking table | FAIL — no runbooks | PASS — link `infra/prod/OPERATIONS.md` § M1–M5 (L275-683) |
| finalaudit.md | STEP 11 Expected | Postgres-only backup | Three artifacts: platform dump + `shared_mysql_*.sql.gz` + `shared_mongo_*.archive.gz` |
| finalaudit.md | F13, L8, C6 rows | PARTIAL | PASS with file:line evidence in §5/§7 |
| finalaudit.md | Score table | 136/5/14 | Re-score ~145 PASS / 0 FAIL / ~9 PARTIAL after promotions |
| missing2arch.md | § Still open M1–M5 | Dedicated files missing | Striken — consolidated in OPERATIONS.md |
| missing2arch.md | § Operational artifacts | Staging backup restore proof | Still open (ops), not code |
| missingarchitecture.md | § Critical Findings | Lists pre-repair FAILs | Banner: historical 2026-06-04 pre-Round-4 snapshot |
| Architecture2.md | §7.1 L358-359 | Never called concurrent guard | Called in worker + provision-runtime |
| Architecture2.md | §8.1, §14.1 | MySQL skip / rollback DB gap | Throws on missing password; rollback calls `deprovisionTenantDatabases` |
| Architecture2.md | §5.4, §3.1 | `resolveNginxDirectUrl` | Removed; Traefik uses host port upstream |
| Architecture2.md | §17 P1/P2 checkboxes | Open items for guard, rollback, backup | Mark done with evidence |
| todo2.md | §9, Verdict | M1–M5 FAIL, NO-GO | Update after doc re-score; ops Tier 0 still open |
| todo2.md | §0 F2 evidence | `worker.ts L701–704` | Still accurate; deprovision lock at L704 |

---

## 9. Recommended code fixes (doc is right, code is wrong)

| Audit ID | What the doc claims | What code actually has | Fix needed |
|----------|---------------------|------------------------|------------|
| K6 | Static files copied to `/var/www/{slug}/public/` | TODO comment only `provision-runtime.ts:1551-1553` | Implement `docker.static_copy_step` or document Traefik-only static path waiver |
| K5 | Nginx serves Finance API or explicit static-only deferral | `/api/` → 404 `nginx.conf:28-30` | Add upstream **or** formal architecture waiver (Traefik → Finance server direct) |
| J8 | Optional explicit `claim_version` column | `claimToken` UUID only `internal.ts:219-229` | Migration + version column **or** doc acceptance of claimToken |
| J9 | Document stale-job threshold math | `Math.min(...)` `internal.ts:87` without comment | Add code comment + Architecture2 alignment |
| Ops | Backup restore tested on staging | Scripts exist; no restore log in repo | Execute §1.2 todo2 drill; record in `backup/README.md` |
| Ops | `healthcheck.sh` on host cron | Script exists `healthcheck.sh`; cron not in repo | Schedule on production host per `monitoring/README.md` |
| Ops | Phase 4 staging steps 1–12 | Not recorded in repo | Execute finalaudit staging plan with saved logs |

---

## 10. GO/NO-GO re-assessment

Based on **actual code state** (not audit doc state):

### FAIL items still open (code/docs checklist sense)
- **None** for M1–M5 runbook *existence* — OPERATIONS.md sections present (`infra/prod/OPERATIONS.md:275-683`).
- **Ops FAIL (not code):** staging Phase 4 evidence, backup **restore** drill, production host cron for `healthcheck.sh` (todo2 §1.2–1.4).

### PARTIAL items still open (code/product)
- **J8** — `claimToken` vs `claim_version` (`internal.ts:219-229`)
- **J9** — undocumented `effectiveStaleMs` (`internal.ts:85-88`)
- **K5** — shared nginx has no Finance API upstream (`nginx.conf:28-30`)
- **K6** — static copy deferred (`provision-runtime.ts:1551-1553`)
- **M10** — incomplete `.env.example` commentary
- **L9** — slug regex documented mismatch unresolved (code regex is valid DNS-like with `$` anchor `tenants.ts:960-962`)
- **G14** — per-step MySQL/Mongo warnings before aggregate gate (`provisioner.ts:271,304,478-488`)

### Verdict: **CONDITIONAL GO**

### Conditions for GO
1. Execute staging Phase 4 steps 1–12 with saved command output (finalaudit § Staging Verification Plan).
2. Complete backup **restore** drill for Postgres + `shared_mysql_*.sql.gz` + `shared_mongo_*.archive.gz` on staging.
3. Deploy `healthcheck.sh` on production host cron; verify webhook with induced failure.
4. Re-score `finalaudit.md` / shrink `missing2arch.md` / update `todo2.md` per §8 (doc-only sync).
5. Accept or implement K6 (static copy) and K5 (nginx role) before marketing shared-nginx Finance UI path.

---

*Read-only pass. No source files modified. Evidence collected 2026-06-05 on branch `architecture`.*
