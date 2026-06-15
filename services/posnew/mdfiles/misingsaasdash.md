# SaaS Dash (`apps/saas-dash`) — implementation audit

This document summarizes what exists in the platform operator dashboard, how it is structured, how data and real-time behavior work, and what is incomplete or misaligned. Use it as a single reference for planning and fixes.

**Scope:** `apps/saas-dash` only (shared UI may live under `packages/ui`).

---

## 1. Project structure

### 1.1 Top-level folders and main files

| Path | Purpose |
|------|--------|
| `apps/saas-dash/src/` | Application source (App Router, components, hooks, lib, navigation, styles, tests). |
| `apps/saas-dash/public/` | Static assets (e.g. `swagger-viewer.html` for the OpenAPI iframe). |
| `apps/saas-dash/e2e/` | Playwright tests (`smoke`, `auth-repair`, `notifications`, etc.). |
| `apps/saas-dash/package.json` | Next 16, React 19, TanStack Query, Zustand, Zod, Recharts, Swagger UI, Vitest, MSW. |
| `apps/saas-dash/next.config.mjs` | Next.js configuration. |
| `apps/saas-dash/tsconfig.json` | TypeScript; maps `@/components/ui/*` to shared `packages/ui`. |
| `apps/saas-dash/vitest.config.ts` | Unit tests. |
| `apps/saas-dash/playwright.config.ts` | E2E tests. |
| `apps/saas-dash/.env.example` / `.env.local` | Environment (not documented in this file). |

### 1.2 `src/` layout

| Area | Role |
|------|------|
| `src/app/` | Next.js App Router: root `layout.tsx`, `globals.css`, `login/page.tsx`, and route group `(platform)/` for the authenticated shell and all main pages. |
| `src/components/` | App-specific UI: shell (sidebar, header, search, breadcrumbs), metadata-driven `resource-page` / `resource-table`, `feed-page`, and domain folders (`webhooks/`, `api-keys/`, `subscriptions/`). |
| `src/lib/` | HTTP client, env, permissions, Zod schemas (`api-schemas/*`), `resource-config.ts` registry, `query-keys.ts`, auth/notification/session stores, OpenAPI-related helpers. |
| `src/hooks/` | `use-session-refresh`, `use-debounce`, `use-before-unload-dirty`, `use-visible-polling-interval`. |
| `src/features/` | Incremental domain barrels (`common`, `organizations`) re-exporting owner primitives and shared helpers. |
| `src/navigation/` | `platform-sidebar-items.ts` — nav entries and required permissions. |
| `src/styles/` | CSS presets used with globals. |
| `src/test/` | e.g. MSW HTTP tests. |

### 1.3 Architecture style

- **App Router** with a **`(platform)` route group**; `layout.tsx` inside that group wraps children in `DashboardShellLayout` from `@restaurant-pos/ui`.
- **Hybrid:** conventional **page-level** implementations for complex screens (Overview, Reports, Compliance, System, Developers, Organization detail, User detail, Job detail) plus a **metadata-driven resource engine** (`ResourceRegistry` + `ResourcePage` + `ResourceTable`) for many list views.
- **Client-heavy:** platform layout and most feature pages are `"use client"` and use TanStack Query.
- **UI primitives** are largely **not** duplicated in the app: `tsconfig` maps `@/components/ui/*` → `../../packages/ui/src/components/*` (shared shadcn-style package).

---

## 2. Routing and pages

### 2.1 Public routes

| Route | Behavior | Status |
|-------|----------|--------|
| `/login` | Email/password → `platformPublicJson("/auth/login")`, tokens in dev localStorage, session in `auth-store`, redirect to `/`. | Implemented |

### 2.2 `(platform)` routes (authenticated shell)

All of these sit under `src/app/(platform)/` and use the platform layout (auth bootstrap, shell, SSE).

| Route | What it displays | Stub? |
|-------|------------------|-------|
| `/` | Overview: summary metrics, owner KPIs (date range), analytics chart, 7-day activity rollup, optional SLO preview card (env-gated). | **Implemented** (real APIs; SLO is explicitly “preview” / non-prod default) |
| `/organizations` | Org list via `ResourcePage` + batch `GET /organizations/health-summary` enrichment + create-org dialog + provisioning poll via TanStack Query. | **Implemented** |
| `/organizations/[id]` | Detail: fetch org, observability (when bootstrapped), lifecycle, entitlements, PIN visibility, provisioning wizard, impersonation, delete. | **Implemented** |
| `/subscriptions` | Subscription list + custom `SubscriptionActions` column. | **Implemented** |
| `/users` | Global users table (`/users/global`). | **Implemented** |
| `/users/[id]` | User detail, status PATCH, reset POST, impersonation. | **Implemented** |
| `/jobs` | Jobs list with queue/status filters; row click → job detail URL. | **Implemented** |
| `/jobs/[queue]/[id]` | Job detail with adaptive polling and retry mutation. | **Implemented** |
| `/notifications` | Feed (all/unread), mark one/all read, desktop notification permission, polling. | **Implemented** |
| `/reports` | Tabbed reports (P&L, trial balance, balance sheet, cash flow, AR aging, budget vs actual, inventory valuation), org selector, date range, CSV export. | **Implemented** |
| `/audits` | Audit log table; “SSE live” badge; pin default org in local store. | **Implemented** (see gaps: URL org vs API query) |
| `/webhooks` | Endpoints table + register + manual enqueue + outbox log section. | **Implemented** |
| `/compliance` | GDPR-style export and erasure POSTs with links to jobs. | **Implemented** |
| `/api-keys` | Keys list + create dialog. | **Implemented** (see gaps: table revoke wiring) |
| `/developers` | OpenAPI iframe, outbound webhook lab, billing simulation and inbound stub. | **Implemented** |
| `/system` | GET/PATCH `/system-settings`, POST `/bootstrap`. | **Implemented** |
| `/flags` | Flags table + confirmation dialog + PUT `/flags`. | **Implemented** (see gaps: query invalidation) |
| `/team` | Invitations `ResourcePage` + invite dialog (`POST /invitations`). | **Implemented** |
| `/inventory` | Redirects to `/` (inventory removed from operator console; use tenant apps). | **Removed** |
| `/unauthorized` | Permission denial landing. | **Implemented** |
| `error.tsx` | Platform error UI. | Present |

---

## 3. Components (app-level, reusable)

### 3.1 Shell and navigation

- **`platform-app-sidebar.tsx`** — Renders nav from `platformNavEntries`; loads unread notification count via `platformJson(platformEndpoints.notifications.unreadCount())`.
- **`platform-shell-header-end.tsx`** — Header actions (session / notifications UX).
- **`platform-search-dialog.tsx`** — **Cmd/Ctrl+J** command palette; **only navigates to sidebar routes** (no server-side entity search).
- **`platform-breadcrumbs.tsx`**, **`platform-overview-crumb.tsx`** — Breadcrumbs / section labels.

### 3.2 Data / CRUD patterns

- **`resource-page.tsx`** — Generic list: debounced search, `useQuery`, `platformJson`, Zod `parseApiResponse`, optional `queryParams`, `onAction`, `onRowClick`.
- **`resource-table.tsx`** — Column types: `text`, `link`, `badge`, `date`, `money`, `switch`, `progress`, `custom`. Interactive actions go through `onAction` mainly for **`switch`** cells with `actionId`.
- **`feed-page.tsx`** — Card-based feed; supports **`refetchInterval`** for polling.

### 3.3 Domain-specific

- **`provisioning-wizard.tsx`** — Provisioning status; uses **polling** (`refetchInterval`).
- **`organization-selector.tsx`**, **`organization-observability-section.tsx`** — Org picking and observability UI on org detail.
- **`webhooks/register-webhook-dialog.tsx`**, **`manual-enqueue-dialog.tsx`**, **`webhook-outbox-log.tsx`** — Webhook lifecycle UI.
- **`subscriptions/subscription-actions.tsx`** — Per-row subscription actions.
- **`api-keys/create-key-dialog.tsx`** — Create API key.
- **`metrics-bar.tsx`** — Bar chart used on Overview.
- **`openapi-viewer.tsx`** — Iframe to `/swagger-viewer.html`.

### 3.4 Cross-cutting

- **`access-gate.tsx`** — Permission gate around pages/sections.
- **`session-expired-dialog.tsx`**, **`session-expiry-warning.tsx`** — Session UX; warning uses **`setInterval`** (~30s).
- **`query-error-listener.tsx`**, **`providers.tsx`**, **`sentry-client-init.tsx`**, **`cross-tab-invalidation.tsx`**, **`before-unload-dirty-bridge.tsx`**, **`config-warning-banner.tsx`**, **`date-range-picker.tsx`**.

### 3.5 Missing or weak as shared abstractions

- No app-level **generic data grid** beyond `ResourceTable` (e.g. column visibility, advanced filtering, standardized server pagination).
- **Global search** is nav-only, not org/user/job search.
- **Filter bars** are mostly inlined per page rather than one reusable pattern.

---

## 4. Data layer

### 4.1 How data is fetched

- **TanStack React Query** for server state (`useQuery`, `useMutation`, invalidation).
- **`platformJson` / `platformFetch`** (`src/lib/platform-http.ts`):
  - Base URL from `platformApiBaseUrl()` (`platform-constants`).
  - `credentials: "include"` for cookies.
  - On **401**, attempts token refresh (`singleFlightRefresh` + `requestTokenRefresh`), then retries; may open session-expired UI.
  - In **development**, may attach `Authorization: Bearer` from `getPlatformToken()` if present.
- **Public/unauthenticated** calls use **`platformPublicJson`** from `platform-public-http.ts` (e.g. login).
- **Validation:** `parseApiResponse` + Zod schemas in `src/lib/api-schemas/*`.

### 4.2 Auth flow (summary)

- Login: **`POST /auth/login`** → optional dev token storage → `setSession` → `router.replace("/")`.
- Bootstrap: refresh + **`GET /auth/me`** to hydrate `user` in `auth-store`.

### 4.3 Real data vs placeholders

- Most modules call **real platform API** paths; “placeholder” behavior is mostly **empty states**, **developer lab** sample JSON, or **documented caveats** in UI copy (e.g. MRR/ARR as hints on Overview).
- **Reports** and **metrics** depend on backend implementing the same routes and shapes as the Zod schemas.

---

## 5. State and real-time

### 5.1 Client state stores (Zustand)

- **`auth-store.ts`** — `user`, session expired dialog, bootstrap/refresh/fetchMe, logout; cross-tab hooks via `session-sync`.
- **`operator-prefs-store.ts`** — e.g. default org id for audits (local operator preference).
- **`notification-store.ts`** — Unread count used with sidebar/query invalidation patterns.

### 5.2 Polling

| Location | Mechanism |
|----------|-----------|
| `feed-page.tsx` | `useQuery` **`refetchInterval`** (notifications: 3s unread / 5s all). |
| `jobs/[queue]/[id]/page.tsx` | Dynamic **`refetchInterval`** while job not terminal; backoff on failures; slower when document hidden. |
| `provisioning-wizard.tsx` | **`refetchInterval`** (conditional) for provisioning status. |
| `session-expiry-warning.tsx` | **`setInterval`** (~30s) for expiry checks. |
| `organizations/page.tsx` | **Manual loop** with `setTimeout` waiting for `readyForPinLogin` after create (not React Query). |

### 5.3 SSE (Server-Sent Events)

- **`src/app/(platform)/layout.tsx`** opens **`EventSource(`${platformApiBaseUrl()}/stream`, { withCredentials: true })`**.
- **`billing` event:** `queryClient.invalidateQueries({ queryKey: ["platform", "metrics"] })`.
- **`audit` event:** invalidates audit queries; dispatches window event **`platform-audit-sse`**; parses payload; toasts by severity (`platform-critical-alerts`); **`invalidateNotificationQueriesEverywhere`**; on `platform.org.create` invalidates org + metrics summary keys (via `qk.metricsSummary` / org list keys as coded).
- **Errors:** best-effort session re-check; may logout and redirect to login.

### 5.4 WebSockets

- **Not used** in this app.

### 5.5 Summary

“Live” behavior = **SSE stream** (audits/metrics/notifications side effects) + **polling** on notifications and active jobs (+ provisioning). There is no generic WebSocket channel for all entities.

---

## 6. Features coverage (module checklist)

| Module | Status | Notes |
|--------|--------|--------|
| Overview | ✅ Implemented | `/metrics/summary`, `/metrics/kpis`, `/metrics/analytics` |
| Organizations (list + detail) | ✅ Implemented | List, create, detail, lifecycle, entitlements, observability, provisioning, impersonation |
| Subscriptions | ✅ Implemented | List + row actions |
| Users | ✅ Implemented | Global list + detail (status, reset, impersonation) |
| Jobs | ✅ Implemented | Filtered list + detail + retry |
| Webhooks | ✅ Implemented | Endpoints + outbox + dialogs |
| Notifications | ✅ Implemented | List/unread, mark read, polling |
| Reports | ✅ Implemented | Multiple report endpoints + CSV |
| Audits | Partial | Table + SSE badge; **URL org filter may not be passed to API** (see gaps) |
| Compliance | ✅ Implemented | Export + deletion POSTs |
| API keys | Partial | List + create; **row revoke may be unwired** (see gaps) |
| Developers | ✅ Implemented | OpenAPI viewer + webhook/billing labs |
| Settings / System | ✅ Implemented | `/system-settings`, `/bootstrap` |
| Flags | ✅ Implemented | With **invalidation bug risk** (see gaps) |
| Team | ✅ Implemented | Invitations + invite dialog |
| Inventory (dashboard) | Partial | Route exists; **not in sidebar** |

---

## 7. Backend integration — endpoints the app uses

Canonical path builders for some resources live in **`src/lib/platform-endpoints.ts`** (notifications, jobs, org observability). Everything else is mostly string paths in pages/components.

### 7.1 Auth and session

- `POST /auth/login` (public)
- Refresh flow uses **`/auth/refresh`** (via `platform-public-http` / `requestTokenRefresh`)
- `GET /auth/me`

### 7.2 API keys

- `GET /auth/api-keys` (list)
- `POST /auth/api-keys` (create)
- `POST /auth/api-keys/:id/revoke`

### 7.3 Notifications

- `GET /notifications` (with optional unread query via `platformEndpoints.notifications.list`)
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/all/read`

### 7.4 Jobs

- `GET /jobs` (query: queue, status, limit, offset — via `platformEndpoints.jobs.list`)
- `GET /jobs/:queue/:id`
- `POST /jobs/:queue/:id/retry`

### 7.5 Organizations

- `GET /organizations`, `POST /organizations`
- `GET /organizations/:id`, `DELETE /organizations/:id`
- `PATCH /organizations/:id/lifecycle`
- `PATCH /organizations/:id/entitlements`
- `POST /organizations/:id/credentials/:role/reset-pin`
- `GET /organizations/:id/provisioning-status`
- `POST /organizations/:id/provisioning/retry`
- `GET /organizations/:id/observability`

### 7.6 Users (global)

- `GET /users/global` (list)
- `GET /users/global/:id`
- `PATCH /users/global/:id/status`
- `POST /users/global/:id/reset`

### 7.7 Invitations / team

- `GET /invitations` (via registry)
- `POST /invitations`

### 7.8 Webhooks

- `GET /webhooks/endpoints`, `POST /webhooks/endpoints`, `DELETE /webhooks/endpoints/:id`
- `GET /webhooks/outbox`, `POST /webhooks/outbox`

### 7.9 Subscriptions

- `GET /subscriptions`
- `PUT /subscriptions/:id` (via subscription actions)

### 7.10 Audits

- `GET /audits`

### 7.11 Feature flags

- `GET /flags`
- `PUT /flags`

### 7.12 Inventory (platform)

- `GET /inventory/low-stock`
- `GET /inventory/slow-moving`
- `GET /inventory/movements?limit=100` (registry bakes query into `apiPath`)

### 7.13 Metrics

- `GET /metrics/summary`
- `GET /metrics/kpis`
- `GET /metrics/analytics`

### 7.14 Reports

- `GET /reports/pnl`
- `GET /reports/trial-balance`
- `GET /reports/balance-sheet`
- `GET /reports/cash-flow`
- `GET /reports/ar-aging`
- `GET /reports/budget-vs-actual`
- `GET /reports/inventory-valuation`

### 7.15 Compliance

- `POST /compliance/export`
- `POST /compliance/deletion`

### 7.16 System

- `GET /system-settings`
- `PATCH /system-settings`
- `POST /bootstrap`

### 7.17 Billing / developer simulation

- `POST /billing/simulate/subscription`
- `POST /billing/simulate/suspend`
- `POST /billing/webhooks/inbound?provider=stub`

### 7.18 Impersonation

- `POST /impersonation/session`

### 7.19 Real-time transport

- `GET /stream` (SSE, `EventSource` with credentials)

### 7.20 Likely backend gaps for “full” product (depends on your API)

- SSE **`/stream`** must match cookie auth and event names (`billing`, `audit`) and payload shape expected in layout.
- All report and metrics endpoints must return data matching Zod schemas.
- Audits filtering: if you need `organizationId` (or other filters), backend must support query params **and** the frontend must send them (currently a gap for URL org — see below).

---

## 8. Gaps, missing pieces, and refactoring targets

### 8.1 Flags page — query key mismatch (high impact)

- **`ResourcePage`** uses `queryKey: [resource.id, { search, queryParams }]` → for flags, prefix is **`["flags", …]`**.
- **`flags/page.tsx`** on successful mutation calls `invalidateQueries({ queryKey: qk.flags })` where **`qk.flags = ["platform", "flags"]`**.
- Those keys **do not match**, so the flags table may **not refetch** after a successful PUT until manual refresh or navigation.

**Refactor direction:** Invalidate the same key prefix `ResourcePage` uses (e.g. predicate on first segment `flags`, or change `ResourcePage` / registry to use `qk.flags` consistently).

### 8.2 Audits page — URL organization filter vs API

- `audits/page.tsx` reads **`organizationId`** from `useSearchParams()` for title and “Pin Org Context”.
- **`ResourcePage`** is **not** given **`queryParams={{ organizationId: orgId }}`** (or equivalent), so the list request may still be **unfiltered** even when the URL suggests a scoped view.

**Refactor direction:** Pass query params aligned with backend (`organizationId`, etc.) and document supported filters.

### 8.3 API keys and webhooks — revoke handlers vs table wiring

- **`api-keys/page.tsx`** defines `onAction` for `actionId === "revoke"`, but **`ResourceRegistry.apiKeys`** columns are only text/date fields — **no `switch` or `custom` column** that calls `onAction` with `revoke`.
- **`webhooks/page.tsx`** similarly expects `onAction` for `revoke` / `disabled`, but registry columns are **badge/text**, not interactive `switch` with `actionId`.

**Refactor direction:** Add a **`custom`** column with buttons, or a dedicated actions column that invokes the mutations; or remove dead `onAction` paths.

### 8.4 Inventory route not in navigation

- **`/inventory`** exists and works as a dashboard, but **`platform-sidebar-items.ts`** does **not** include it, so operators won’t discover it from the shell.

**Refactor direction:** Add nav entry + permission if inventory is productized.

### 8.5 Search is navigation-only

- **`PlatformSearchDialog`** filters **`platformNavEntries`**; it does **not** query orgs/users/jobs.

### 8.6 Pagination and scale

- **`ResourcePage`** is built around a single fetch + optional search param; **no standard cursor/offset UX** for most resources (jobs builder passes limit/offset in the API path for that module only).

### 8.7 SSE invalidation vs Overview query keys

- Layout invalidates **`["platform", "metrics"]`** on `billing`; Overview uses **`qk.metricsSummary`**, **`qk.metricsKpis(...)`**, **`qk.metricsAnalytics(...)`**.
- Depending on backend events, you may want **explicit invalidation** of those keys together to avoid stale Overview cards.

### 8.8 Minor / cleanup

- Unused imports or copy-only “lab” data on developer pages — low priority hygiene.

---

## 9. Prioritized next steps

1. **Fix flags invalidation** so PUT `/flags` refreshes the table reliably.
2. **Wire audits `organizationId`** (and any other filters) from URL to `ResourcePage` `queryParams` + confirm backend contract.
3. **Expose revoke (and similar) in the table** for API keys and webhooks, or delete unused `onAction` branches.
4. **Add `/inventory` to `platformNavEntries`** with the right permission (`metrics:read` is used on inventory resources in `resource-config`).
5. **Align SSE invalidations** with concrete `qk.metrics*` keys used on Overview.
6. **Introduce pagination/filter patterns** for large lists (orgs, audits, users) if data volume grows.

---

## 10. File pointers (quick navigation)

| Concern | Primary files |
|--------|----------------|
| Shell + SSE | `src/app/(platform)/layout.tsx` |
| Nav | `src/navigation/platform-sidebar-items.ts` |
| Resource definitions | `src/lib/resource-config.ts` |
| HTTP client | `src/lib/platform-http.ts`, `src/lib/platform-public-http.ts` |
| Endpoint helpers | `src/lib/platform-endpoints.ts` |
| Query keys / invalidation map | `src/lib/query-keys.ts`, `src/lib/invalidate-queries-everywhere.ts` |
| Permissions | `src/lib/permissions.ts`, `src/components/access-gate.tsx` |
| Auth store | `src/lib/auth-store.ts` |

---

*Generated as a durable reference for `apps/saas-dash`. Update this file when you fix the gaps above.*
