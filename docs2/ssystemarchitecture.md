# Provisioning Runtime Reality Audit

This document traces one real provisioning flow as implemented today, from dashboard submit to terminal outcome, using current runtime code paths only.

Scope of trace:
- API entry: `apps/api/src/index.ts`
- Worker runtime: `infra/worker-service/src/worker.ts`
- Provision execution: `infra/worker-service/src/provision-runtime.ts`
- Frontend observer flow: `apps/dashboard/app/(dashboard)/tenants/page.tsx`
- Queue model: `tenant_lifecycle_jobs` in `packages/db/src/schema.ts`

This is a behavior audit, not a remediation proposal.

---

## 1. Full Execution Timeline (REAL FLOW)

### Scenario chosen
Successful `POST /tenants` request is accepted; worker executes; job reaches `completed`; user receives UI "complete" signal.

### Timeline

1) User clicks **Provision tenant** in dashboard wizard  
- Source: `apps/dashboard/components/tenant-create-wizard.tsx` -> `onProvision()`  
- Calls parent `provision()` in `apps/dashboard/app/(dashboard)/tenants/page.tsx`.

2) Dashboard sends create request  
- `fetch("/api/tenants", { method: "POST", body: ... })` in `tenants/page.tsx`.
- Dashboard API proxy `apps/dashboard/app/api/tenants/route.ts` forwards to platform API via `apiFetch("/tenants")`.

3) API request enters platform route  
- Entry point: `app.post("/tenants", ...)` in `apps/api/src/index.ts`.
- Validation:
  - Zod body parse (`provisionBody`).
  - Owner existence check in `owners`.
  - Slug existence check in `tenants`.
- Writes:
  - Generates `correlationId`.
  - Writes initial trace event (`createProvisionTracer(...).event("api", ...)`) into `tenant_provision_events`.
  - Inserts queue job via `insertTenantJob(...)` into `tenant_lifecycle_jobs`:
    - `type = "tenant.provision"`
    - `status = "pending"`
    - `correlationId = generated UUID`
    - payload includes slug/name/owner/admin fields.
- Returns HTTP 202 with `correlationId`, poll path, stream path.

4) Frontend begins dual observation channels  
- In `tenants/page.tsx`:
  - Sets `streamCorrelationId`.
  - Opens `EventSource("/api/tenants/provision-stream/:correlationId")`.
  - Starts polling `GET /api/tenants/provision-status/:correlationId` every 2s (`POLL_MS`).

5) Worker polling loop attempts claim  
- Worker loop: `loop()` in `infra/worker-service/src/worker.ts`.
- Calls API internal route `POST /internal/jobs/claim` with `workerId`.
- Claim logic (`apps/api/src/index.ts`):
  - Requeues stale running jobs (`running` older than 5 min lease) to `pending`.
  - Selects one eligible `pending` job with `runAt <= now` and attempts `< maxAttempts`.
  - Atomically updates selected row `pending -> running`, sets `claimedAt`, `claimedBy`.

6) Worker dispatches by job type  
- In `worker.ts`, for `tenant.provision`:
  - Executes `runProvisionJob(db, job)`.
  - Parses payload with `provisionPayloadSchema`.
  - Installs cancellation guard `assertProvisionNotCancelled(job.id)`.
  - Calls `provisionTenant(...)` in `infra/worker-service/domain/provisioner.ts`.
  - Which delegates to `executeProvisionRuntime(...)`.

7) Provision runtime bootstraps control-plane rows  
- `executeProvisionRuntime` in `infra/worker-service/src/provision-runtime.ts`.
- Initializes tracer for same `correlationId`.
- Loads prior journal events for resume semantics (`loadProvisionJournal`).
- Creates secrets and one-time admin password in memory.
- Verifies slug uniqueness again (`tenants` select).
- Transaction:
  - Allocates host port via `allocateTenantPort`.
  - Inserts `tenants` row with `status = "provisioning"`.
  - Inserts `tenant_deployments` row with `status = "provisioning"`, compose project name, internal port, encrypted secrets.

8) Runtime writes tenant env and executes compose phases  
- Writes `.env` atomically under tenant env root (`writeTenantEnvFileAtomic`).
- Creates compose context and marks `sideEffectsStarted = true`.
- Executes in sequence (unless already journaled):
  - Data services: `docker compose up -d mysql mongo redis`
  - Migration: `docker compose run --rm database_migration`
  - App service: `docker compose up -d server`
- Journals each completed step into `tenant_provision_events` phase `journal`.

9) Runtime readiness and bootstrap  
- Resolves internal URL (`docker compose port server 3000`, fallback host+port).
- Waits for tenant service health:
  - `GET {internalUrl}/api/ping/` loop, 5s per call timeout, poll 2s, deadline 180s.
- Registers bootstrap admin:
  - `POST {internalUrl}/api/auth/register` with first/last/email/password.
- Journals each step if successful.

10) Runtime edge publish step  
- Calls `edge.publish(slug, port, rootDomain)` -> writes Traefik dynamic config file.
- Current implementation catches publish error and suppresses it:
  - `await edge.publish(...).catch(() => undefined)`
- Still journals operation as completed.

11) Worker reports completion to API  
- On success returns `oneTimeAdminPassword` to worker loop.
- Worker calls `POST /internal/jobs/:id/complete` with `workerId` and one-time password.
- API completion route:
  - Verifies claim ownership if present.
  - Updates `tenant_lifecycle_jobs.status` from `running -> completed`.
  - Clears claim fields.
  - Stores one-time password in API memory map `provisionPasswordCache` (15 min TTL), keyed by `correlationId`.
- Note: tenant/deployment success-state convergence is not explicitly updated here for `tenant.provision`.

12) Frontend detects completion and updates UI  
- Poll endpoint `GET /tenants/provision-status/:correlationId` returns `status = "complete"` when last job is `completed`.
- Response includes:
  - event-derived metadata (`tenantId`, `deploymentId`, `composeProjectName`, `internalPort`, `baseUrl`)
  - one-time password from in-memory cache (or null if missing/expired/restarted process).
- Frontend sets:
  - `oneTimePassword`
  - `tenantAccess.publicUrl`
  - loading false
- UI presents "Open login" link; no automatic redirect.

---

## 2. State Evolution Map

### Legend
- Job state: `tenant_lifecycle_jobs.status`
- Tenant state: `tenants.status`
- Deployment state: `tenant_deployments.status`
- UI state: local frontend state in `tenants/page.tsx`

| Phase | Job state | Tenant state | Deployment state | UI state |
|---|---|---|---|---|
| Before submit | none | none | none | idle |
| After API accept | pending | none (not inserted yet) | none | loading + stream open + polling |
| After worker claim | running | none/unknown yet | none/unknown yet | loading |
| After DB bootstrap txn | running | provisioning | provisioning | loading + live events |
| During compose/health/bootstrap | running | provisioning | provisioning | loading |
| After worker complete call | completed | provisioning (unchanged in this path) | provisioning (unchanged in this path) | polling sees complete soon |
| After status endpoint complete | completed | may still read provisioning | may still read provisioning | complete panel shown |

### A/B/C explicit

#### A) Where system THINKS it is (job/status layer)
- Queue control-plane thinks provisioning is done when `tenant_lifecycle_jobs.status = completed`.
- Status API maps that directly to `status = "complete"` for UI.

#### B) Where system is ACTUALLY in reality (infra + side effects)
- Real readiness depends on:
  - docker services running and stable
  - migration applied
  - app reachable
  - bootstrap admin registered
  - edge routing published
- Some of these are checked during runtime, but not all are verified at final completion boundary.

#### C) Where they diverge
- Completion is decided by successful worker function return + complete API write, not by a final end-to-end externally verifiable usability check at completion boundary.
- Tenant/deployment persisted statuses may remain `provisioning` while job/UI report `complete`.

---

## 3. Divergence Points (CRITICAL)

1) **Completion boundary mismatch**  
- Boundary: Worker/API queue completion vs tenant/deployment persisted lifecycle.
- Code path:
  - Queue completion set in `POST /internal/jobs/:jobId/complete`.
  - No tenant/deployment `active` transition for `tenant.provision` in same path.
- Divergence:
  - Job/UI can be complete while tenant/deployment rows still show provisioning.

2) **Edge publish verification gap**  
- Boundary: Runtime side effect vs success reporting.
- Code path:
  - `executeProvisionRuntime`: `edge.publish(...).catch(() => undefined)` then journal success.
- Divergence:
  - Route publish can fail silently yet flow still reaches `completed`.

3) **Memory-only credential correctness dependency**  
- Boundary: API memory vs persisted state.
- Code path:
  - Password stored only in `provisionPasswordCache` map, TTL 15 min.
- Divergence:
  - Job complete may be true but one-time password absent due to restart/expiry/multi-instance mismatch.

4) **Dual-observer UX divergence (SSE vs poll)**  
- Boundary: frontend event channel vs status channel.
- Code path:
  - SSE may close on error; polling continues.
- Divergence:
  - User may see sparse/no live steps while backend progresses or completes.

---

## 4. Stuck Scenarios

1) **Worker cannot advance claim loop due to internal API failures**  
- Location: `claimNextJob()` / internal `/claim`.
- Behavior:
  - Worker logs claim error and retries after poll interval.
  - Jobs remain pending.

2) **Job stuck in running due to long/hung compose step**  
- Location: compose runner `ExecaDockerComposeRunner.run` used by data/migration/app steps.
- Behavior:
  - No explicit timeout in these steps.
  - Worker may block inside compose command, leaving job `running`.

3) **Stale running lease until lease reset window**  
- Location: `/internal/jobs/claim` stale reset logic.
- Behavior:
  - If worker dies after claim, job can remain `running` until stale threshold (5 min) then reset to `pending`.

4) **UI appears stuck despite backend progress issues**  
- Location: frontend poll loop deadline 45 minutes.
- Behavior:
  - UI keeps loading while status remains queued/running.
  - Eventually generic timeout error, not step-precise cause.

5) **Unknown/expired status lookup path**  
- Location: `/tenants/provision-status/:correlationId`.
- Behavior:
  - If no job and no events (or expired context), endpoint returns 404 unknown/expired.
  - User experiences "lost" provisioning reference.

---

## 5. Silent Failure Points

1) **Edge publish error swallowed**  
- `executeProvisionRuntime`: `edge.publish(...).catch(() => undefined)`
- Failure is not propagated to terminal job failure.

2) **Metric emission failures swallowed**  
- API/worker metrics emitters call `.catch(() => undefined)`.
- Not correctness-critical, but observability loss is silent.

3) **Best-effort cleanup errors tolerated**  
- On catch path, rollback and trace writes are wrapped with catch-ignore in several places.
- Failure details may be partially lost while terminal status still resolves.

4) **Password retrieval can silently degrade to null**  
- Status endpoint returns `oneTimeAdminPassword: null` when cache missing/expired.
- No persisted fallback exists in current flow.

---

## 6. Failure Handling Trace (try/catch and retry)

### Worker loop-level
- `claimNextJob().catch(...)` -> logs, returns null, loop continues.
- Job execution try/catch:
  - success -> `/complete`
  - failure -> computes `noRetry` and calls `/fail`
  - if `/fail` reporting itself fails, logs reporter error.

### API fail route
- `/internal/jobs/:jobId/fail`:
  - increments attempts
  - schedules retry (`status=pending`, `runAt=now+backoff`) unless exhausted/noRetry
  - exhausted/noRetry -> `status=dead`

### Runtime-level catch
- `executeProvisionRuntime` catch:
  - marks tenant/deployment failed (if IDs exist)
  - attempts compose rollback (best effort)
  - may delete tenant rows if rollback succeeded
  - writes failed trace event
  - returns `{ ok:false }` to worker.

---

## 7. Completion Logic Audit

### Where `completed` is set
- API route: `POST /internal/jobs/:jobId/complete` in `apps/api/src/index.ts`.
- Triggered when worker runtime returns success and worker calls complete endpoint.

### Conditions checked before setting completed
- Job exists.
- Claim ownership check (`claimedBy`) if workerId provided.
- Current job status must be `running`.

### What is NOT checked at completion boundary
- No final verification that published edge route is reachable.
- No final verification that persisted tenant/deployment states transitioned to an explicit "ready/active" state in this path.
- No durability check for one-time password beyond in-memory cache.

---

## 8. UI Observation Logic (SSE + Poll)

### SSE behavior
- Endpoint: `/tenants/provision-stream/:correlationId`.
- Server implementation polls DB every 1.5s and emits unsent events.
- Frontend appends streamed events to log.
- On `EventSource` error, stream closes; frontend does not auto-reopen in same effect cycle.

### Poll behavior
- Endpoint: `/tenants/provision-status/:correlationId`.
- Frontend polls every 2s until:
  - `failed` -> error
  - `complete` -> success UI
  - timeout at 45m -> timeout error

### Frontend “complete” decision
- Strictly based on status endpoint `status === "complete"`.
- Not based on direct docker/network checks from browser.

---

## 9. Final Root Cause Summary (Current Behavior)

Provisioning incorrect-state reports and stuck perceptions emerge from boundary mismatches, not a single point:

1) **Queue completion is authoritative for UI complete**, but does not guarantee all real-world side effects are verifiably usable at that boundary.  
- Files: `apps/api/src/index.ts` (`/internal/jobs/:id/complete`, `/tenants/provision-status/:id`), `infra/worker-service/src/provision-runtime.ts`.

2) **At least one critical side effect can fail without failing the job** (edge publish suppression).  
- File: `infra/worker-service/src/provision-runtime.ts`.

3) **State planes are not fully converged at completion** (job vs tenant/deployment persisted status).  
- Files: `infra/worker-service/src/provision-runtime.ts`, `apps/api/src/index.ts`.

4) **Operator-visible credential correctness depends on memory-only cache**.  
- File: `apps/api/src/index.ts` (`provisionPasswordCache` and status endpoint behavior).

5) **Stuck runtime can occur in long-running external steps while job remains running**; UI will keep polling until timeout.  
- Files: `infra/worker-service/domain/provisioning/adapters/execa-docker-compose-runner.ts`, `apps/dashboard/app/(dashboard)/tenants/page.tsx`.

This is the true runtime behavior for the traced flow under current code.

