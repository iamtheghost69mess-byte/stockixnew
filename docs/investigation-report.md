# Tenant Deletion & Notification Stream — Production Audit Report

**Date:** 2026-06-07  
**Scope:** End-to-end tenant deletion lifecycle, notification SSE pipeline, observed log correlation  
**Method:** Static code trace + terminal log correlation (no assumptions beyond evidence)

---

## Executive Summary

| Question | Answer | Confidence |
|----------|--------|------------|
| Did tenant **user-initiated delete** fail in the observed logs? | **No direct evidence.** The `MongoDB database "dajo_pos" dropped` line is from **provision rollback**, not `DELETE /tenants`. | High |
| Did notification streaming fail? | **Yes.** `GET /api/notifications/stream` returned **500** with `ECONNRESET` / `failed to pipe response`. | High |
| Are delete and SSE failure causally linked? | **No.** They are **temporally correlated** via a third event: **`Restarting 'src/index.ts'`** (API dev watcher restart). | High |

**Primary root cause of the observed SSE 500:** The control-plane API process restarted while the dashboard held an open upstream SSE connection. The TCP connection reset (`ECONNRESET`) propagated through Next.js response piping and surfaced as HTTP 500.

**Secondary context:** The same log window shows a **failed tenant provision** (`organization_build_job_failed`), whose rollback path invokes the same `deprovisionTenantDatabases()` routine used during formal deprovision — explaining the Mongo drop line without implying a successful user delete.

---

## 1. Tenant Deletion Lifecycle Audit

### 1.1 Naming note

There is **no function named `deleteTenant()`** in this repository. User-initiated deletion is implemented as:

| Layer | Entry point |
|-------|-------------|
| Dashboard UI | `executeTenantDelete()` / `runTenantDelete()` |
| Dashboard BFF | `DELETE` handler in `apps/dashboard/app/api/tenants/[tenantId]/route.ts` |
| Control-plane API | `app.delete("/tenants/:tenantId")` in `apps/api/src/routes/tenants.ts` |
| Worker | `runDeprovisionJob()` → `deprovisionTenant()` |

Formal deprovision logic lives in `infra/worker-service/domain/provisioner.ts` as `deprovisionTenant()`.

---

### 1.2 User-initiated delete — full call graph

```
Dashboard UI
  tenants-page-content.tsx :: executeTenantDelete(tenantId, slug, wipeVolumes)
    └─ fetch DELETE /api/tenants/{id}?volumes=true|false          [awaited]

  tenant-danger-zone.tsx :: runTenantDelete(wipeVolumes)
    └─ fetch DELETE /api/tenants/{id}?volumes=...                 [awaited]

Dashboard BFF
  apps/dashboard/app/api/tenants/[tenantId]/route.ts :: DELETE
    └─ apiFetch(/tenants/{id}, DELETE, LIFECYCLE_TIMEOUT_MS=30s)  [awaited]
    └─ on connection error → 503 JSON                            [handled]

Control-plane API (fast path — must not run Docker)
  apps/api/src/routes/tenants.ts :: app.delete("/tenants/:tenantId")
    ├─ tenantWithinOwnerScope()                                   [awaited]
    ├─ SELECT tenant + deployment                                 [awaited]
    ├─ FOR each child org:
    │    ├─ UPDATE tenantLifecycleJobs (cancel provision)         [awaited]
    │    ├─ insertTenantJob(type: tenant.deprovision, child)      [awaited]
    │    └─ UPDATE organizations → suspended                      [awaited]
    ├─ UPDATE tenantLifecycleJobs (cancel parent provision)       [awaited]
    ├─ insertTenantJob(type: tenant.deprovision, parent)          [awaited]
    ├─ logAudit(action: tenant.delete)                            [awaited]
    └─ return 202 JSON { accepted, jobId }                      [sync response]

Worker (slow path — Docker + data plane + Postgres)
  infra/worker-service/src/worker.ts
    claimNextJob() → handlers["tenant.deprovision"] = runDeprovisionJob
      ├─ assertNoConcurrentTenantLifecycleJob()                   [awaited]
      └─ withTenantLifecycleAdvisoryLock(() =>
           deprovisionTenant(db, tenantId, { removeVolumes, log }))

  infra/worker-service/domain/provisioner.ts :: deprovisionTenant()
    ├─ SELECT tenant slug + compose project                       [awaited]
    ├─ [DOCKER] compose down finance stack                        [awaited, 2min timeout]
    ├─ [DOCKER] compose down POS stack                            [awaited, non-fatal catch]
    ├─ [DOCKER] compose down PMS stack                            [awaited, non-fatal catch]
    ├─ deprovisionTenantDatabases(slug)                         [awaited]
    │    ├─ MySQL DROP DATABASE(s) + DROP USER                    [awaited]
    │    ├─ Mongo mongosh dropDatabase via docker exec            [awaited]
    │    └─ flushTenantRedisKeys(slug) via redis-cli EVAL         [awaited]
    ├─ edgePublisher.unpublish(slug)                              [awaited, non-fatal catch]
    ├─ removePosTraefikConfig(slug)                               [awaited, non-fatal catch]
    ├─ GATE: require mysqlDbs && mongoDb && redisKeys             [throws if incomplete]
    ├─ rm tenant env dir                                          [awaited, non-fatal catch]
    └─ DELETE postgres rows (events, audit, deployment, tenant)   [awaited]

  Worker reports completion
    markJobComplete(job.id) → POST /internal/jobs/:id/complete    [awaited]
      └─ if type === tenant.deprovision:
           purgeProvisionCaches + DELETE tenantLifecycleJobs       [awaited]

Notification publishing on delete
  └─ **None.** No `createNotification` / `publishOwnerNotification` on tenant.deprovision success.
     Notifications fire on provision outcomes via `notifyProvisionOutcome()` only.
```

---

### 1.3 Provision rollback path (relevant to observed logs)

When provision fails, rollback may call the **same DB cleanup** without going through user delete:

```
provision-runtime.ts :: rollbackProvisionFailure()
  ├─ composeDownBestEffort / docker compose down -v              [awaited]
  └─ IF journalState.completedOps.has("docker.data_step"):
       deprovisionTenantDatabases(rollbackSlug, log)              [awaited, try/catch]
```

**Observed log evidence** (terminal `7.txt`):

```
[rollback] compose cleanup completed project=stockix-dajo
[db-deprovision] dropping MySQL databases for tenant "dajo"
[db-deprovision] MongoDB database "dajo_pos" dropped
[rollback] shared DB teardown completed for slug=dajo
[rollback] ... reason=organization_build_job_failed: getProvider(...).apply is not a function
```

This sequence is **`rollbackProvisionFailure`**, not `DELETE /tenants`.

---

### 1.4 Execution order summary (user delete)

| Phase | Where | Blocking? | Duration |
|-------|-------|-----------|----------|
| 1. HTTP accept | API `DELETE /tenants/:id` | Awaited by client | Sub-second (DB only) |
| 2. Job enqueue | `insertTenantJob(tenant.deprovision)` | Awaited by API | Sub-second |
| 3. Worker claim | `claimNextJob` poll loop | Async | Poll interval |
| 4. Docker teardown | `deprovisionTenant` compose down | Awaited by worker | Up to ~6 min (3 stacks × 2 min) |
| 5. Shared DB cleanup | `deprovisionTenantDatabases` | Awaited by worker | Seconds–minutes |
| 6. Postgres delete | `deprovisionTenant` final DELETEs | Awaited by worker | Sub-second |
| 7. Job complete | `POST /internal/jobs/:id/complete` | Awaited by worker | Network-bound |

---

### 1.5 Async / fire-and-forget operations

| Operation | Location | Type | Risk |
|-----------|----------|------|------|
| `void publishOwnerNotification(...)` | `notification-service.ts:68` | Fire-and-forget | Low — provision notifications only |
| `void emitIfNew(notification)` | `notifications.ts:157` | Fire-and-forget | **Medium** — unhandled rejection if SSE closed |
| `notifyProvisionOutcome()` outer IIFE | `notification-helpers.ts:70` | Fire-and-forget | Low — errors logged |
| Worker heartbeat loop | `worker.ts` | Background interval | Medium — 409 if job already terminal |
| API `node --watch` restart | `scripts/dev-api.mjs` | Process restart | **High in dev** — drops all SSE connections |
| Provision NOTIFY listener | `provision-notify-listener.ts` | Background | Independent of delete |

---

### 1.6 Race conditions identified

| ID | Race | Parties | Severity |
|----|------|---------|----------|
| R1 | API dev watcher restart vs open SSE upstream connections | `dev-api.mjs` + dashboard stream proxy | **Critical (dev)** |
| R2 | Worker rollback DB cleanup vs API restart vs worker `markJobFailure` | worker + API | **High** — log shows `failed to report failure: fetch failed` |
| R3 | Heartbeat 409 while job transitioning to dead | worker heartbeat + job state | Medium — log: `heartbeat failed: heartbeat_failed:409` |
| R4 | Double SSE abort handlers (`stream.onAbort` + `req.signal`) | `notifications.ts` | Low — mitigated by idempotent Redis cleanup |
| R5 | Dashboard optimistically removes tenant from list on 202 before worker finishes | `tenants-page-content.tsx:186` | Medium — UI/DB drift until worker completes |
| R6 | Child org deprovision jobs + parent deprovision without ordering guarantee | `tenants.ts` DELETE loop | Medium — concurrent worker jobs on related stacks |
| R7 | `deprovisionTenant` compose down failure swallowed; DB cleanup proceeds | `provisioner.ts:590-592` | **High** — see §4 |

---

## 2. Notification Stream Audit

### 2.1 Architecture (three hops)

```
Browser EventSource("/api/notifications/stream")
  → Next.js Route Handler (dashboard BFF)
    → apiFetch GET /notifications/stream (control-plane API)
      → Hono streamSSE (Redis pub/sub or DB poll fallback)
```

---

### 2.2 API layer — `GET /notifications/stream`

**File:** `apps/api/src/routes/notifications.ts`

| Concern | Implementation |
|---------|----------------|
| SSE framework | Hono `streamSSE(c, async (stream) => { ... })` |
| Client disconnect | `stream.onAbort(() => { closed = true })` |
| Redis path | `subscribeOwnerNotifications(ownerId, onMessage, onError)` |
| Cleanup | Idempotent `cleanup()` → `unsubscribe()` once |
| Abort signal | **Also** `c.req.raw.signal.addEventListener("abort", ...)` — duplicate of onAbort |
| Keep-alive | `maybePing()` every `NOTIFICATION_STREAM_PING_MS` (30s) |
| Fallback | DB poll loop if Redis unavailable |

**Redis pub/sub —** `apps/api/src/lib/notification-pubsub.ts`:

| Concern | Implementation |
|---------|----------------|
| Subscribe | `client.duplicate()` → `connect()` → `subscribe(channel)` |
| Unsubscribe | `releaseOwnerNotificationSubscriber()` — guards `end`/`close`, try/catch, `disconnect()` |
| Publish | `publishOwnerNotification()` — try/catch, no throw |

**Not used:** `TransformStream` anywhere in notification pipeline.

---

### 2.3 Dashboard BFF layer

**File:** `apps/dashboard/app/api/notifications/stream/route.ts`

| Concern | Implementation |
|---------|----------------|
| Upstream fetch | `apiFetch("/notifications/stream", { signal: req.signal }, req)` — uses **client** AbortSignal, not 3s dev timeout |
| Proxy | `proxyControlPlaneEventStream(res, req)` |
| Initial failure | try/catch → **503** (not 500) |
| ReadableStream | Custom pump loop in `api-client.ts:94-118` |
| TransformStream | **Not used** |
| Client abort | `req.signal` → `reader.cancel()` |

**File:** `apps/dashboard/lib/api-client.ts :: proxyControlPlaneEventStream`

```typescript
// Pump reads upstream; catch closes controller without rethrow
reader.read() → controller.enqueue(value)
catch → controller.close()  // ECONNRESET absorbed here
```

**Important:** The observed log error `Error: failed to pipe response` is the Next.js internal message when **`return new Response(upstream.body)`** pipes directly. That pattern existed **before** `proxyControlPlaneEventStream` was added. If the log was captured **after** deploying the pump-based proxy but **before** restarting the dashboard dev server, the old behavior would still appear.

---

### 2.4 Client layer

**File:** `apps/dashboard/components/notification-bell.tsx`

| Concern | Implementation |
|---------|----------------|
| EventSource | `new EventSource("/api/notifications/stream")` |
| Reconnect | `es.onerror` → close → `setTimeout(connectSSE, 5000)` |
| Cleanup on unmount | `esRef.current?.close()` |
| Tenant delete handling | **None** — stream is owner-scoped, not tenant-scoped |

---

### 2.5 Verification checklist

| Check | Status | Notes |
|-------|--------|-------|
| `request.signal` listeners | ✅ BFF proxy cancels upstream reader | `api-client.ts:121-127` |
| Response close listeners | ⚠️ Partial | API relies on Hono `onAbort`; no explicit `response.close` listener |
| Stream cancellation | ✅ BFF `cancel()` → `reader.cancel()` | |
| Redis pub/sub cleanup | ✅ Idempotent `releaseOwnerNotificationSubscriber` | Fixed from prior double `quit()` issue |
| Subscription cleanup once | ✅ `cleanedUp` flag in API route | |
| Writing to closed stream | ⚠️ **Risk remains** | `void emitIfNew(...)` — no guard on `closed` before `writeSSE` |
| Dangling intervals | ✅ None — uses `while (!closed)` + `setTimeout` in loop | Clears when `closed` |
| Dangling subscriptions | ✅ Cleanup on abort + loop exit | |
| Unhandled promise rejections | ⚠️ **Possible** | `emitIfNew` after disconnect; Redis connect/subscribe `.catch` routes to onError only |
| Uncaught ECONNRESET | ⚠️ BFF mitigated; **API process unaffected** | ECONNRESET is on dashboard→API fetch leg |

---

## 3. Root Cause Analysis

### 3.1 Question A — Is tenant deletion actually failing?

**For the specific observed log window: No evidence of a failed user delete causing the Mongo line.**

Evidence chain:

1. Log shows `[build] organization build job failed` and `[rollback]` prefix before `[db-deprovision]`.
2. Rollback reason explicitly states `organization_build_job_failed` — provision failure, not delete.
3. `deprovisionTenant()` for user delete would log `[deprovision]` prefix, not `[rollback]`.
4. A separate line shows `DELETE ... 503` **after** `Restarting 'src/index.ts'` — API was down; delete request **did not reach** job enqueue (503 returned by BFF).

**User delete path today (post-refactor):** API returns **202** quickly; worker performs cleanup. Delete does **not** synchronously drop Mongo in the API process.

---

### 3.2 Question B — Is notification streaming failing after successful deletion?

**Partially mis-framed.** In the observed logs, SSE failed **during provision rollback + API restart**, not after a successful user delete.

Evidence:

```
Restarting 'src/index.ts'                    ← API process killed (node --watch)
[dash] Error: failed to pipe response
  [cause]: TypeError: terminated
    [cause]: Error: read ECONNRESET         ← upstream TCP reset
GET /api/notifications/stream 500 in 2.7min
...
api listening                              ← API back ~8s later
GET /api/notifications/stream status=200   ← new connection succeeds
```

**Causal chain (evidence-based):**

1. Long-lived SSE connection open from dashboard → API.
2. API dev watcher restarts process (`scripts/dev-api.mjs` uses `node --watch --watch-path=src`).
3. In-flight TCP connection reset → `ECONNRESET`.
4. Dashboard route handler error propagates → HTTP **500** (pre-pump-proxy) or hung connection (2.7 min until reset).

**Conclusion:** Notification streaming failure is **infrastructure/lifecycle** (API restart), **not** tenant deletion logic.

---

## 4. Production Reliability Audit — Partial Success States

### 4.1 User delete via `deprovisionTenant()` (worker)

| Inconsistent state | Possible? | Mechanism |
|--------------------|-----------|-----------|
| Postgres deleted, Docker still running | **Blocked** | `dataPlaneClean` gate throws before Postgres DELETE |
| Docker removed, Postgres remains | **Yes** | Compose down fails (`catch` at line 590 sets `dockerStatus=skipped`); if data plane succeeds, gate passes but containers may remain if down failed silently |
| MySQL remains | **Yes (transient)** | Job retries (`maxAttempts: 5`); Postgres not deleted until gate passes |
| Mongo remains | **Yes (transient)** | Same gate; mongo container missing → `mongoDb=false` → job fails |
| Redis keys remain | **Yes (transient)** | `flushTenantRedisKeys` returns false if redis container not found |
| Traefik routes remain | **Yes** | Unpublish failures are non-fatal; Postgres can still be deleted if data plane gate passes |
| Tenant env dir remains | **Yes** | Non-fatal catch; Postgres can still be deleted |
| POS/PMS stacks remain | **Yes** | Non-fatal catches; finance compose may be down while POS still up |
| UI shows deleted, DB row exists | **Yes** | Dashboard removes from list on HTTP 202 before worker completes |
| Job marked dead, resources orphaned | **Yes** | After exhausted retries with partial cleanup |

### 4.2 Provision rollback via `deprovisionTenantDatabases()` (no gate)

| Inconsistent state | Possible? | Mechanism |
|--------------------|-----------|-----------|
| MySQL dropped, Mongo not | **Yes** | Each store cleaned independently; errors logged, not thrown (except missing root password) |
| Mongo dropped, MySQL not | **Yes** | Observed log shows MySQL + Mongo both attempted; partial success logged per store |
| Redis partial | **Yes** | Best-effort flush |
| Postgres tenant row remains | **Expected** | Rollback does not delete control-plane tenant row (provision failed state) |

### 4.3 API `scrubTenantRuntimeArtifacts()` (still used on POST `/tenants` slug recovery)

**File:** `apps/api/src/routes/tenants.ts:1002, 1026`

Runs **synchronous Docker** in API process during slug recovery — **production risk** unrelated to DELETE but can cause API stalls identical to historical delete bug.

---

## 5. SSE Production Best Practices — Gap Analysis

| Scenario | Required behavior | Current behavior | Gap |
|----------|-------------------|------------------|-----|
| Client disconnect | Close upstream, no 500 | BFF cancels reader; API sets `closed` | ✅ |
| Browser refresh | Old stream dies cleanly | AbortSignal fires | ✅ |
| Dashboard navigation | unmount closes EventSource | `useEffect` cleanup | ✅ |
| Worker restarts | N/A to SSE directly | Independent | ✅ |
| **API / control-plane restart** | Graceful stream end or 503 | ECONNRESET → **500** (observed) | **❌ Critical** |
| Redis reconnect | Resume or fall back to poll | New SSE connection required | ⚠️ Acceptable |
| Tenant deletion events | No special handling needed | Owner-scoped stream | ✅ N/A |
| Must never 500 on client disconnect alone | 204/503/close | EventSource reconnect handles | ⚠️ Upstream reset still logged as 500 in observed run |

**Production requirement violated in observed logs:** SSE endpoint returned **500** due to **upstream** disconnect (API restart), not client disconnect. BFF pump proxy reduces but may not eliminate Next.js framework-level pipe errors if deployed code/version differs.

---

## 6. Error Handling Repository Search

### 6.1 `ECONNRESET`

| Location | Context |
|----------|---------|
| `apps/dashboard/lib/api-client.ts:81` | Comment only — documents pump rationale |
| `apps/dashboard/lib/api-connection.ts` | `isApiConnectionError` — treats fetch failures, not stream read resets inside open connection |

**No explicit `ECONNRESET` handler** in API or worker code.

### 6.2 `failed to pipe response`

**Not present in repository source.** Origin: **Next.js runtime** when proxying `Response.body` stream.

### 6.3 `ReadableStream`

| File | Usage |
|------|-------|
| `apps/dashboard/lib/api-client.ts` | `proxyControlPlaneEventStream` pump |

### 6.4 `TransformStream`

**No matches** in `apps/` or `infra/worker-service/`.

### 6.5 `EventSource`

| File | Usage |
|------|-------|
| `apps/dashboard/components/notification-bell.tsx` | Notification SSE client |
| `apps/dashboard/app/(dashboard)/tenants/_components/tenants-page-content.tsx` | Provision progress SSE |

### 6.6 SSE / stream routes

| Route | File | Proxy pattern |
|-------|------|---------------|
| `/api/notifications/stream` | `apps/dashboard/app/api/notifications/stream/route.ts` | `proxyControlPlaneEventStream` |
| `/api/tenants/provision-stream/[correlationId]` | `apps/dashboard/app/api/tenants/provision-stream/[correlationId]/route.ts` | Same |
| API `/notifications/stream` | `apps/api/src/routes/notifications.ts` | Hono `streamSSE` |
| API `/tenants/provision-stream/:correlationId` | `apps/api/src/routes/tenants.ts` | Hono `streamSSE` + in-memory bus |

### 6.7 Stream errors that can escape to HTTP 500

| Location | Escape path | Severity |
|----------|-------------|----------|
| Dashboard BFF (legacy direct `Response(body)`) | Next.js pipe → 500 | Critical — observed |
| Dashboard BFF (pump proxy) | Should close quietly; framework may still log | Medium — needs verification |
| API `emitIfNew` after abort | Unhandled `writeSSE` rejection → `unhandledRejection` logged | Medium |
| API `unhandledRejection` handler | Logs only; **does not exit** (`index.ts:22-29`) | Low for crash; noise in logs |

---

## 7. Issues, Fixes Required, Severity

| ID | Issue | Evidence | Files | Fix required | Severity |
|----|-------|----------|-------|--------------|----------|
| **I1** | SSE 500 on API restart (ECONNRESET) | Terminal log lines 99–113; `failed to pipe response` | `apps/dashboard/app/api/notifications/stream/route.ts`, `api-client.ts` | Ensure pump proxy deployed; return **503** with `text/event-stream` close on upstream error; add integration test simulating upstream abort | **Critical** |
| **I2** | API dev watcher restarts drop all connections | `Restarting 'src/index.ts'` in log; `scripts/dev-api.mjs:73` | `scripts/dev-api.mjs` | Prod: no `--watch`. Dev: document or use stable API process for SSE testing | **High (dev)** / Low (prod) |
| **I3** | Observed Mongo drop misattributed to delete | `[rollback]` + `organization_build_job_failed` in log | `provision-runtime.ts` rollback | UX/docs: distinguish rollback vs deprovision in logs (`[deprovision]` vs `[rollback]`) | Medium |
| **I4** | `emitIfNew` fire-and-forget without `closed` guard | `notifications.ts:157` | `apps/api/src/routes/notifications.ts` | Check `closed` before `writeSSE`; attach `.catch()` | Medium |
| **I5** | Compose down failure swallowed; data plane may proceed | `provisioner.ts:590-592` | `provisioner.ts` | Fail job if finance compose down fails when env exists | **High** |
| **I6** | Dashboard optimistic tenant removal on 202 | `tenants-page-content.tsx:186` | Dashboard | Poll job status or show "removing" badge until worker completes | Medium |
| **I7** | Delete during API outage returns 503; job not enqueued | Log: `DELETE ... 503` after restart | BFF DELETE route | Client retry with idempotency; show "API unavailable, retry" | Medium |
| **I8** | Worker failure report lost during API restart | `failed to report failure: fetch failed` | `worker.ts:932-934` | Worker DB fallback already exists; ensure job reaches `dead` via fallback persist | Medium |
| **I9** | No delete-completion notification | No `createNotification` on deprovision | API/worker | Optional `tenant.deleted` notification type | Low |
| **I10** | `scrubTenantRuntimeArtifacts` still sync in API on POST `/tenants` | `tenants.ts:1002, 1026` | API | Queue cleanup to worker (same pattern as DELETE fix) | **High** |
| **I11** | Provision stream BFF lacks try/catch on initial fetch | `provision-stream/.../route.ts` | Dashboard | Wrap in try/catch → 503 (notifications route has this) | Medium |
| **I12** | Heartbeat 409 during terminal job transition | Log line 72–75 | worker + internal heartbeat | Expected race; downgrade log level or ignore 409 when job dead | Low |

---

## 8. Answers to Original Questions (Direct)

### Is tenant deletion actually failing?

**In the cited logs: No.** The MongoDB drop is **provision rollback cleanup** after org build failure. Any user `DELETE` in the same window hit **503** because the API was restarting — deletion was **not accepted**, not failed mid-deprovision.

### Is notification streaming failing?

**Yes.** Independently of delete success. Caused by **API process restart** resetting the upstream SSE TCP connection.

---

## 9. Recommended Fix Priority (investigation only — not implemented)

1. **P0:** Harden dashboard SSE proxy — never surface 500 on upstream reset; verify in running dashboard build.
2. **P0:** Production deploy API **without** `node --watch`.
3. **P1:** Guard `emitIfNew` / `writeSSE` with `closed` flag + catch.
4. **P1:** Tighten `deprovisionTenant` compose-down error handling (do not proceed to Postgres gate if finance stack still declared running).
5. **P2:** Remove `scrubTenantRuntimeArtifacts` from API hot paths.
6. **P2:** Dashboard delete UX — treat 202 as "queued", not "gone".

---

## Appendix A — Function Index

| Function | File |
|----------|------|
| `executeTenantDelete` | `apps/dashboard/.../tenants-page-content.tsx` |
| `runTenantDelete` | `apps/dashboard/.../tenant-danger-zone.tsx` |
| `apiFetch` | `apps/dashboard/lib/api-client.ts` |
| `proxyControlPlaneEventStream` | `apps/dashboard/lib/api-client.ts` |
| `app.delete("/tenants/:tenantId")` | `apps/api/src/routes/tenants.ts` |
| `insertTenantJob` | `apps/api/src/services/tenant-jobs.ts` |
| `runDeprovisionJob` | `infra/worker-service/src/worker.ts` |
| `deprovisionTenant` | `infra/worker-service/domain/provisioner.ts` |
| `deprovisionTenantDatabases` | `infra/worker-service/domain/provisioner.ts` |
| `flushTenantRedisKeys` | `infra/worker-service/domain/provisioner.ts` |
| `rollbackProvisionFailure` | `infra/worker-service/src/provision-runtime.ts` |
| `scrubTenantRuntimeArtifacts` | `apps/api/src/routes/tenants.ts` |
| `streamSSE` notification handler | `apps/api/src/routes/notifications.ts` |
| `subscribeOwnerNotifications` | `apps/api/src/lib/notification-pubsub.ts` |
| `publishOwnerNotification` | `apps/api/src/lib/notification-pubsub.ts` |
| `createNotification` | `apps/api/src/notification-service.ts` |
| `notifyProvisionOutcome` | `apps/api/src/notification-helpers.ts` |
| `connectSSE` | `apps/dashboard/components/notification-bell.tsx` |

---

## Appendix B — Log Timeline Reconstruction (terminal `7.txt`)

| Time (UTC) | Component | Event | Implication |
|------------|-----------|-------|-------------|
| 23:39:47 | worker | org build job failed | Provision failure |
| 23:40:00 | worker | heartbeat 409 | Job already terminal / lease conflict |
| 23:40:18 | worker | rollback compose down | Rollback, not user delete |
| 23:40:20–24 | worker | MySQL + Mongo deprovision | Shared DB rollback cleanup |
| 23:40:24 | **API** | **`Restarting 'src/index.ts'`** | Dev watcher killed API |
| 23:40:24+ | dashboard | SSE ECONNRESET → 500 | Upstream died mid-stream |
| 23:40:27 | worker | Redis flush completes | Worker independent of API |
| 23:40:27 | worker | failed to report failure | API still down |
| 23:40:38 | API | `api listening` | Recovery |
| 23:40:39+ | dashboard | notifications 200 | New SSE succeeds |

---

*End of report. No code changes were made during this investigation.*
