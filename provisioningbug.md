## 1. WHAT WE HAVE (confirmed working)
- Postgres `tenant_lifecycle_jobs` as source of truth
- `FOR UPDATE SKIP LOCKED` job claiming
- Advisory locks preventing double execution
- Stateless worker with heartbeat/lease system
- Docker as derived execution layer
- Redis for queues (BullMQ), cache, rate limiting only
- `deprovisionTenantDatabases` as compensation/rollback function

## 2. WHAT WE DO NOT HAVE (confirmed missing)
- No reconciliation loop (Postgres vs Docker drift goes undetected)
- No orphan cleanup (dangling volumes/networks after partial failure)
- No distributed tracing (OpenTelemetry or equivalent)
- No failure simulation layer (no way to test crash scenarios)
- No network isolation enforcement (tenant cross-talk unverified)
- No actionable output layer (failures logged but not surfaced to operators)

## 3. HOW PROVISIONING WORKS (step by step)
Document the exact flow:
1. API receives provision request → inserts job into `tenant_lifecycle_jobs`
2. Worker polls → claims job via `FOR UPDATE SKIP LOCKED`
3. Worker acquires advisory lock via `withTenantLifecycleAdvisoryLock`
4. Worker executes `docker-compose up` for tenant containers
5. Worker creates tenant databases (MySQL, MongoDB)
6. Worker updates job status to `completed`
7. On any failure → worker calls `deprovisionTenantDatabases` → sets job to `failed`
8. Heartbeat runs in parallel → if worker dies, lease expires → job reclaimed

## 4. WHAT BREAKS PROVISIONING
List every known cause of provisioning failure:
- Redis host resolves to `localhost` (wrong env var) → BullMQ crashes
- `ON DELETE CASCADE` on `tenantId` → deleting tenant destroys job history silently
- Docker partial failure mid-compose → orphan containers, job stuck
- Worker crash before rollback triggers → job stays `running` forever (deadlock)
- Postgres lock failure → double-provisioning corrupts volumes + DB state
- Missing `plans` row → FK violation → job goes `dead`
- Network partition to Postgres → worker throws unhandled rejection
- `CREATE DATABASE` not using `IF NOT EXISTS` → non-idempotent on retry

## 5. CONFIRMED BUGS (do not remove this section)
❌ ON DELETE CASCADE on tenant_lifecycle_jobs.tenantId
   - Effect: Deleting a tenant silently deletes all provisioning history
   - Fix needed: Change to ON DELETE SET NULL + add archival trigger

❌ Redis fallback to localhost
   - Effect: Inside Docker network, localhost:6379 resolves to nothing → ECONNREFUSED
   - Fix needed: Strict env var validation at boot, fail-fast if REDIS_HOST missing

❌ No idempotency guarantee on CREATE DATABASE
   - Effect: Retry after partial failure may crash on duplicate DB
   - Fix needed: Use IF NOT EXISTS on all database creation queries

❌ Worker crash before rollback
   - Effect: Job stays in `running`, tenant stuck, no auto-recovery
   - Fix needed: Heartbeat expiry must trigger automatic deprovision + retry

❌ No orphan cleanup
   - Effect: Failed provisions leave Docker networks/volumes consuming resources forever
   - Fix needed: Cleanup job that scans for containers not matching any active tenant

## 6. HOW TO DEBUG A PROVISIONING FAILURE (simple, no checkers)

When provisioning fails, do this in order:

Step 1 — Check the job status in Postgres:
```sql
SELECT id, status, error, attempts, "tenantId", "createdAt", "updatedAt"
FROM tenant_lifecycle_jobs
WHERE "tenantId" = '<tenant-uuid>'
ORDER BY "createdAt" DESC
LIMIT 5;
```

Step 2 — Check worker logs for that tenantId:
```bash
docker logs stockix-worker --tail=200 | grep <tenant-uuid>
```

Step 3 — Check if containers exist:
```bash
docker ps -a | grep <tenant-uuid>
```

Step 4 — Check if volumes/networks are orphaned:
```bash
docker volume ls | grep <tenant-uuid>
docker network ls | grep <tenant-uuid>
```

Step 5 — Check Redis connectivity from inside the finance container:
```bash
docker exec stockix-finance printenv | grep REDIS
```

Step 6 — Read the raw error. It will be in one of:
- `tenant_lifecycle_jobs.error` column (Postgres)
- Worker container logs
- Docker daemon stderr (captured by execa in worker)

No need to run health checkers. The error is always in one of these three places.

## 7. UNVERIFIED AREAS (not broken, not proven)
- Worker reliability under crash: designed, not tested
- Idempotency under partial Docker failure: assumed, not verified
- Redis isolation via REDIS_KEY_PREFIX: exists in code, not audited end-to-end
- Docker orchestration rollback: compensation function exists, behavior unproven
- Network isolation between tenants: shared network exists, no enforcement proven

## 8. CLASSIFICATION OF ISSUES

| Area | Status | Production Safe? |
|---|---|---|
| Postgres queue design | ✅ Confirmed working | YES |
| Advisory locks | ✅ Confirmed working | YES |
| Worker stateless model | ✅ Designed correctly | UNVERIFIED |
| Heartbeat/lease expiry | ✅ Designed correctly | UNVERIFIED |
| Redis isolation | ⚠️ Partial | UNVERIFIED |
| Idempotency | ⚠️ Partial | UNVERIFIED |
| ON DELETE CASCADE bug | ❌ Confirmed broken | NO |
| Redis localhost fallback | ❌ Confirmed broken | NO |
| Orphan cleanup | ❌ Missing entirely | NO |
| Reconciliation loop | ❌ Missing entirely | NO |
| Distributed tracing | ❌ Missing entirely | NO |
| Failure simulation | ❌ Missing entirely | NO |
| Network isolation | ❌ Unverified | NO |

## 9. REMEDIATION PRIORITY (what to fix first)
1. Fix ON DELETE CASCADE → SET NULL (10 min schema change, critical)
2. Add fail-fast REDIS_HOST validation at app boot (prevents silent failures)
3. Add IF NOT EXISTS to all CREATE DATABASE calls (idempotency fix)
4. Add heartbeat expiry → auto-deprovision trigger (prevents deadlocked jobs)
5. Add orphan cleanup cron job (prevents resource leak)
6. Add reconciliation loop (Postgres vs Docker state sync)
7. Add OpenTelemetry tracing (observability)
8. Add failure simulation tests (chaos testing)
