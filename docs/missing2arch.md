# Stockix — Missing / Mismatched Architecture Artifacts (Post Round 5)

**Date:** 2026-06-04  
**Purpose:** Items referenced in the final pre-production audit brief or claimed as "Deep Scan (7)" that are **not present** in the repository at expected paths, or differ materially from the spec.

This supplements [`docs/finalaudit.md`](finalaudit.md) (go/no-go). It does **not** replace [`docs/missingarchitecture.md`](missingarchitecture.md).

---

## Phase 1 mandatory reads — path corrections

| Requested path | Actual path / status |
|----------------|----------------------|
| `services/posnew/apps/pos-backend/src/queues/jobQueue.js` | **MISSING** — use [`services/posnew/apps/pos-backend/services/jobQueue.js`](services/posnew/apps/pos-backend/services/jobQueue.js) |
| `services/stockix-finance/.../auth/Local.strategy.ts` | **MISSING** — use [`services/stockix-finance/packages/server/src/modules/Auth/strategies/Local.strategy.ts`](services/stockix-finance/packages/server/src/modules/Auth/strategies/Local.strategy.ts) |
| `infra/prod/monitoring/healthcheck.sh` | **MISSING** — no `infra/prod/monitoring/` directory in repo |
| `infra/prod/monitoring/README.md` | **MISSING** |
| `infra/prod/backup/README.md` | **MISSING** |
| `services/chatlive/docker-compose.yml` | **MISSING** — only [`services/chatlive/.devcontainer/docker-compose.yml`](services/chatlive/.devcontainer/docker-compose.yml) |

All other Phase 1 paths listed in the final audit brief were found.

---

## "Deep Scan (7)" — claimed vs code

The final audit brief states seven deep-scan repairs were applied. Read-only verification on 2026-06-04:

| Claimed deep-scan item | Found in code? | Evidence |
|------------------------|----------------|----------|
| Distributed lock (deprovision) | **No** | Only `withTenantProvisionAdvisoryLock` in [`provision-lock.ts`](infra/worker-service/domain/provisioning/provision-lock.ts) L13–24; `deprovisionTenant` in [`provisioner.ts`](infra/worker-service/domain/provisioner.ts) L348+ has no advisory lock wrapper |
| TOCTOU `claim_version` | **Partial** | Optimistic claim uses `claimToken` + `WHERE status = 'pending'` in [`internal.ts`](apps/api/src/routes/internal.ts) L219–229; no column named `claim_version` |
| Traefik stale route cleanup on POS bootstrap failure | **No** | `unpublishPosTraefik` only on module **stop** ([`module-stacks.ts`](infra/worker-service/src/module-stacks.ts) L600), not in `provisionPosStack` catch (L542–556) |
| Bootstrap idempotency | **Yes** | Journal `hasOp` / `markOp` throughout [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) |
| `platformWorker.js` env guard (non-prod only) | **No** | Unconditional `dotenv` at [`platformWorker.js`](services/posnew/apps/pos-backend/workers/platformWorker.js) L6–7 |
| Shared backup strategy (MySQL + Mongo) | **No** | [`backup.sh`](infra/prod/backup/backup.sh) is Postgres-only (L26–33) |
| Monitoring (MySQL, Mongo RS, Redis + alert webhook) | **No** | Monitoring scripts directory absent; `ALERT_WEBHOOK_URL` not in [`infra/prod/.env.example`](infra/prod/.env.example) grep |

---

## Operational artifacts still missing

| Artifact | Impact |
|----------|--------|
| `OPERATIONS.md` or equivalent runbooks | M1–M5 in final audit cannot pass as documented procedures |
| Shared MySQL/Mongo backup jobs | Tenant data on shared volumes not covered by `db-backup` |
| `infra/prod/monitoring/*` | No automated health probe script for shared infra in repo |
| Finance static copy to `stockix_webapp_static` | Deferred per PARTIAL-8 TODO in [`provision-runtime.ts`](infra/worker-service/src/provision-runtime.ts) |

---

## Build artifacts (operator risk)

| Path | Note |
|------|------|
| `infra/worker-service/.tmp-dist/**` | Contains stale `mongodb://mongo/stockix` strings; excluded from Docker image via [`.dockerignore`](infra/worker-service/.dockerignore) L2 — not a runtime path if image built correctly |

---

## Recommended follow-up (documentation only)

1. Add `infra/prod/monitoring/healthcheck.sh` + README and wire cron in prod compose.
2. Extend backup story: `mysqldump` / `mongodump` for `stockix-shared` volumes or managed-DB snapshots.
3. Implement or document: deprovision advisory lock, pre-dispatch deprovision guard, POS provision failure Traefik cleanup.
4. Guard `platformWorker.js` dotenv: skip in `NODE_ENV=production` when compose injects env.
5. Add `OPERATIONS.md` runbooks linked from Architecture2 §17.
