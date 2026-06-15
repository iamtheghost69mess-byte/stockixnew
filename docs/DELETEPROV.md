# DELETEPROV.md - Tenant Deletion & Deprovisioning Audit

## 1. Executive Summary
This document provides a comprehensive audit of the Stockix tenant deletion and deprovisioning platform. The investigation identified the root causes for the two critical issues reported:
1. **Bulk Delete Queue Stalls**: Bulk delete operations appear queued but never execute because the frontend UI submits the deletion requests sequentially, awaiting full completion (up to 5 minutes) of the previous tenant before issuing the API request for the next. 
2. **"Removing..." State Hangs**: Deletion jobs that fail repeatedly (e.g., due to Docker unavailability or database locks) hit their `maxAttempts` limit. Once `attempts >= maxAttempts`, the worker's `claimNextJob` query explicitly ignores them, leaving the job permanently in the `pending` state and the UI permanently polling for a `404 Not Found` that never arrives.

## 2. Deletion Architecture
The deletion flow spans the Dashboard, Control Plane API, BullMQ/Postgres queue, Worker Service, and infrastructure layers.

**Architecture Map:**
```text
User (Dashboard)
  ↓ clicks Delete, confirms
Dashboard UI (tenants-page-content.tsx)
  ↓ DELETE /api/tenants/:tenantId?confirm=...
Control Plane API (routes/tenants.ts)
  ↓ inserts job into `tenant_lifecycle_jobs`
Postgres Queue (tenant_lifecycle_jobs table)
  ↓ polled via `FOR UPDATE SKIP LOCKED`
Worker Service (worker.ts -> claimNextJob)
  ↓ executes `runDeprovisionJob`
Docker Cleanup (domain/provisioner.ts -> docker-compose down)
  ↓ removes containers, networks, volumes
Database/Redis Cleanup (deprovisionTenantDatabases)
  ↓ drops MySQL, Mongo, Redis prefixes
Final Cleanup (domain/provisioner.ts)
  ↓ deletes Postgres `tenants` row
```

**Key Files Involved:**
- **UI:** `apps/dashboard/app/(dashboard)/tenants/_components/tenants-page-content.tsx`, `tenant-delete-dialogs.tsx`
- **API:** `apps/api/src/routes/tenants.ts`
- **Worker Entry:** `infra/worker-service/src/worker.ts`
- **Deprovision Logic:** `infra/worker-service/domain/provisioner.ts`
- **Queue/Claim:** `apps/api/src/routes/internal.ts`

## 3. Single Tenant Delete Flow
1. User clicks delete, confirms by typing the UUID.
2. UI calls `DELETE /api/tenants/:tenantId?mode=single`.
3. API inserts `tenant.deprovision` job and updates tenant status to `deprovisioning`.
4. UI starts `pollUntilTenantRemoved`, hitting `GET /api/tenants/:tenantId` every 3 seconds.
5. Worker claims job via `/internal/jobs/claim`.
6. Worker executes `deprovisionTenant()`.
7. `docker-compose down -v --rmi local` runs.
8. Shared DBs (MySQL, Mongo, Redis keys) are dropped.
9. Worker deletes the `tenants` Postgres row (which cascade-deletes the job row).
10. UI receives a `404 Not Found` from the polling API and removes the tenant from the table.

**Can it succeed 100% of the time?**
**No.** If Docker daemon is unresponsive, or MySQL proxy drops the connection, the job throws an error. The worker catches it, increments `attempts`, and leaves it `pending`. If `attempts` reaches `maxAttempts` (3), the job becomes a zombie.

## 4. Bulk Delete Flow (Root Cause Analysis)
**Why "Bulk delete enters queue but never executes":**
The UI implementation in `tenants-page-content.tsx` (`executeBulkDelete` function) uses a sequential `for` loop:
```typescript
for (let i = 0; i < targets.length; i++) {
  // 1. API fetch to queue deletion
  res = await fetch(`/api/tenants/${tenantId}?volumes=true&confirm=DELETE&mode=bulk`, { method: "DELETE" });
  
  // 2. AWAIT completion (up to 5 minutes)
  await pollUntilTenantRemoved(tenantId, ...);
}
```
**Root Cause:** The API requests are **not batched or queued in parallel**. The UI waits for Tenant A to completely finish deprovisioning (which takes time) before it even sends the API request to queue Tenant B. If the user navigates away, or if Tenant A hangs, Tenant B is *never* queued. It only "appears" queued because the UI dialogue shows them all in a list.

## 5. Queue Audit
**Status:** `tenant_lifecycle_jobs` using Postgres `FOR UPDATE SKIP LOCKED`.
- **Orphan/Zombie Jobs:** **Critical Bug Found.** The `claimNextJob` query in `internal.ts`:
  `WHERE status = 'pending' AND attempts < max_attempts`
  If a job fails 3 times, its status remains `pending` but `attempts == 3`. It is permanently ignored by the worker. There is no background sweeper to move `pending` + max attempts to `dead` status.
- **Stuck Jobs (Running):** Handled correctly. The API's `/internal/jobs/claim` reclaims stale `running` jobs if their lease/heartbeat expires.
- **Cascade Deletion:** The worker manually sets `status = "completed"` and then runs `db.delete(tenants)`. Because of Postgres `ON DELETE CASCADE`, the job row vanishes immediately. This makes historical tracking of successful deletes impossible.

## 6. Worker Execution Audit
- **Worker Handler:** `runDeprovisionJob` maps to `deprovisionTenant`.
- **Timeouts:** Wrapped in `withExecutionTimeout`. Safe.
- **Deadlocks:** Uses advisory locks `withTenantLifecycleAdvisoryLock`. Safe.
- **Can delete jobs become permanently stuck?** **Yes.** If an unhandled exception occurs (e.g., network failure to Docker), the `workerPollLoop` handles the error but does not mark `noRetry = true` for deprovision jobs. It retries until max attempts, then becomes a zombie (see Queue Audit).

## 7. Database Cleanup Audit
- **MySQL/Mongo/Redis:** Cleaned via `deprovisionTenantDatabases()`.
- **Postgres:** 
  ```typescript
  await db.delete(tenantProvisionEvents).where(...);
  await db.delete(adminAuditLog).where(...);
  await db.delete(tenantDeployments).where(...);
  await db.delete(tenants).where(...);
  ```
- **Finding:** The Postgres deletion is at the very end. If any prior step fails, the Postgres records remain, which is the correct fail-safe behavior to prevent orphaned data.

## 8. Docker Cleanup Audit
- Runs `docker-compose down --remove-orphans -v --rmi local`.
- **Risk:** Silent failures? No, `execa` will throw if the command fails.
- **Risk:** Orphan resources? If a container was started outside compose but attached to the network, it might block network deletion.
- **Regex Parsing:** Not applicable here, uses standard `docker-compose` commands.

## 9. Confirmation Modal Audit
**Current Implementation:**
- Single Delete: Requires typing the exact `tenantId` (UUID).
- Bulk Delete: Requires typing `"DELETE"`.

**Audit Requirement:** "User must type the actual Docker Image ID or Tenant Identifier displayed in the confirmation modal."
**Finding:** For Bulk Delete, this is currently hardcoded to `"DELETE"` in `tenant-delete-dialogs.tsx` (line 140: `const bulkConfirmOk = bulkDeleteConfirmInput === "DELETE";`). This needs to be refactored to require a specific unique identifier, or handled safely. For single delete, it uses UUID, not the slug/identifier displayed.

## 10. UI State Audit
**Why UI never exits "Removing..." state:**
The UI relies on `pollUntilTenantRemoved` which expects a `404 Not Found` when the API cannot find the tenant. If the backend job becomes a zombie (max attempts reached), the tenant row is never deleted. The UI polls until `DELETE_MAX_WAIT_MS` (5 mins) and throws an error, leaving the local state as `deprovisioning` (Removing...). A hard refresh keeps it as "Removing..." because the DB status is literally `"deprovisioning"`.

## 11. Provision Cancel Audit
- **UI:** User clicks "Stop". Calls `/api/tenants/:tenantId/provision-stop`.
- **API:** Marks `tenantLifecycleJobs.cancelRequestedAt`.
- **Worker:** Checks `assertProvisionNotCancelled()`. If cancelled, throws `cancelled_by_user`.
- **Cleanup:** Yes, `provision-runtime.ts` catches `jobCancelled` and runs `deprovisionTenantDatabases()` to rollback.
- **Status:** Functional and safely aborts.

## 12. State Machine Audit
**Valid Transitions:**
- Provision: `pending -> running -> completed/failed`. (Valid)
- Delete: `pending -> running -> completed -> (row deleted)`. (Valid)
**Missing Transitions:**
- `pending -> dead`: When `attempts >= maxAttempts`, the job is stuck in `pending`. It should transition to `dead`.

## 13. Reliability Risks (Top 5)
1. **Critical:** Bulk delete UI sequentially blocking on polling.
2. **Critical:** Zombie jobs in Postgres when `attempts >= max_attempts` while status is `pending`.
3. **High:** No visibility into successful deletes because `ON DELETE CASCADE` wipes the job history.
4. **Medium:** Bulk confirmation modal is too generic (`DELETE`).
5. **Low:** Docker compose timeouts might leave partial volumes if the daemon hangs.

## 14. Refactor Roadmap
**Priority 0: Critical Bugs Preventing Deletion**
- **Fix Bulk Delete Loop:** Modify `executeBulkDelete` in `tenants-page-content.tsx` to issue `Promise.all` for all `fetch(DELETE)` requests *before* polling. Queue them all instantly.
- **Fix Zombie Jobs:** In `internal.ts` `app.post("/internal/jobs/claim")`, add a sweep for `status = 'pending' AND attempts >= max_attempts` to mark them as `dead` and update the tenant status to `active` or `failed` so the UI exits the "Removing..." state.

**Priority 1: Queue Reliability**
- Remove `ON DELETE CASCADE` from `tenantLifecycleJobs.tenantId` or handle it by logging the successful deletion to a separate audit table, preserving deprovisioning logs.

**Priority 2: UI Improvements**
- Update the Bulk Delete modal to require typing the count (e.g., `"DELETE 5 TENANTS"`) or the exact slug of the primary tenant, as per the audit requirements.

**Priority 3: Architecture Improvements**
- Implement a dedicated garbage collection worker for Docker volumes and networks to ensure no orphans are left behind if `compose down` partially fails.
