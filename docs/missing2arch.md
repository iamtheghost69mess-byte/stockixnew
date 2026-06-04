# Stockix — Missing / Mismatched Architecture Artifacts (Post Round 5)

**Date:** 2026-06-04 (updated after P0 final-audit repairs)  
**Purpose:** Items referenced in the final pre-production audit brief or claimed as "Deep Scan (7)" that are **not present** in the repository at expected paths, or differ materially from the spec.

This supplements [`docs/finalaudit.md`](finalaudit.md) (go/no-go). It does **not** replace [`docs/missingarchitecture.md`](missingarchitecture.md).

---

## Phase 1 mandatory reads — path corrections

| Requested path | Actual path / status |
|----------------|----------------------|
| `services/posnew/apps/pos-backend/src/queues/jobQueue.js` | **MISSING** — use [`services/posnew/apps/pos-backend/services/jobQueue.js`](services/posnew/apps/pos-backend/services/jobQueue.js) |
| `services/stockix-finance/.../auth/Local.strategy.ts` | **MISSING** — use [`services/stockix-finance/packages/server/src/modules/Auth/strategies/Local.strategy.ts`](services/stockix-finance/packages/server/src/modules/Auth/strategies/Local.strategy.ts) |
| `infra/prod/monitoring/healthcheck.sh` | **Present** — [`infra/prod/monitoring/healthcheck.sh`](infra/prod/monitoring/healthcheck.sh) |
| `infra/prod/monitoring/README.md` | **Present** — [`infra/prod/monitoring/README.md`](infra/prod/monitoring/README.md) |
| `infra/prod/backup/README.md` | **Present** — [`infra/prod/backup/README.md`](infra/prod/backup/README.md) |
| `services/chatlive/docker-compose.yml` | **MISSING** — only [`services/chatlive/.devcontainer/docker-compose.yml`](services/chatlive/.devcontainer/docker-compose.yml) |

All other Phase 1 paths listed in the final audit brief were found.

---

## "Deep Scan (7)" — claimed vs code

Verification after P0 repair wave (2026-06-04):

| Claimed deep-scan item | Found in code? | Evidence |
|------------------------|----------------|----------|
| Distributed lock (deprovision) | **Yes** | `withTenantLifecycleAdvisoryLock` in [`worker.ts`](infra/worker-service/src/worker.ts) L704 wrapping `deprovisionTenant` |
| TOCTOU `claim_version` | **Partial** | Optimistic claim uses `claimToken` + `WHERE status = 'pending'` in [`internal.ts`](apps/api/src/routes/internal.ts) L219–229; no column named `claim_version` |
| Traefik stale route cleanup on POS bootstrap failure | **Yes** | `unpublishPosTraefik` in [`module-stacks.ts`](infra/worker-service/src/module-stacks.ts) L546 (`provisionPosStackTracked` catch) |
| Bootstrap idempotency | **Yes** | Journal `hasOp` / `markOp` throughout [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) |
| `platformWorker.js` env guard (non-prod only) | **Yes** | [`load-env-if-dev.js`](services/posnew/apps/pos-backend/lib/load-env-if-dev.js); all four POS workers |
| Shared backup strategy (MySQL + Mongo) | **Yes** | [`backup-shared.sh`](infra/prod/backup/backup-shared.sh); invoked from [`backup.sh`](infra/prod/backup/backup.sh) |
| Monitoring (MySQL, Mongo RS, Redis + alert webhook) | **Yes** | [`healthcheck.sh`](infra/prod/monitoring/healthcheck.sh); `ALERT_WEBHOOK_URL` in [`.env.example`](infra/prod/.env.example) |

**Still open:** backup **restore tested on staging** (ops), host cron for healthcheck, dedicated M1–M5 runbook files.

---

## Operational artifacts still missing

| Artifact | Impact |
|----------|--------|
| Dedicated M1–M5 runbook files | Final audit M1–M5 still FAIL; general ops doc exists at [`infra/prod/OPERATIONS.md`](../infra/prod/OPERATIONS.md) but not split per checklist |
| Finance static copy to `stockix_webapp_static` | Deferred per PARTIAL-8 TODO in [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) |
| Staging backup restore proof | K9/K10 PASS in repo; GO requires operator restore drill |

---

## Build artifacts (operator risk)

| Path | Note |
|------|------|
| `infra/worker-service/.tmp-dist/**` | Stale `mongodb://mongo/stockix` strings possible locally; excluded from Docker image via [`.dockerignore`](infra/worker-service/.dockerignore) L2 and root [`.gitignore`](.gitignore) |

---

## Recommended follow-up

1. Run Phase 4 staging steps in [`finalaudit.md`](finalaudit.md) — backup restore + `healthcheck.sh` on host.
2. Add or link M1–M5 runbooks (stuck provision, failed deprovision, Mongo RS, MySQL outage, partial tenant).
3. Implement or defer Finance static copy (K6 / PARTIAL-8).
