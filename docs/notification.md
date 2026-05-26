# Notification System Audit — SaaS Owner Dashboard

Read-only audit (May 2026). No application code was modified. Goal: document what exists before building a global notification system.

---

## BLOCK 1 — WHAT EXISTS TODAY

### 1.1 Current provision progress system

#### SSE (API)

| Item | Finding |
|------|---------|
| **Exists?** | **YES** — single endpoint using Hono `streamSSE` |
| **Location** | `apps/api/src/index.ts` — `GET /tenants/provision-stream/:correlationId` |
| **Hono import** | `import { streamSSE } from "hono/streaming"` (Hono **^4.11.4**) |
| **Scope** | **Per `correlationId`** (one async provision job), not global / per-owner |

**How it works:** The handler does **not** subscribe to `provision-bus`. It polls Postgres every **1.5s** (`STREAM_POLL_MS`), reads `tenant_provision_events` for the correlation id, and pushes new rows over SSE. Terminal detection uses `tenant_lifecycle_jobs` status (`completed`, `dead`, `failed`) and/or trace phase `complete` / `failed`.

**SSE events emitted:**

| Event | Payload | Purpose |
|-------|---------|---------|
| `provision` | JSON `ProvisionEventPayload` (id, correlationId, phase, level, message, meta, …) | One provision trace row |
| `done` | `{ status: "complete" \| "failed", correlationId }` | Stream end |
| `ping` | timestamp string | Keep-alive every **12s** |

#### Provision bus (`apps/api/src/provision-bus.ts`)

- Node `EventEmitter`, max 200 listeners.
- Channel: `provision:${correlationId}`.
- `emitProvisionEvent()` called from `createProvisionTracer()` in `provision-trace.ts` after each DB insert.
- `subscribeProvision()` is **defined but never used** anywhere in the repo.
- **Implication:** Real-time path for provision UI is **DB polling in SSE**, not in-memory bus fan-out.

#### Dashboard SSE consumer

| Item | Finding |
|------|---------|
| **EventSource** | **YES** — only on `apps/dashboard/app/(dashboard)/tenants/page.tsx` (create-tenant flow) |
| **Proxy** | `apps/dashboard/app/api/tenants/provision-stream/[correlationId]/route.ts` → proxies API body as `text/event-stream` |
| **Listeners** | `provision`, `done`, `ping` |
| **Also** | `pollUntilDone()` hits `/api/tenants/provision-status/:correlationId` every **2s** for up to **45 min** |

**Tenant detail** (`/tenants/[id]`): no EventSource; uses `setInterval` polling (`PROVISION_POLL_INTERVAL_MS = 2500`, max **45 min**) for tenant + provision events while status is provisioning.

---

### 1.2 Current notification UI in dashboard

| Capability | Status | Details |
|------------|--------|---------|
| Notification center / bell | **NO** | No `*notif*`, `*bell*` components; nothing in `app-sidebar.tsx` |
| Unread badge / count | **NO** | `Badge` used for tenant/license/PMS status only, not notifications |
| Toast library | **YES** | **Sonner** via `@/components/reusabletoast` (success / warning / error / promise) |
| Toaster mount | **YES** | `DashboardAppShell` → `@/components/ui/sonner` (`richColors`, `closeButton`) |
| Inline alerts | **YES** | shadcn `Alert` / `AlertDialog`; `PosHealthAlert` (POS API unreachable, one-shot fetch) |
| Sidebar notification area | **NO** | Nav: Overview, Tenants, Licenses, POS, PMS, Plans, Team, Audit log, API keys, Settings |

**Toast usage:** Ad-hoc per action (tenant detail, license dialogs, tenant list). **Not** tied to background jobs or cross-page events.

**Layouts:**

- `apps/dashboard/app/layout.tsx` — fonts, `TooltipProvider` only (no Toaster).
- `apps/dashboard/app/(dashboard)/layout.tsx` — auth gate + `DashboardAppShell` (Toaster lives here).

**Note:** `apps/dashboard/app/(dashboard)/pos/notifications/page.tsx` is a **POS module API debug page** (raw JSON), not an owner notification center.

---

### 1.3 Current event tracking in DB

| Table | Exists | Role |
|-------|--------|------|
| `tenant_provision_events` | **YES** | Append-only provision trace; keyed by `correlation_id` |
| `tenant_lifecycle_jobs` | **YES** | Async jobs: type, status, `correlation_id`, `last_error`, heartbeats via `claimed_at` |
| `admin_audit_log` | **YES** | Operator actions (actor, action, targets, metadata) — list API in `routes/audit-log.ts` |
| `notifications` | **NO** | No table, no Drizzle migration matching `notif` / `alert` |

**`tenant_provision_events` columns:** `id`, `correlation_id`, `slug`, `tenant_id`, `parent_tenant_id`, `deployment_id`, `phase`, `level`, `message`, `meta` (jsonb), `created_at`.

**Error fields elsewhere:** `tenant_deployments.last_error`, `tenant_lifecycle_jobs.last_error`, `organizations.provisioning_error`.

---

### 1.4 Current real-time infrastructure

| Mechanism | Status | Where |
|-----------|--------|-------|
| WebSocket / socket.io | **NO** in API (grep hits are false positives like `rows.map`) |
| SSE | **YES** | Provision stream only (see 1.1) |
| `setInterval` polling | **YES** | Tenants list create flow, tenant detail provision, `use-dashboard-stats` (30s), `use-organizations`, org-switcher |
| TanStack React Query | **NO** | Only `@tanstack/react-table` in data-table |
| In-process EventEmitter | **YES** | `provision-bus` (emit only; unused subscribe) |
| Redis pub/sub in API | **NO** | Redis appears in tenant Docker stacks / worker compose, not control-plane pub/sub |

---

### 1.5 Events that need notifications (today)

**Job types** (`apps/api/src/services/tenant-jobs.ts`):

- `tenant.provision`
- `organization.provision`
- `tenant.deprovision`
- `tenant.lifecycle`
- `add_module`
- `remove_module`

**Lifecycle outcomes** (via `POST /internal/jobs/:jobId/complete` and `fail`):

- **Complete:** tenant status `active` or **`partial`** (Finance ok, POS failed → `deployment.last_error`, tenant `partial`).
- **Fail:** tenant/deployment `failed`, provision trace `failed` phase.
- **Stale worker:** On job claim, leases older than **5 minutes** without heartbeat refresh → reclaim; after max attempts → `dead`; provision tenants marked `failed` with `worker_stale_lease_reclaimed` (not 10 min — audit scenario 6 should align to **5 min** unless product changes it).

**License (backend, not dashboard push):**

- Worker `expireDueLicenses` every **5 min** → status `expired`, finance sync, emails (`license-expire-followup.ts`).
- **30-day window:** `processExpiringSoonWarnings` sends **email** only (no in-app notification).
- Manual revoke/suspend/extend via `license-http.ts`.

**System health:**

- `GET /health` on API; readiness engine pings tenant stack `/api/ping/`.
- `PosHealthAlert` on dashboard when POS control-plane proxy unreachable.

---

## BLOCK 2 — REAL-TIME TECH AVAILABLE

### 2.1 Hono (API)

- Version: **^4.11.4** (`apps/api/package.json`).
- `streamSSE`: **1 usage** (`provision-stream` route).
- Pattern proven for long-lived streams (20+ min compose pulls documented in dashboard proxy).

### 2.2 Next.js (dashboard)

- Version: **16.2.4** (`apps/dashboard/package.json`).
- Provision SSE: Next route handler returns `Response(res.body)` with streamed headers — works for proxying API SSE.
- No other `ReadableStream` / streaming route handlers under `app/api` for notifications.

### 2.3 Notification storage / APIs

- **No** `/notifications`, `/alerts`, or `/activity` routes on API `index.ts` or dashboard `app/api`.
- Audit log is the closest “activity feed”: `GET` audit log list (read-only history).

---

## BLOCK 3 — NOTIFICATION EVENTS MAP (product vs today)

| Scenario | Backend signal today | Dashboard today |
|----------|----------------------|-----------------|
| 1. Provision complete | Job `completed`, trace `provisioning.completed`, tenant `active` | Toast on tenant detail actions; create flow on **tenants page** only (SSE + poll); credentials via provision-status / detail APIs |
| 2. Provision failed | Job `failed`/`dead`, tenant `failed`, trace `failed` | Error in create wizard / thrown in poll; no global toast if user left page |
| 3. Partial (POS failed) | `tenant.status === "partial"`, `last_error` on deployment | Amber alerts + retry on **tenant detail** only |
| 4. License expiring ≤30d | Worker email + licenses API `expiringInDays=30` | Badge on tenant detail; licenses page filter/analytics; overview stats poll — **no banner/notification center** |
| 5. License expired | Worker marks expired, finance/POS sync, email | API errors (`LICENSE_EXPIRED`); license/tenant UI — **no red global notification** |
| 6. Job stuck | **5 min** stale lease reclaim (not 10 min); heartbeat every **15s** on worker | Tenant detail poll timeout **45 min** message — **no** “stuck job” notification |

---

## BLOCK 4 — DECISION QUESTIONS

| # | Question | Answer |
|---|----------|--------|
| Q1 | Hono `streamSSE` used? | **Yes** (1 route) → SSE is proven for this stack |
| Q2 | Dashboard `EventSource`? | **Yes** (1 page) → team already integrates SSE |
| Q3 | React Query polling? | **No** React Query; **Yes** manual `setInterval` + fetch |
| Q4 | Concurrent operators | SaaS owner dashboard → typically **low** (&lt;10); SSE per owner stream is sufficient; no WebSocket required for v1 |
| Q5 | Redis pub/sub for API? | **Not used** for notifications; multi-instance SSE would need DB polling (already used) or future Redis fan-out |

**Recommended primary transport:** **SSE extended with owner-scoped channel** (or continue DB-backed polling pattern), **not** a second parallel system. **Persistence:** new `notifications` table (or derive unread from jobs/licenses queries) so badge survives refresh.

---

## BLOCK 5 — REQUIRED SCENARIOS (build target)

Documented product scenarios (unchanged from spec); gaps noted above.

1. **Tenant provision completes** — toast + notification center + URLs/credentials when not on tenants page.
2. **Tenant provision fails** — global toast + bell badge + detail with error.
3. **Tenant partial** — amber warning + retry CTA.
4. **License expiring (30d)** — banner and/or notification + link to extend.
5. **License expired** — red notification + renew link.
6. **Job stuck** — align threshold with ops (today **5 min** lease); cancel/retry CTA.

**Cross-cutting requirements:**

- Work across page navigations → **global client state + SSE/poll at shell level** (`DashboardAppShell`), not only `tenants/page.tsx`.
- Badge after refresh → **DB persistence** (or durable read model); localStorage alone is insufficient for multi-device.

---

## BLOCK 6 — PROVISION STREAM DEEP DIVE

### 6.1 API route (summary)

```text
GET /tenants/provision-stream/:correlationId
  → validate job or trace rows exist (404 otherwise)
  → loop: read tenant_provision_events → write SSE event "provision"
  → check terminal job/event → write "done" → exit
  → every 12s: "ping"
```

POST provision responses include `stream: /tenants/provision-stream/${correlationId}` in JSON for clients.

### 6.2 Can `provision-bus` extend to global events?

| Aspect | Assessment |
|--------|------------|
| Multi-subscriber per channel | **Yes** (EventEmitter) |
| Global / all-tenants channel | **No** — API is `provision:${correlationId}` only |
| Used by SSE today | **No** — SSE polls DB |
| Multi-instance API | In-memory bus **does not** cross processes; DB poll already multi-instance safe |

**Extension path:** Add `owner:${ownerId}` or `global:platform` channels **and** wire SSE to `subscribeProvision` **or** keep DB poll for durability. For owner-wide notifications, prefer **new table + SSE filter by ownerId** over reusing correlation-scoped bus alone.

---

## BLOCK 7 — NOTIFICATION DB NEEDS

- **`notifications` table:** does not exist.
- **Reuse candidates:**
  - `tenant_provision_events` — high-volume trace, not user-facing inbox.
  - `tenant_lifecycle_jobs` — query “recent terminal jobs for my tenants” for unread derivation (possible v0 without new table).
  - `admin_audit_log` — compliance audit, not operator alerts.
  - `licenses` + `expires_at` — source for license warning/expired notifications.

**Suggested new table (future):** `owner_notifications` (owner_id, type, severity, title, body, tenant_id, read_at, created_at, meta jsonb, optional correlation_id).

---

## Notification Audit Results

### What already exists

| Item | Status |
|------|--------|
| SSE | **YES** — `GET /tenants/provision-stream/:correlationId`; events `provision`, `done`, `ping`; per-job only |
| Toast | **YES** — Sonner (`reusabletoast` + `ui/sonner` in shell) |
| Polling | **YES** — `setInterval` + fetch (no React Query); 2s provision, 30s dashboard stats |
| Notification table in DB | **NO** |
| Provision events table | **YES** — `tenant_provision_events` |
| Audit log | **YES** — `admin_audit_log` (separate concern) |

### Real-time tech decision

- [x] **SSE (Server-Sent Events)** — Hono `streamSSE` already in production; dashboard `EventSource` + Next proxy exist; extend to **owner-scoped** stream rather than adding WebSocket.
- [ ] WebSocket — unnecessary for low concurrency owner dashboard v1.
- [ ] Long polling — redundant given SSE + existing status polls.
- [ ] React Query polling — not adopted; could be added later for inbox list, not required for v1.

### Notification types needed (priority)

1. Provision complete / failed / partial  
2. License expiring / expired  
3. Job stuck / dead (stale lease / dead letter)  
4. Module add/remove job completion (secondary)  
5. System health (POS unreachable — partial pattern via `PosHealthAlert`)

### What needs to be built

| # | Item | Complexity |
|---|------|------------|
| 1 | `owner_notifications` (or equivalent) + mark-read API | Medium |
| 2 | Owner/global SSE or shell-level poll for terminal jobs + license windows | Medium–High |
| 3 | Notification bell + drawer/panel in `SiteHeader` / sidebar | Medium |
| 4 | Wire job complete/fail/partial + license worker/cron to insert notifications | Medium |
| 5 | Unread count endpoint + persist across refresh | Low–Medium |
| 6 | Product alignment: stuck job threshold (5 vs 10 min) | Low |

### What can be reused

- `streamSSE` + dashboard SSE proxy pattern (`provision-stream` route).
- `tenant_provision_events` + `tenant_lifecycle_jobs` for payload and correlation.
- `createProvisionTracer` / `emitProvisionEvent` (optionally connect SSE to bus for lower latency).
- Sonner + `DashboardAppShell` for toasts globally.
- License expiring query (`expiringInDays=30`) and worker expiry pipeline.
- `admin_audit_log` patterns for actor/metadata (optional cross-link).

### Recommended architecture

Add a **durable notification row** per owner (or platform-wide for single-owner deployments) when jobs reach terminal states and when licenses enter 30-day or expired states. Expose **`GET /notifications`** (paginated, unread filter) and **`GET /notifications/stream`** (SSE: new rows + optional ping), mounted once in **`DashboardAppShell`** so any route receives toasts and badge updates. Keep the existing **per-correlation provision stream** for step-by-step logs on create/detail; use the **global stream** only for inbox-style alerts. On API restarts, DB-backed SSE polling (same as today’s provision stream) stays correct without Redis; add Redis pub/sub only if you run multiple API replicas and need sub-second fan-out without polling.

---

## Implementation — multi-API safe stream (current)

**Status:** Implemented. Global owner notifications use **DB polling** (not in-memory bus, not Redis).

### Two SSE streams

| Stream | Endpoint | Transport | Multi-instance |
|--------|----------|-----------|----------------|
| Provision step log | `GET /tenants/provision-stream/:correlationId` | Poll `tenant_provision_events` every 1.5s | Safe (shared DB) |
| Owner inbox / toasts | `GET /notifications/stream` | Poll `owner_notifications` every 2.5s | Safe (shared DB) |

### `GET /notifications/stream` behavior

1. **Prime** — Load last 50 rows for owner into a `sent` Set (no SSE `notification` events → avoids reconnect toast storm).
2. **`connected`** — `{ unread }` from DB count.
3. **Loop** — `listNotificationsForStream(ownerId, since)` where `since = now - 1s`; emit `notification` for new IDs; `ping` every 15s.
4. **`createNotification`** — Insert only; no `notificationBus`.

### Constants

- `NOTIFICATION_STREAM_POLL_MS = 2500`
- `NOTIFICATION_STREAM_PING_MS = 15000`
- Index: `owner_notifications_owner_created_idx` on `(owner_id, created_at)`

### Latency and future upgrade

- Worst-case live toast delay: **~2.5s** (poll interval).
- **v2 (optional):** Redis pub/sub inside `createNotification` for sub-second push; dashboard SSE contract (`connected` / `notification` / `ping`) unchanged.

### Key files (implementation)

| Area | Path |
|------|------|
| Stream route | `apps/api/src/routes/notifications.ts` |
| Service | `apps/api/src/notification-service.ts` |
| Helpers (create on job/license) | `apps/api/src/notification-helpers.ts` |
| Bell UI | `apps/dashboard/components/notification-bell.tsx` |
| BFF SSE proxy | `apps/dashboard/app/api/notifications/stream/route.ts` |
| Tests | `apps/api/tests/notification-stream.test.ts` |

**Removed:** `apps/api/src/notification-bus.ts` (in-memory fan-out; not safe across API replicas).

---

## CRITICAL RULES (audit compliance)

- [x] Read existing SSE before recommending tech  
- [x] Verified Hono **4.11.4** and Next **16.2.4**  
- [x] Do not add a second real-time system — extend SSE + DB  
- [x] Global behavior requires shell-level consumer, not per-page only  
- [x] Badge persistence requires DB (or query-derived unread), not toast-only  
- [x] Audit only — no application code changed (this file is documentation only)

---

## Key file reference

| Area | Path |
|------|------|
| SSE endpoint | `apps/api/src/index.ts` (~3637–3719) |
| Provision bus | `apps/api/src/provision-bus.ts` |
| Trace + emit | `apps/api/src/provision-trace.ts` |
| Dashboard SSE | `apps/dashboard/app/(dashboard)/tenants/page.tsx`, `app/api/tenants/provision-stream/[correlationId]/route.ts` |
| Shell / Toaster | `apps/dashboard/components/dashboard-app-shell.tsx` |
| Schema | `packages/db/src/schema.ts` (`tenantProvisionEvents`, `tenantLifecycleJobs`, `adminAuditLog`) |
| License follow-up | `apps/api/src/license-expire-followup.ts`, `infra/worker-service/src/worker.ts` |
| Job types | `apps/api/src/services/tenant-jobs.ts` |
