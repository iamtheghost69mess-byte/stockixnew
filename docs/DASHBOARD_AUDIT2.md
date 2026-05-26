# Dashboard Architecture Audit

**Date:** Monday, May 25, 2026  
**Scope:** `apps/dashboard` (read-only)  
**Next.js:** 16.2.4 · **React:** 19.2.4

---

## Executive summary

The dashboard follows a solid **App Router + BFF (`app/api`)** pattern for core control-plane routes (tenants, licenses, plans, settings). **RouteError** and **RouteLoading** are used consistently on those segments. Gaps are concentrated in three areas: **(1)** root-level convention files that diverge from shared components, **(2)** **POS/PMS** sub-apps with no segment-level `error.tsx`/`loading.tsx` and thin/debug pages, and **(3)** several **monolithic client pages** (especially `tenants/[id]`) that should be split into feature components.

Approximate scale: **~238** `.ts`/`.tsx` files under `apps/dashboard`, **39** `page.tsx` routes, **69** API `route.ts` handlers.

---

## 1. Route map

Convention key: **✅** = file exists at route segment · **—** = inherits from parent · **N/A** = not applicable

| Route | page | loading | error | layout | not-found |
|-------|------|---------|-------|--------|-----------|
| `/` | ✅ | — `(dashboard)` | — | — `(dashboard)` | — `app` |
| `/tenants` | ✅ | ✅ | ✅ | — | — |
| `/tenants/[id]` | ✅ | ✅ | ✅ | — | ✅ |
| `/tenants/[id]/organizations/[orgId]` | ✅ | ✅ | ✅ | — | ✅ |
| `/licenses` | ✅ | ✅ | ✅ | — | — |
| `/licenses/[id]` | ✅ | ✅ | ✅ | — | ✅ |
| `/plans` | ✅ | ✅ | ✅ | — | — |
| `/owners` | ✅ | ✅ | ✅ | — | — |
| `/audit-log` | ✅ | ✅ | ✅ | — | — |
| `/api-keys` | ✅ | ✅ | ✅ | — | — |
| `/settings` | ✅ | ✅ | ✅ | — | — |
| `/pos` | ✅ | — | — | — | — |
| `/pos/organizations` | ✅ | — | — | — | — |
| `/pos/organizations/[id]` | ✅ | — | — | — | — |
| `/pos/devices` | ✅ | — | — | — | — |
| `/pos/metrics` | ✅ | — | — | — | — |
| `/pos/webhooks` | ✅ | — | — | — | — |
| `/pos/flags` | ✅ | — | — | — | — |
| `/pos/jobs` | ✅ | — | — | — | — |
| `/pos/notifications` | ✅ | — | — | — | — |
| `/pms` | ✅ | — | — | — | — |
| `/pms/properties` | ✅ | — | — | — | — |
| `/pms/rooms` | ✅ | — | — | — | — |
| `/pms/bookings` | ✅ | — | — | — | — |
| `/pms/guests` | ✅ | — | — | — | — |
| `/pms/payments` | ✅ | — | — | — | — |
| `/pms/channels` | ✅ | — | — | — | — |
| `/pms/cleaning` | ✅ | — | — | — | — |
| `/pms/reports` | ✅ | — | — | — | — |
| `/pms/calendar` | ✅ | — | — | — | — |
| `/pms/date-overrides` | ✅ | — | — | — | — |
| `/pms/message-templates` | ✅ | — | — | — | — |
| `/pms/guest-forms` | ✅ | — | — | — | — |
| `/pms/staff` | ✅ | — | — | — | — |
| `/login` | ✅ | — | — | `(auth)` | — |
| `/forgot-password` | ✅ | — | — | `(auth)` | — |
| `/reset-password` | ✅ | — | — | `(auth)` | — |
| `/accept-invite` | ✅ | — | — | `(auth)` | — |
| `/g/[token]` | ✅ | — | — | — (root only) | — |
| `/dashboard` | ✅ (redirect → `/`) | — | — | — | — |

**Layouts (3 total, all distinct — expected):**

| File | Role |
|------|------|
| `app/layout.tsx` | Root: fonts, `TooltipProvider`, global metadata |
| `app/(auth)/layout.tsx` | Centered auth shell |
| `app/(dashboard)/layout.tsx` | Auth gate (`/auth/me`), `DashboardAppShell` |

POS/PMS routes inherit `(dashboard)/loading.tsx` → **RouteLoading** and `(dashboard)/error.tsx` → **RouteError** only when navigating within the dashboard group; they do not have finer-grained segment boundaries.

---

## 2. Convention files summary

### `error.tsx` — **12** total

| File | Content type | Correct? |
|------|-------------|----------|
| `app/error.tsx` | Inline Alert + Button (duplicate of RouteError UX) | **NO** — should wrap `RouteError` |
| `app/(dashboard)/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/tenants/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/tenants/[id]/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/tenants/[id]/organizations/[orgId]/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/licenses/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/licenses/[id]/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/plans/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/owners/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/audit-log/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/api-keys/error.tsx` | `RouteError` wrapper | **YES** |
| `app/(dashboard)/settings/error.tsx` | `RouteError` wrapper | **YES** |

All 11 dashboard-segment `error.tsx` files are **identical** thin wrappers — acceptable Next.js pattern.

Also present: `app/global-error.tsx` (standalone root fallback, inline UI — appropriate for global boundary).

### `loading.tsx` — **12** total

| File | Content type | Correct? |
|------|-------------|----------|
| `app/loading.tsx` | Custom full-screen spinner | **NO** — should use `RouteLoading` |
| `app/(dashboard)/loading.tsx` | `RouteLoading` wrapper | **YES** |
| Remaining 10 under `(dashboard)/{tenants,licenses,plans,...}` | `RouteLoading` wrapper | **YES** |

### `not-found.tsx` — **4** total

| File | Content type | Correct? |
|------|-------------|----------|
| `app/not-found.tsx` | Inline heading + Link | **PARTIAL** — works; could use `RouteNotFound` |
| `app/(dashboard)/tenants/[id]/not-found.tsx` | `RouteNotFound` (tenant-specific copy) | **YES** |
| `app/(dashboard)/tenants/[id]/organizations/[orgId]/not-found.tsx` | `RouteNotFound` | **YES** |
| `app/(dashboard)/licenses/[id]/not-found.tsx` | `RouteNotFound` | **YES** |

No `not-found.tsx` under POS/PMS (global `app/not-found.tsx` handles unknown paths).

### `layout.tsx` — **3** total

Documented in §1. No duplication concern — each serves a distinct route group.

### `page.tsx` — **39** total

See route table in §1.

---

## 3. Directory structure (high level)

```
apps/dashboard/
├── app/
│   ├── layout.tsx, error.tsx, loading.tsx, not-found.tsx, global-error.tsx
│   ├── (auth)/          # login, forgot/reset password, accept-invite
│   ├── (dashboard)/     # authenticated shell (main product)
│   │   ├── layout.tsx, loading.tsx, error.tsx
│   │   ├── page.tsx     # home overview
│   │   ├── tenants/, licenses/, plans/, owners/, audit-log/, api-keys/, settings/
│   │   ├── pos/         # 9 pages, no segment error/loading
│   │   └── pms/         # 14 pages, no segment error/loading
│   ├── api/             # 69 BFF route handlers → platform API via apiFetch
│   ├── g/[token]/       # public guest pre-arrival form
│   └── dashboard/       # legacy redirect to /
├── components/
│   ├── route-error.tsx, route-loading.tsx, route-not-found.tsx  # shared route UI
│   ├── dashboard-app-shell.tsx, app-sidebar.tsx, site-header.tsx
│   ├── pos-page-shell.tsx, pms-page-shell.tsx
│   ├── feature: tenant-*, license-*, org-switcher, data-table (unused), ui/*
├── hooks/               # use-me, use-dashboard-stats, use-pms-tenant, use-pos-nav, …
├── lib/                 # api-client, pos-fetch, pms-api, schemas, roles, …
├── types/               # tenant, license, audit-log
├── tests/
├── proxy.ts             # security headers (CSP, HSTS, …)
└── package.json
```

---

## 4. Shared components status

| Component | Exists | Used by | Notes |
|-----------|--------|---------|-------|
| **RouteError** | YES | 11 `error.tsx` files | Card-based UI, digest display, reset + home |
| **RouteLoading** | YES | 11 `loading.tsx` files | Skeleton layout (not spinner) |
| **RouteNotFound** | YES | 3 dynamic `not-found.tsx` | Root `not-found` does not use it |
| **DataTable** | YES | **0** imports | 867-line shadcn demo; dead code |
| **EmptyState** | NO | — | Empty cases are inline per page |
| **PageHeader** | NO | — | `SiteHeader` title + `PosPageShell`/`PmsPageShell` h1 |
| **Breadcrumb** | YES (`ui/breadcrumb`) | ~1 page | `tenants/[id]/page.tsx` only |
| **DashboardAppShell** | YES | `(dashboard)/layout` | Sidebar + header + toaster |
| **PosPageShell** | YES | All `/pos/*` pages | Sub-nav + health alert |
| **PmsPageShell** | YES | All `/pms/*` pages | Sub-nav + admin context banner |

### RouteError / RouteLoading implementation (reference)

- `components/route-loading.tsx` — skeleton placeholders (preferred over per-page spinners for route transitions).
- `components/route-error.tsx` — structured error card with `reset()` and link to `/`.

### Inline loading vs RouteLoading

| Location | Pattern |
|----------|---------|
| Route transitions (core segments) | `RouteLoading` ✅ |
| `app/loading.tsx` | Custom `animate-spin` ❌ |
| Client `useEffect` fetches (POS/PMS/pages) | Inline `"Loading…"` / spinners on buttons |
| `tenants/page.tsx` provision overlay | Large `Loader2` spinner (long-running operation — intentional variant) |

---

## 5. Pages over 300 lines (need splitting)

| File | Lines | Suggested extractions |
|------|-------|------------------------|
| `app/(dashboard)/tenants/[id]/page.tsx` | **2103** | Profile form, modules, POS credentials, license panel, events timeline, danger zone dialogs |
| `app/(dashboard)/plans/page.tsx` | **1050** | Plan list table, create/edit forms, feature matrix |
| `app/(dashboard)/tenants/page.tsx` | **1029** | List/filters, provision wizard UI, export |
| `app/(dashboard)/owners/page.tsx` | **725** | Owner table, invite flow, role management |
| `app/(dashboard)/licenses/page.tsx` | **702** | List, filters, bulk actions, revoke dialog |
| `app/(dashboard)/licenses/[id]/page.tsx` | **808** | Detail header, activations table, history, blacklist |
| `app/(dashboard)/audit-log/page.tsx` | **498** | Filters, log table, export |
| `app/(dashboard)/pms/guest-forms/page.tsx` | **444** | Template list, field editor, share links |
| `app/(dashboard)/settings/page.tsx` | **352** | MFA sections, password, sessions |
| `app/(dashboard)/api-keys/page.tsx` | **316** | Key list, create/revoke dialogs |

### Components over 200 lines

| File | Lines | Notes |
|------|-------|-------|
| `components/data-table.tsx` | **867** | Unused template; candidate for removal or relocation |
| `components/tenant-create-wizard.tsx` | **626** | Shared — appropriate size for wizard |
| `components/license-generate-dialog.tsx` | **605** | Shared dialog |
| `components/tenant-list.tsx` | **590** | Shared list |
| `components/org-switcher.tsx` | **549** | Shared |

---

## 6. Missing files per route

| Route group | Missing (optional improvements) |
|-------------|--------------------------------|
| `/pos/*` (9 routes) | Segment `loading.tsx`, `error.tsx`; richer pages (several are JSON debug stubs) |
| `/pms/*` (14 routes) | Segment `loading.tsx`, `error.tsx`; optional `pms/layout.tsx` for shared tenant select |
| `/` (home) | `metadata` export; inherits loading/error from `(dashboard)` ✅ |
| Auth routes | `error.tsx` / `loading.tsx` (inherit root — usually fine) |
| `/g/[token]` | `error.tsx`, `loading.tsx` (public; inline loading in page today) |
| Dynamic POS org | `not-found.tsx` for unknown org id (optional) |

**Sidebar → page coverage:** All `AppSidebar` hrefs (`/`, `/tenants`, `/licenses`, `/pos`, `/pms`, `/plans`, `/owners`, `/audit-log`, `/api-keys`, `/settings`) resolve to existing `page.tsx` files. POS sub-links in `PosPageShell` and PMS sub-links in `PmsPageShell` also resolve.

---

## 7. API routes

**69** `app/api/**/route.ts` handlers. Pattern: server-side `apiFetch` from `@/lib/api-client` forwarding cookies to the platform API. Additional proxies:

- `app/api/pos/[...path]/route.ts` — POS service proxy
- `app/api/pms/[...path]/route.ts` — PMS service proxy
- `app/api/pms-public/[token]/route.ts` — public guest form
- `app/api/notifications/*` — notification BFF

Client pages typically call **`fetch('/api/...')`** (BFF), not `apiFetch` directly — consistent for browser, separate from server route implementation.

---

## 8. Page quality findings

### Metadata

**No `page.tsx` exports `metadata` or `generateMetadata`.** Root layout sets global title `"Stockix"`. Acceptable for an admin app but limits per-route titles in browser tabs (SiteHeader titles are client-only).

### `use client` discipline

| Pattern | Count / status |
|---------|----------------|
| Client pages with `"use client"` | 37 / 39 pages |
| Server pages | `(dashboard)/page.tsx` → `DashboardHome`; `login/page.tsx` → `LoginForm` + Suspense; `dashboard/page.tsx` redirect |
| Missing `use client` where hooks used | **None found** — auth and feature pages correctly marked |

### Suspense

Used on: `tenants/page`, `licenses/page`, `login`, `reset-password`, `accept-invite`.  
Most other client pages rely on **`useEffect` + local loading state** without Suspense — works but does not stream partial UI.

### Forms

**react-hook-form + zod** used on: `plans/page`, `tenants/[id]` profile, `tenant-users-panel`, license dialogs, settings MFA flows.  
PMS pages often use **controlled `useState` forms** inline — inconsistent but functional.

### Data tables

`@tanstack/react-table` is a dependency and **`DataTable` component exists but is never imported.** Lists use custom `<Table>` markup per page.

### Dialogs / sheets

**Dialog** from `@/components/ui/dialog` is the dominant pattern across PMS and admin pages. No centralized modal registry.

### Fetch patterns

| Layer | Pattern |
|-------|---------|
| Server API routes | `apiFetch` ✅ |
| Client pages | `fetch('/api/...')` widespread |
| POS client | `posApiFetch` → `/api/pms/...` |
| PMS client | `pmsJson` / `pms-fetch` → `/api/pms/...` |
| Notifications | `notification-bell.tsx` uses raw `fetch` to `/api/notifications/*` |

### Navigation / header titles

`dashboard-app-shell.tsx` `ROUTE_TITLES` covers core routes only. **POS and PMS paths fall through to generic `"Dashboard"`** in `SiteHeader` while `PosPageShell`/`PmsPageShell` show their own h1 — duplicated title semantics.

### Empty states

No shared **EmptyState** component. PMS routes generally handle `length === 0`; core list pages (tenants, licenses) have inline empty copy. Quality varies.

### Production readiness signals

| Check | Result |
|-------|--------|
| TODO/FIXME/HACK in app code | **None** |
| Hardcoded localhost | Present in **dev fallbacks** (`pos-health-alert`, `tenant-url`) — environment-aware |
| Accessibility | Mixed; some icon buttons use `aria-label` (e.g. copy password). No systematic audit. |
| Security | `proxy.ts` applies CSP, HSTS, frame options via `@repo/config` |

---

## 9. App shell and providers

| Piece | Implementation |
|-------|----------------|
| Root layout | `TooltipProvider`, Geist fonts, global metadata |
| Dashboard layout | Server auth check → `redirect('/login')` if `/auth/me` fails |
| Shell | `DashboardAppShell`: `SidebarProvider`, `AppSidebar`, `SiteHeader`, `Toaster` |
| Auth layout | Minimal centered container |
| React context | No app-wide data provider; hooks (`useMe`, `usePmsTenant`) + fetches |
| UI providers | `TooltipProvider`, `SidebarProvider`, per-page `TooltipProvider` on some tables |

---

## 10. Issues found

### Critical

- [ ] **`tenants/[id]/page.tsx` (~2100 lines)** — single file owns tenant detail, users, modules, POS creds, licenses, events, and destructive actions; high regression risk.
- [ ] **`components/data-table.tsx` unused (867 lines)** — dead shadcn scaffold; remove or move out of app bundle path to avoid accidental use.

### High

- [ ] **Root `app/error.tsx` and `app/loading.tsx` diverge** from `RouteError` / `RouteLoading` used everywhere else.
- [ ] **Oversized pages:** `plans`, `tenants`, `owners`, `licenses`, `licenses/[id]`, `audit-log` (see §5).
- [ ] **No per-route metadata** on any page.
- [ ] **POS sub-pages** (`webhooks`, `flags`, `jobs`, `notifications`, etc.) are **JSON debug viewers** (~25 lines) — not production UI.
- [ ] **SiteHeader titles** do not map POS/PMS routes (shows "Dashboard" while shell shows real title).

### Medium

- [ ] **POS/PMS lack segment `error.tsx` / `loading.tsx`** — coarse boundaries only at `(dashboard)` level.
- [ ] **No shared `EmptyState` / `PageHeader`** — duplicated patterns across shells and pages.
- [ ] **Suspense underused** — most data loading is client-side `useEffect` without streaming.
- [ ] **DataTable / tanstack table unused** — lists reimplemented ad hoc; harder to keep sorting/filtering consistent.
- [ ] **Form patterns split** — RHF+zod on admin forms vs raw state on many PMS forms.
- [ ] **Client fetch not centralized** — many raw `fetch('/api/...')` calls vs `auth-client` / typed helpers.

### Low / polish

- [ ] **Root `not-found.tsx`** could delegate to `RouteNotFound` for visual consistency.
- [ ] **Breadcrumbs** only on tenant detail — other deep routes (license detail, org detail) use back links only.
- [ ] **Button-level spinners** (`Loader2` + `animate-spin`) are fine; no change required unless standardizing on a shared `LoadingButton`.
- [ ] **`/dashboard` legacy redirect** — harmless; document or remove route folder when safe.

---

## 11. What needs to be built

### Shared components

- [ ] **EmptyState** — icon, title, description, optional CTA (used by list pages + PMS tables).
- [ ] **PageHeader** (optional) — unify `SiteHeader` title map + shell h1 duplication.
- [ ] **Client API helper** — thin wrapper over `fetch('/api/...')` with typed errors (mirror server `apiFetch` ergonomics).
- [ ] **Decide fate of `DataTable`** — adopt for list pages or delete demo component.

### Route convention files

- [ ] `app/error.tsx` → wrap **RouteError**
- [ ] `app/loading.tsx` → wrap **RouteLoading**
- [ ] `app/not-found.tsx` → wrap **RouteNotFound** (optional)
- [ ] `app/(dashboard)/pos/layout.tsx` + `error.tsx` + `loading.tsx` (optional group)
- [ ] `app/(dashboard)/pms/layout.tsx` + `error.tsx` + `loading.tsx` (optional group)

### Refactors (largest impact)

- [ ] Split **`tenants/[id]/page.tsx`** into `components/tenant-detail/*`
- [ ] Split **`plans/page.tsx`**, **`tenants/page.tsx`**, **`owners/page.tsx`**, **`licenses/page.tsx`**
- [ ] Replace POS JSON stub pages with real tables/cards or hide behind dev flag
- [ ] Extend **`ROUTE_TITLES`** (or derive from pathname) for `/pos/*` and `/pms/*`

### Pattern consistency

- [ ] Align PMS forms with **react-hook-form + zod** where validation matters
- [ ] Add **`generateMetadata`** or static **metadata** on top-level routes
- [ ] Consider **`pms/layout.tsx`** hoisting `PmsTenantSelect` once per section

---

## 12. What is already good

- **Consistent RouteError / RouteLoading wrappers** on all core `(dashboard)` admin segments (tenants, licenses, plans, settings, etc.).
- **Contextual RouteNotFound** on tenant, organization, and license detail routes.
- **Server-side auth gate** in `(dashboard)/layout.tsx` before rendering shell.
- **BFF layer** with widespread **`apiFetch`** on API routes and dedicated POS/PMS proxies.
- **Feature shells** (`PosPageShell`, `PmsPageShell`) with sub-navigation matching implemented routes.
- **Capability-gated sidebar** (`useMe`, `usePosNavVisible`) — Plans, Audit log, API keys, Settings respect permissions.
- **react-hook-form + zod** on high-value flows (license generate/assign, tenant profile, user invite).
- **Security headers** centralized in `proxy.ts` from shared config.
- **Hooks layer** for cross-cutting client state (`use-me`, `use-dashboard-stats`, `use-pms-tenant`).
- **PMS pages** generally include **empty-state handling** for lists.
- **Home overview** delegated to `DashboardHome` component (thin server page).
- **No outstanding TODO/FIXME** markers in dashboard TypeScript sources.

---

## 13. Shared vs local — guidance

| Concern | Shared (keep) | Local (per route/module) |
|---------|---------------|---------------------------|
| Route error/loading UI | `route-error`, `route-loading` | — |
| App chrome | `dashboard-app-shell`, `app-sidebar`, `site-header` | — |
| Module chrome | `pos-page-shell`, `pms-page-shell` | Page-specific tables/forms |
| Tenant/license flows | `tenant-list`, `tenant-create-wizard`, `license-*-dialog`, `tenant-users-panel` | — |
| List empty states | **Future `EmptyState`** | Row actions, columns |
| Data fetching (server) | `api-client` | Route-specific query params |
| Data fetching (client) | `pos-fetch`, `pms-api`, hooks | Page `useEffect` loaders |
| Types | `types/*` | Inline types OK for small PMS DTOs |

---

## 14. File inventory counts

| Category | Count |
|----------|-------|
| `page.tsx` | 39 |
| `error.tsx` | 12 (+ `global-error.tsx`) |
| `loading.tsx` | 12 |
| `not-found.tsx` | 4 |
| `layout.tsx` | 3 |
| API `route.ts` | 69 |
| Top-level `components/*.tsx` (non-ui) | ~25 feature + 3 route helpers |
| `components/ui/*` | ~30 shadcn primitives |
| `hooks/*` | 7 |
| `lib/*` | 14 |

---

*End of audit. No files were modified during this pass.*
