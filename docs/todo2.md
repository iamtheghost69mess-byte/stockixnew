# Stockix — Audit Completion TODO (todo2)

**Created:** 2026-06-04  
**Purpose:** Single integrated backlog to close all **incomplete** items from [`finalaudit.md`](finalaudit.md) and [`missing2arch.md`](missing2arch.md). Use this file to drive work; update the two audit docs **only** when acceptance criteria below are met (do not flip checklist rows without evidence).

**Current audit snapshot**

| Metric | Value |
|--------|--------|
| Verdict | **CONDITIONAL GO** |
| Score | **148 PASS / 0 FAIL / 11 PARTIAL** (164 checks) |
| Code P0 wave | **Done** (2026-06-04) — see [§0 Completed](#0-completed--do-not-re-implement) |

**GO criteria (all required)**

1. Phase 4 staging steps 1–12 executed on staging with recorded results.  
2. Backup **restore drill** for Postgres + shared MySQL + shared Mongo.  
3. `healthcheck.sh` on host cron + webhook test.  
4. M1–M5 runbooks written and linked from `finalaudit.md` / `missing2arch.md`.  
5. Re-score `finalaudit.md` and shrink `missing2arch.md` open sections.

---

## 0. Completed — do not re-implement

These map to **FIXED in repo** in `finalaudit.md` blocking table and **Yes** in `missing2arch.md` Deep Scan (except `claim_version`).

| Audit IDs | What was done | Evidence |
|-----------|---------------|----------|
| F2, F4, G12, O2 | Lifecycle job guard + advisory lock on provision and deprovision | [`provision-lock.ts`](../infra/worker-service/domain/provisioning/provision-lock.ts), [`worker.ts`](../infra/worker-service/src/worker.ts) L524, L701–704 |
| E10 | POS provision failure Traefik cleanup | [`module-stacks.ts`](../infra/worker-service/src/module-stacks.ts) L546 |
| J10 | Production worker dotenv guard | [`load-env-if-dev.js`](../services/posnew/apps/pos-backend/lib/load-env-if-dev.js) + four workers |
| A7 | `.tmp-dist` not in image/git | [`.dockerignore`](../infra/worker-service/.dockerignore) L2, [`.gitignore`](../.gitignore) |
| K9, K10 | Shared MySQL/Mongo backup | [`backup-shared.sh`](../infra/prod/backup/backup-shared.sh), [`backup.sh`](../infra/prod/backup/backup.sh) |
| K11, K12, M12 | Monitoring script + env example | [`healthcheck.sh`](../infra/prod/monitoring/healthcheck.sh), [`infra/prod/.env.example`](../infra/prod/.env.example) L80 |

**Operator hygiene (no code):** Delete local `infra/worker-service/.tmp-dist/` if present; never deploy it.

---

## 1. GO blockers — operations (Tier 0)

Cross-ref: `finalaudit.md` § Blocking (OPEN), `missing2arch.md` § Still open / Recommended follow-up #1.

### 1.1 Deploy and verify `db-backup` service

- [ ] Pull latest prod compose; recreate `db-backup` (docker.sock, `stockix-shared`, `BACKUP_B2_*` env).
- [ ] Confirm cron: `0 2,14 * * *` runs `/backup/backup.sh` (see [`infra/prod/docker-compose.yml`](../infra/prod/docker-compose.yml) `db-backup`).
- [ ] Manual run: `docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env run --rm db-backup /backup/backup.sh`
- [ ] Logs show: `stockix_platform_*.dump.gz`, `shared_mysql_*.sql.gz`, `shared_mongo_*.archive.gz` uploaded to B2.

**Doc update when done:** Fix `finalaudit.md` STEP 11 expected text (still says Postgres-only — outdated).

### 1.2 Backup restore drill (staging)

- [ ] Download latest Postgres dump from B2; `pg_restore` into disposable DB; smoke-query `tenants` table.
- [ ] Download `shared_mysql_*.sql.gz`; restore to staging MySQL (or scratch container); verify `SHOW DATABASES LIKE 'stockix_%'`.
- [ ] Download `shared_mongo_*.archive.gz`; `mongorestore --gzip --archive` on staging; verify `{slug}_pos` DBs.
- [ ] Record date, filenames, and any issues in staging log (append to `infra/prod/backup/README.md` § Restore or new `docs/staging-log.md`).

**Doc update when done:** `missing2arch.md` — remove “Staging backup restore proof” from Operational artifacts; note restore date in `finalaudit.md` executive summary.

### 1.3 Monitoring on host

- [ ] Set `ALERT_WEBHOOK_URL` in production `infra/prod/.env` (not only `.env.example`).
- [ ] Cron example from [`infra/prod/monitoring/README.md`](../infra/prod/monitoring/README.md) (e.g. every 5 min).
- [ ] Induce failure (stop `stockix-redis` briefly); confirm webhook POST and log line.
- [ ] Normal run: exit 0 from `bash infra/prod/monitoring/healthcheck.sh`.

**Doc update when done:** Note cron path in `missing2arch.md` § Still open (strike “host cron for healthcheck”).

### 1.4 Phase 4 staging verification (full)

Execute [`finalaudit.md`](finalaudit.md) § Staging Verification Plan; tick each step; save command output.

| Step | Task | Pass criteria | Audit trace |
|------|------|---------------|-------------|
| 1 | Shared stack up + aliases | `rs.status().ok === 1`, `PONG`, hostnames resolve | N3, K2 |
| 2 | Traefik dynamic dir | Files appear under `TRAEFIK_DYNAMIC_DIR`; Traefik watches dir | N7, E1–E3 |
| 3 | Finance-only tenant `acme` | `stockix-acme-server-1` healthy; `tenant-acme.yml`; `/api/ping` OK | N5–N7 |
| 4 | Add POS to `acme` | `stockix-pos-acme` compose up (backend + workers) | N8, F6–F9 |
| 5 | Mongo isolation | `acme_pos` vs `beta_pos` distinct | A1–A5, N5 |
| 6 | Redis isolation | Keys under `tenant:acme:*` only for acme | C1–C5, N6 |
| 7 | MySQL grants | `SHOW GRANTS FOR 'tenant_acme'@'%'` includes ``stockix_acme_%`` | B5, N5 |
| 8 | Concurrent provision | Second job errors with lifecycle conflict | F1, F2, STEP 8 |
| 9 | Provision rollback | Failed provision runs shared DB teardown in journal rollback | G13, STEP 9 |
| 10 | Full deprovision | No MySQL DBs, Mongo DB, Redis keys, Traefik YAML for slug; `audit-orphan-dbs.ts` clean | G4–G10, O3–O8 |
| 11 | Backup execution | All three artifact types in B2 (see §1.1) | K9, K10 |
| 12 | Healthcheck | Exit 0 healthy; non-zero + alert when broken | K11, K12 |
| 13–15 | Two-tenant + failure injection | `acme` + `beta` cross-isolation; document injections in runbooks | N5–N6, M1–M5 |

- [ ] Steps 1–12 complete with saved logs.
- [ ] Steps 13–15 complete **after** M1–M5 runbooks exist (or document “deferred” with risk acceptance).

**Doc update when done:** `finalaudit.md` status → conditional GO or GO; executive summary lists staging date.

---

## 2. GO blockers — runbooks (Tier 0) — audit FAIL M1–M5

Cross-ref: `finalaudit.md` §M (M1–M5 FAIL), `missing2arch.md` § Operational artifacts, Warnings table M1–M5.

**Target:** Extend [`infra/prod/OPERATIONS.md`](../infra/prod/OPERATIONS.md) with dedicated sections **or** add `docs/runbooks/*.md` and link from OPERATIONS + both audit docs.

### M1 — Stuck provision

- [ ] **Symptoms:** `tenantLifecycleJobs` status `running` for > N minutes; worker logs stall; journal op stuck.
- [ ] **Diagnosis:** Query job id, `tenantProvisionEvents`, last `markOp` in worker logs; check `assertNoConcurrentTenantLifecycleJob` conflicts.
- [ ] **Safe actions:** Cancel job via API if supported; restart worker; advisory lock released on connection drop — document PG `pg_locks` check for `tenantProvisionLockId`.
- [ ] **Recovery:** Retry provision with `retryModules`; manual compose down `stockix-{slug}` / `stockix-pos-{slug}`; never delete Postgres tenant row before data-plane cleanup.
- [ ] **Escalation:** Link to M5 if partial state.

**Pass:** Section exists; `finalaudit.md` M1 → PASS; link in `missing2arch.md`.

### M2 — Failed deprovision

- [ ] **Symptoms:** Job failed; tenant still in Postgres; shared MySQL/Mongo/Redis/Traefik remnants.
- [ ] **Diagnosis:** Read `cleanupResults` in logs; `SHARED_MYSQL_ROOT_PASSWORD` missing (G15 throw); partial Mongo/Redis warnings (G14).
- [ ] **Safe actions:** Set root password; re-run `tenant.deprovision`; run [`audit-orphan-dbs.ts`](../infra/worker-service/scripts/audit-orphan-dbs.ts).
- [ ] **Manual cleanup:** `DROP DATABASE`, `mongosh` drop `{slug}_pos`, `redis-cli` `KEYS tenant:{slug}:*`, remove Traefik YAML, rm `TENANT_ENV_ROOT/{slug}`.
- [ ] **Policy:** Document fail-fast vs best-effort for G14 (align with code in [`provisioner.ts`](../infra/worker-service/domain/provisioner.ts) L456–460).

**Pass:** M2 → PASS; G14 warning addressed in runbook text.

### M3 — Mongo replica set failure

- [ ] **Symptoms:** `rs.status().ok !== 1`; POS `MongoServerError` replica set; provision fails at Mongo steps.
- [ ] **Diagnosis:** `docker logs stockix-shared-stockix-mongo-1`; rs-init container logs; [`infra/shared/docker-compose.yml`](../infra/shared/docker-compose.yml) rs-init service.
- [ ] **Recovery:** Re-run rs.initiate procedure from shared compose docs; single-node RS limitations; backup before repair.
- [ ] **Health:** `healthcheck.sh` mongo check; tie to §1.3 alerts.

**Pass:** M3 → PASS.

### M4 — Shared MySQL outage

- [ ] **Symptoms:** All tenants Finance down; `ECONNREFUSED` to `stockix-mysql`; provision/deprovision DB steps fail.
- [ ] **Diagnosis:** Container health, disk full, `max_connections`, slow query log.
- [ ] **Recovery:** Restart `stockix-mysql`; restore from `shared_mysql_*.sql.gz` (§1.2); verify grants per tenant.
- [ ] **Blast radius:** Table from `finalaudit.md` §3.6 MySQL row.

**Pass:** M4 → PASS.

### M5 — Partial tenant (split brain)

- [ ] **Definition:** Postgres row exists but compose down; or compose up but no PG row; or shared DB exists without PG tenant.
- [ ] **Diagnosis:** Compare Postgres `tenants` + `tenant_deployments` vs `docker ps` vs `audit-orphan-dbs.ts` vs Traefik files vs `TENANT_ENV_ROOT`.
- [ ] **Recovery matrix:** For each mismatch type, ordered steps (deprovision vs manual delete vs re-provision).
- [ ] **Prevention:** Lifecycle locks (F2/F4) and journal ops reference.

**Pass:** M5 → PASS; consolidate scattered notes from [`missingarchitecture.md`](missingarchitecture.md).

### M10 — `.env.example` documentation (PARTIAL)

- [ ] Audit all vars in `infra/prod/.env.example` without comment blocks; add one-line purpose + required/optional.
- [ ] Cross-link `BACKUP_*`, `HEALTH_*`, `ALERT_WEBHOOK_URL`, `SHARED_*` to backup/README and monitoring/README.

**Pass:** M10 → PASS.

---

## 3. Code and architecture — PARTIAL checks (14 items)

Work in priority order after Tier 0 unless product needs nginx/static sooner.

### C6 — POS Redis `org:{id}:` prefix (PARTIAL)

- [ ] Read [`redisKeys.js`](../services/posnew/apps/pos-backend/services/redisKeys.js) L10+.
- [ ] Prefix rate-limit keys with `REDIS_KEY_PREFIX` or `tenant:{slug}:` convention.
- [ ] Grep tests / manual: two tenants, no key collision on rate limits.
- [ ] **Or** document accepted risk in Architecture2 + `finalaudit.md` C6 note.

**Pass:** C6 → PASS (code) or stay PARTIAL with signed risk in ARCHITECTURE.md.

### C10 / K3 — Redis AOF (PARTIAL)

- [ ] Option A: Enable AOF in [`infra/shared/docker-compose.yml`](../infra/shared/docker-compose.yml) L147–148 (`appendonly yes`, volume).
- [ ] Option B: Document RDB-only acceptable loss window in Architecture2 §shared redis + OPERATIONS disaster section.

**Pass:** C10 + K3 → PASS.

### F13 — POS bootstrap journal (PARTIAL)

- [ ] Add `pos.bootstrap_organization` (or equivalent) `hasOp`/`markOp` around [`bootstrapPosOrganization`](../infra/worker-service/src/module-stacks.ts) L413+.
- [ ] Retry provision does not duplicate org.

**Pass:** F13 → PASS.

### G14 — Deprovision partial cleanup (runbook + optional code)

- [ ] Covered in M2 runbook (§2).
- [ ] Optional: change warnings to fail-fast for Mongo/Redis when gate would block PG delete anyway.

**Pass:** Warning row cleared in `finalaudit.md` Warnings table.

### J8 — `claim_version` vs `claimToken` (PARTIAL)

Cross-ref: `missing2arch.md` Deep Scan TOCTOU row.

- [ ] Option A: Add `claim_version` column + migration; update [`internal.ts`](../apps/api/src/routes/internal.ts) L219–229.
- [ ] Option B: Document `claimToken` as intentional; rename audit spec to match.

**Pass:** J8 → PASS; missing2arch Deep Scan row → **Yes** or **Accepted**.

### J9 — Stale job `effectiveStaleMs` (PARTIAL)

- [ ] Read [`internal.ts`](../apps/api/src/routes/internal.ts) L85–88.
- [ ] Align with Architecture2 (2× multiplier or explicit `min` rationale); comment in code + doc.

**Pass:** J9 → PASS.

### K5 — Shared nginx Finance upstream (PARTIAL)

- [ ] Review [`infra/shared/nginx/nginx.conf`](../infra/shared/nginx/nginx.conf) L18–25.
- [ ] Add upstream to Finance internal URL **or** document that Traefik is sole edge and nginx is static-only.

**Pass:** K5 → PASS.

### K6 — Finance static copy to nginx volume (PARTIAL)

Cross-ref: `missing2arch.md` Finance static; PARTIAL-8; `provision-runtime.ts` L1509–1511.

- [ ] Implement `docker.static_copy_step` (or copy in provision-runtime) to `SHARED_STATIC_ROOT` / `/var/www/{slug}/public/`.
- [ ] Verify nginx serves assets for a test tenant.
- [ ] **Or** explicit deferral: Traefik-only static path; update Architecture2 §18.1 item 6; K6 stays PARTIAL with waiver.

**Pass:** K6 → PASS or documented waiver linked from both audit docs.

### L8 — Journal network connect (PARTIAL)

- [ ] Add journal op for `docker network connect` at [`provision-runtime.ts`](../infra/worker-service/src/provision-runtime.ts) ~L1518.
- [ ] Retry provision does not double-connect (idempotent).

**Pass:** L8 → PASS.

### L9 — Tenant slug regex (PARTIAL)

- [ ] Compare [`tenants.ts`](../apps/api/src/routes/tenants.ts) L960–962 vs audit spec end-anchor.
- [ ] Tighten regex **or** update audit spec / Architecture2 to match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

**Pass:** L9 → PASS.

---

## 4. Warnings and P1/P2 backlog

From `finalaudit.md` § Warnings and § Final Recommendations.

| Priority | ID / item | Action | Effort |
|----------|-----------|--------|--------|
| P1 | K6 | See §3 K6 | M |
| P1 | M1–M5 | See §2 | M |
| P1 | Staging E2E script | Create `scripts/staging-e2e.sh` automating Phase 4 steps 1–10 | M |
| P2 | C10/K3 | See §3 | S |
| P2 | C6 | See §3 | M |
| P2 | L8 bootstrap network | See §3; Architecture2 §18.1 item 7 | M |

### Residual risks (document, not necessarily FAIL)

- [ ] **Traefik `docker.sock`:** `finalaudit.md` §3.4 — document why acceptable vs worker socket-proxy-only pattern.
- [ ] **chatlive compose:** `missing2arch.md` path table — add top-level compose or document “not in prod path”.
- [ ] **pos-frontend2 Dockerfile:** Complete Phase 1 read for I3 if not yet done.
- [ ] **STEP 8 message:** Update expected error text to “Concurrent lifecycle job” (renamed assert).

---

## 5. Deep Scan (7) — remaining integration

| Item | Status in code | Remaining todo | Doc sync |
|------|----------------|----------------|----------|
| Deprovision lock | Yes | — | Done |
| Traefik POS cleanup | Yes | — | Done |
| Bootstrap idempotency | Yes | F13 journal for POS bootstrap | §3 |
| platformWorker dotenv | Yes | — | Done |
| Shared backup | Yes | §1.1–1.2 restore drill | §1 |
| Monitoring | Yes | §1.3 host cron | §1 |
| TOCTOU `claim_version` | Partial | §3 J8 | missing2arch + finalaudit J8 |

---

## 6. Path corrections (documentation only)

From `missing2arch.md` § Phase 1 — no code required unless you want aliases:

- [ ] Add redirect note in audit brief: `jobQueue.js` lives under `services/` not `src/queues/`.
- [ ] Add redirect note: `Local.strategy.ts` full path under `packages/server/...`.
- [ ] Resolve chatlive: prod compose stub or “out of scope” in ARCHITECTURE.md.

---

## 7. Doc maintenance matrix

When a todo section is complete, update **both** audit files as follows.

| When you complete… | Update `finalaudit.md` | Update `missing2arch.md` |
|--------------------|------------------------|---------------------------|
| §1.1–1.3 ops | Blocking table: staging OPEN → done note; STEP 11–12 text | Strike ops lines in § Still open |
| §1.4 staging | Score table; verdict; step checkmarks | Recommended #1 done |
| §2 M1–M5 | M1–M5 FAIL → PASS with link to runbook section | Remove M1–M5 from Operational artifacts |
| §3 each PARTIAL | Matching row FAIL/PARTIAL → PASS + file:line | N/A unless Deep Scan related |
| All Tier 0 + critical PARTIAL | **GO** or **conditional GO** in executive summary | Shrink to “historical path corrections” only |
| §1.2 restore | K9/K10 footnote “restore verified DATE” | Remove staging backup proof row |

**Re-score formula:** Start 136 PASS / 5 FAIL / 14 PARTIAL. Each M1–M5 done: +1 PASS, −1 FAIL. Each PARTIAL closed: +1 PASS, −1 PARTIAL. Target for GO: **0 FAIL**, staging evidence recorded, PARTIALs either closed or explicitly waived in Architecture2.

---

## 8. Suggested execution order

```text
Week 1 (ops):     §1.1 → §1.2 → §1.3 → §1.4 (steps 1–12)
Week 1 (docs):    §2 M1–M5 runbooks (can parallel ops)
Week 2 (product): §3 K6, K5, F13, L8 (as needed for nginx/static)
Week 2 (hardening): §3 C6, C10, J8, J9, L9
Week 3 (automation): staging-e2e script §4
Final:            §7 doc matrix → GO review
```

---

## 9. Quick reference — open audit IDs only

| Status | IDs |
|--------|-----|
| **FAIL (0)** | ~~M1, M2, M3, M4, M5~~ — closed in `infra/prod/OPERATIONS.md` |
| **PARTIAL (5)** | J8, K5, K6, L9, M10 (C6 C10 F13 K3 L8 J9 promoted to PASS) |
| **OPEN (ops)** | Phase 4 staging, backup restore, health cron |
| **missing2arch open** | M1–M5 files, static copy K6, restore proof, claim_version |

---

*Integrated from [`finalaudit.md`](finalaudit.md) (2026-06-04, post P0) and [`missing2arch.md`](missing2arch.md).*
