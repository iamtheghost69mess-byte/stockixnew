# Stockix — Missing & Partial Implementation Audit
_Generated: 2026-05-13 · Follow-up implementation through same date_

> Original findings were from static inspection of
> `packages/db/src/schema.ts`, `apps/api/src/license-http.ts`, `apps/api/src/index.ts`,
> `apps/api/src/middleware/rbac.ts`, `apps/api/src/plan-limits.ts`, `apps/api/src/org-provision.ts`,
> `apps/dashboard/app/(dashboard)/licenses/**`, `apps/dashboard/app/(dashboard)/tenants/**`,
> `apps/dashboard/components/org-switcher.tsx`, `apps/dashboard/components/tenant-list.tsx`,
> `apps/dashboard/components/tenant-status-badge.tsx`, `apps/dashboard/components/license-*`,
> `apps/dashboard/hooks/use-organizations.ts`, `apps/dashboard/lib/roles.ts`,
> `packages/shared/src/roles.ts`, `infra/worker-service/src/worker.ts`, and the
> Bigcapital `services/stockix-finance/packages/server/src/modules/Roles/**`.
> Subsequent work in this monorepo closed most Stockix gaps; the **Summary Table** is re-verified against the code. Older sections below may still read like the pre-fix audit.

---

## Re-audit note (implementation status)

Implementation in this repo (through **2026-05-13**) covers most **Critical** and **High** Stockix API/dashboard items from the original audit, including: license RBAC in `apps/api/src/middleware/rbac.ts`; `validFrom` + license extend/generate/assign flows in schema and `license-http.ts`; worker-driven license expiry and API gates (org create, agreed tenant operations); org CRUD audit hooks; tenant suspend / stop-provisioning confirmations (no raw `window.confirm` for stop); retry provisioning API + UI; org detail route; `OrgSwitcher` empty state, status badges, rename/suspend from UI; shared `lib/date-format.ts`, `lib/api-errors.ts`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, and dashboard `@repo/shared` role re-exports.

**Per-organization Stockix access:** migration `owner_organization_access`, helpers in `apps/api/src/org-access-scope.ts`, enforcement on tenant org routes for scoped `support_agent`, super-admin **GET/POST** `/tenants/:tenantId/organization-access` and **DELETE** `.../organization-access/:accessId`, dashboard **`TenantOrgAccessPanel`** on the tenant detail page for super admins, and tests in `apps/api/tests/org-access-scope.test.ts` plus RBAC coverage in `apps/api/tests/rbac.test.ts`. Tenant detail also includes a collapsible **license history** for the tenant’s licenses.

**Still intentionally out of scope (product / other service):** **Bigcapital** containers do not read Stockix licenses for end-user login; that requires finance-service integration. A full **Team / cross-org** matrix (`tenant_team_members` epic in §4C) is not implemented—scoped support access is Stockix-side only.

The **Summary Table** below was **re-verified against the repo** (same date as the header). Rows **44–45** remain product/architecture notes, not missing Stockix code.

---


## Summary Table (re-verified against repo)

| # | Area | Status | Priority |
|---|------|--------|----------|
| 1 | License `validFrom` / start-date column | ✅ Done (`valid_from` migration + API/UI) | — |
| 2 | License `expiresAt` column | ✅ Done | — |
| 3 | License `isPerpetual` column | ✅ Done | — |
| 4 | License `tenantId` FK | ✅ Done | — |
| 5 | License + Tenant `planSlug` sync | ✅ Done (assign + generate) | — |
| 6 | License `maxOrganizations` column | ✅ Done | — |
| 7 | Create license w/ custom start + end date | ✅ Done (`POST /licenses/generate` + `validFrom` / `expiresAt`) | — |
| 8 | View full license dates in UI | ✅ Done (license detail + tenant license block) | — |
| 9 | Extend / update license expiry route | ✅ Done (`POST /licenses/:id/extend`; `PATCH` remains notes-only) | — |
| 10 | License expiry blocks tenant login / API | ✅ Done (Stockix API returns `LICENSE_EXPIRED` / `NO_ACTIVE_LICENSE` where wired) | — |
| 11 | License expiry blocks org creation | ✅ Done (org-provision / plan gates) | — |
| 12 | Background "mark expired" job | ✅ Done (`infra/worker-service` license expiry tick) | — |
| 13 | Tenant detail shows linked license w/ dates + status | ✅ Done | — |
| 14 | Assign existing license to tenant from tenant detail page | ✅ Done (picker + `LicenseAssignDialog`) | — |
| 15 | Organizations section labeled as "sub-organizations of tenant" | ✅ Done (empty state + copy in `OrgSwitcher`) | — |
| 16 | Org cards: created date | ✅ Done (`OrgSwitcher` list shows `Created {formatDate(createdAt)}`) | — |
| 17 | Org status badge color-coded (green/yellow/red/gray) | ✅ Done (`OrgStatusBadge`) | — |
| 18 | Org action: open subdomain | ✅ Done | — |
| 19 | Org action: suspend (UI) | ✅ Done (org detail + `OrgSwitcher` card actions) | — |
| 20 | Org action: rename (UI) | ✅ Done | — |
| 21 | Org empty state | ✅ Done (`OrgSwitcher` dashed card) | — |
| 22 | OrgSwitcher: name validation before submit | ✅ Done (`lib/validate-org-name.ts`; create/rename in `OrgSwitcher` + org detail rename) | — |
| 23 | OrgSwitcher: loading state on Create | ✅ Done | — |
| 24 | OrgSwitcher: provisioning non-clickable + spinner | ✅ Done | — |
| 25 | OrgSwitcher: failed orgs show error on hover | ✅ Done | — |
| 26 | OrgSwitcher: suspended distinct + non-clickable | ✅ Done | — |
| 27 | OrgSwitcher: suspend from dropdown | ✅ Done (`DropdownMenuGroup` per active org: Open / Rename / Suspend) | — |
| 28 | OrgSwitcher: rename from dropdown | ✅ Done (same) | — |
| 29 | OrgSwitcher: polling stops correctly | ✅ Done | — |
| 30 | Dedicated org detail page | ✅ Done (`tenants/[id]/organizations/[orgId]`) | — |
| 31 | Suspend Tenant button + confirmation | ✅ Done (tenant detail slug-confirm dialog) | — |
| 32 | Suspend → stops Docker containers | ✅ Done | — |
| 33 | Suspend → updates `tenants.status` | ✅ Done | — |
| 34 | Reactivate Tenant button + flow | ✅ Done | — |
| 35 | Reactivate → restarts Docker containers | ✅ Done | — |
| 36 | Reactivate is separate API from provisioning | ✅ Done | — |
| 37 | UI updates status after reactivate | ✅ Done | — |
| 38 | Live provisioning progress display | ✅ Done | — |
| 39 | Retry failed provisioning button | ✅ Done (`POST .../retry-provision` + UI) | — |
| 40 | RBAC: license routes protected per role | ✅ Done (`rbac.ts`: licenses/fingerprints; POS activate/verify exempt) | — |
| 41 | RBAC: org write routes use `super_admin` | ⚠️ Superseded: org **writes** allow `support_agent` (scoped when `owner_organization_access` rows exist) | — |
| 42 | RBAC: org routes accessible to `support_agent` | ✅ Done (non-GET org routes + provision; list/detail scoped) | — |
| 43 | Per-organization RBAC (scoped Stockix access) | ✅ Done (`owner_organization_access` + API + `TenantOrgAccessPanel`) — **not** full `tenant_team_members` matrix | — |
| 44 | Bigcapital role scope: per tenant vs per org | ⚠️ OOS — separate MySQL per org; no Stockix↔Bigcapital role sync | High |
| 45 | Bigcapital: give user access to org A but not org B | ⚠️ OOS — invite per stack; no shared identity across org DBs | High |
| 46 | Empty state: tenant list | ✅ Done | — |
| 47 | Empty state: org list on tenant detail | ✅ Done (via `OrgSwitcher` on tenant page) | — |
| 48 | Empty state: license list | ✅ Done | — |
| 49 | Empty state: provisioning events | ✅ Done (dashed empty card + helper copy) | — |
| 50 | Global error boundary (`app/error.tsx`) | ✅ Done + `global-error.tsx`, `not-found.tsx` | — |
| 51 | Friendly API error messages in UI | ✅ Done (`formatApiError` on license detail failures + existing org/tenant usage) | — |
| 52 | Skeleton loaders consistent | ✅ Done | — |
| 53 | Buttons disabled during async ops | ✅ Done | — |
| 54 | Initial-load loading state on tenant detail | ✅ Done | — |
| 55 | Status badge consistency (tenant list / detail / org switcher) | ✅ Done for orgs (`OrgStatusBadge`); tenant paths use `TenantStatusBadge` | — |
| 56 | Date format consistency across pages | ✅ Done (`formatDateTime` for tenant list registration column; shared `lib/date-format` elsewhere) | — |
| 57 | Confirm dialog on every destructive action | ✅ Done (tenant **list** delete: two-step `Dialog` + typed slug + volumes choice; list suspend/stop already used dialogs) | — |

---

> **About §1–§6 below:** The narrative, code excerpts, RBAC snippets, and matrices are mostly the **original audit text** and are **not** fully reconciled with the current tree (they predate `rbac.ts` changes, `OrgSwitcher` refactors, `org-status-badge`, `owner_organization_access`, etc.). **Trust the Summary Table above** for pass/fail; treat the body as deep-dive history unless you refresh a section explicitly.

---

## 1. License System

### Schema findings (`packages/db/src/schema.ts`, lines 267–309)

`licenses` table columns:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | defaultRandom |
| `license_key` | text NOT NULL | unique index |
| `product` | text NOT NULL | default `"platform"` (platform / pos_desktop / bundle) |
| `plan_slug` | text NOT NULL | default `"starter"` — **also lives on `tenants.plan_slug`** (synced on assign/generate) |
| `tenant_id` | uuid FK → tenants.id | **direct FK present**, `onDelete: "set null"`, nullable |
| `status` | text NOT NULL | default `"unassigned"` |
| `activated_at` | timestamp tz | set when assigned to tenant — historically the de-facto start; **`valid_from`** is the explicit start when set |
| `valid_from` | timestamp tz | **added** (migration `0015_license_valid_from`); optional; used for effective period checks |
| `expires_at` | timestamp tz | **present** |
| `is_perpetual` | boolean NOT NULL | **present**, default `false` |
| `max_activations` | integer NOT NULL | default 1 |
| `max_organizations` | integer NOT NULL | **present**, default 1, -1 = unlimited |
| `activation_count` | integer NOT NULL | default 0 |
| `grace_period_days` | integer NOT NULL | default 7 |
| `notes` | text | nullable |
| `created_by_id` | uuid FK → owners.id | set null |
| `revoked_at` / `revoked_by_id` / `revoke_reason` | nullable | |
| `created_at` / `updated_at` | timestamp tz NOT NULL | defaultNow |

### ✅ Working
- `expiresAt`, `isPerpetual`, `maxActivations`, `maxOrganizations`, `gracePeriodDays` all present.
- `tenantId` is a direct FK on `licenses`.
- `planSlug` is on both `licenses` and `tenants` and **kept in sync**: see `licenses.generate` (`apps/api/src/license-http.ts:146`) and `licenses/:id/assign` (`apps/api/src/license-http.ts:653`) — both update `tenants.planSlug`.
- License detail endpoint (`GET /licenses/:licenseId`, `apps/api/src/license-http.ts:532`) returns full details: `licenseKey, product, planSlug, status, tenantId, isPerpetual, activatedAt, expiresAt, maxActivations, activationCount, gracePeriodDays, revokedAt, revokeReason, notes, createdAt, createdByName, revokedByName, activations[]`.
- License detail UI (`apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx`) renders **all** of those.
- POST `/licenses/generate` (`license-http.ts:81`) accepts `expiresAt` and `isPerpetual`.
- Auto-create-license on tenant provision: confirmed in `apps/api/src/index.ts:1066–1108` — after a successful `tenant.provision` job, the API either assigns an `assignExistingLicenseId` license or auto-generates a new perpetual platform license linked to the tenant.
- Multiple licenses per tenant (history) is supported — schema has no `unique(tenantId)` on licenses.
- License panel on tenant detail page (`apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx:299–389`) loads via `/api/licenses?tenantId={id}&pageSize=1` and renders: key, status badge, product, plan, expires date, activation count, grace period, "View full license details" link, "Revoke" button (super_admin only).
- `LicenseStatusBadge` (`apps/dashboard/components/license-status-badge.tsx`) is color-coded (active=emerald, unassigned=secondary, revoked=destructive, expired=amber).
- `maxOrganizations` IS enforced at org creation (`apps/api/src/plan-limits.ts:34–53` + `apps/api/src/index.ts:2496–2505` returning HTTP 402 "PLAN_LIMIT_REACHED").
- `maxActivations` IS enforced inside `/licenses/activate` (`license-http.ts:396, 450`).

### ⚠️ Partial
- **`POST /licenses/generate` accepts an end date but NOT a custom start date.** `activatedAt` is set to `new Date()` on assignment only (license-http.ts:127), and to `now` again when assigned via `POST /licenses/:id/assign` (line 642–650). There is **no way to back-date or future-date a license's start**. The Zod schema (`license-http.ts:69–79`) has no `activatedAt` / `startDate` / `validFrom` field at all.
- **License revoke is on the tenant detail page (`Revoke` button calling `/api/licenses/:id/revoke`)**, but **there is NO way from the tenant page to assign an _existing_ unassigned license to that tenant** — only the "Generate & assign license" path opens `LicenseGenerateDialog` (which always generates a new key). To assign an existing key you must go to `/licenses` list → row → "Assign to tenant" dropdown (`LicenseAssignDialog`).
- License notes are editable from the detail page (`PATCH /licenses/:licenseId` supports only `{ notes }` — `license-http.ts:600–620`). No other field is mutable.

### ❌ Missing
- **No `startDate` / `validFrom` column on `licenses`.** Add to `packages/db/src/schema.ts` and surface in the API + UI. `activatedAt` doubles as start in current code but cannot be set independently.
- **No route to extend or update expiry.** `PATCH /licenses/:licenseId` (license-http.ts:602–620) is restricted to `{ notes }` via `.strip()`. Need a `POST /licenses/:id/extend` or expand the PATCH body to accept `expiresAt` / `isPerpetual`.
- **License expiration is NOT enforced on tenant login / API access.** Grepping `apps/api/src` and the Bigcapital server shows `license_expired` is only returned inside the `POST /licenses/activate` POS flow (`license-http.ts:340–343`). A tenant whose `licenses.expiresAt` is in the past can still:
  - Log into the Stockix-dashboard owner side (irrelevant — owner ≠ tenant user)
  - Reach their Bigcapital stack (its containers don't query the Stockix license at all — searched `services/stockix-finance/packages/server/src` for `license_expired`, `expiresAt`, no matches in the auth or middleware layers)
  - Provision more organizations (only `maxOrganizations` count, not license status, is checked in `canCreateOrganization`)
- **No background job to flip `status` from `active` → `expired` when `expiresAt` passes.** `licenses.status` value `"expired"` is queried in analytics (`license-http.ts:174`) but nothing _writes_ it. The `apps/api/src` codebase has no scheduler that scans for expired licenses; the worker (`infra/worker-service/src/worker.ts`) only handles `tenant.provision`, `tenant.deprovision`, `tenant.lifecycle`.
- **No "Assign existing license" action on the tenant detail page** (only the generate-new dialog).
- **Tenant detail page does NOT show license `validFrom` / start date** (because the column doesn't exist; only `activatedAt` is shown in the license detail page, never on the tenant page).
- The tenant page only fetches the **first** matching license (`pageSize=1`); there is no history view of all licenses ever assigned to a tenant.

---

## 2. Organization UI

### ✅ Working
- `OrgSwitcher` (`apps/dashboard/components/org-switcher.tsx`):
  - **Loading state on Create button**: `<Loader2 className="animate-spin" />` while `submitting` (line 268).
  - **Provisioning orgs**: `DropdownMenuItem disabled` with `<Loader2 animate-spin />` (lines 70–79).
  - **Failed orgs**: tooltip on hover showing `org.provisioningError` or fallback "Provisioning failed" (lines 94–113).
  - **Suspended orgs**: `DropdownMenuItem disabled` with `Suspended` secondary badge (lines 81–92).
  - **Polling**: stops automatically — `useEffect` only runs the 5 s interval while `hasProvisioning === true` (lines 123–131). When all orgs are active/failed/suspended, no further polling.
  - **402 Plan-limit handling**: dedicated toast "Upgrade your plan to add more organizations." (line 163).
- API routes exist for full CRUD (`apps/api/src/index.ts`):
  - `GET    /tenants/:tenantId/organizations` (line 2446)
  - `POST   /tenants/:tenantId/organizations` (line 2474) — checks `canCreateOrganization` → 402 if over plan
  - `GET    /tenants/:tenantId/organizations/:orgId` (line 2536)
  - `PATCH  /tenants/:tenantId/organizations/:orgId` (line 2566) — rename only (`name`)
  - `DELETE /tenants/:tenantId/organizations/:orgId` (line 2611) — actually **soft-suspends** by setting `status='suspended'`, and refuses to suspend the primary (first-created) org (line 2631)
- Each org has its own Bigcapital Docker stack (separate MySQL, Mongo, Redis) — confirmed by `dockerComposeProjectForOrgSlug` usage and `enqueueOrgProvisioning` enqueuing a `tenant.provision` job per org (`apps/api/src/org-provision.ts:61`).

### ⚠️ Partial
- **Section labeling on tenant detail page** (`tenants/[id]/page.tsx:291–297`):
  - Heading: just "Organizations" — does **not** say "Sub-organizations of {tenant.name}".
  - One-line description: "Each organization runs its own Bigcapital stack. Use the links below for local dev (host port is required)." — describes mechanics, not parent→child relationship.
  - No visual hierarchy / indentation / breadcrumb showing `Tenant → Organizations`.
- **Org cards** (`org-switcher.tsx:213–235`):
  - Shows: name, slug (monospace), subdomain, "Open app" link, status badge.
  - Status badge uses `Badge variant="outline"` for **every** status — no color coding (active green, provisioning yellow, failed red, suspended gray).
  - **Created date is NOT shown.**
- **OrgSwitcher name validation** (line 144): only checks `name.trim()` is non-empty. No min/max length client-side (server allows up to 100 chars from `Input maxLength={100}`); no slug-safe / character validation client-side.

### ❌ Missing
- **No dedicated org detail page** — Glob for `apps/dashboard/app/(dashboard)/tenants/[id]/organizations/**/*` returned **zero files**. API supports it; dashboard does not.
- **No "Suspend org" action in the UI** (dropdown or card) despite `DELETE /tenants/:tenantId/organizations/:orgId` setting status to `suspended`.
- **No "Rename org" action in the UI** despite `PATCH /tenants/:tenantId/organizations/:orgId` accepting `{ name }`.
- **No empty state when zero orgs** — when `organizations.length === 0` the UI just shows an empty dropdown with only "+ Add Organization" and the list `<ul>` is conditionally rendered away. Should show a card-style empty state with explanation + Add button.
- **No color-coded status badges** on the org card list (lines 229–231 use plain outline badge).
- **No created-at column** on the org card list.
- **No primary-organization indicator** — the API treats the first-created org as primary (`/organizations/:orgId` DELETE returns `CANNOT_SUSPEND_PRIMARY`) but the UI gives no hint of this.
- **Files to add / edit**:
  - **New file**: `apps/dashboard/app/(dashboard)/tenants/[id]/organizations/[orgId]/page.tsx` (org detail).
  - **Edit**: `apps/dashboard/components/org-switcher.tsx` — add dropdown actions (Open, Rename, Suspend), empty-state component, color-coded status, created date, primary badge.
  - **New file**: `apps/dashboard/components/org-status-badge.tsx` (mirror `tenant-status-badge.tsx`).
  - **Edit**: `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` — relabel section to "Sub-organizations of {tenant.name}", add hierarchy callout, count badge.

---

## 3. Tenant Lifecycle (Suspend / Reactivate)

### ✅ Working
- **Suspend Tenant button** exists in the Danger Zone of the tenant detail page (`tenants/[id]/page.tsx:489–505`) and in the tenant list dropdown (`tenant-list.tsx:334–343`).
- Calls `POST /api/tenants/:id/suspend` → `apps/api/src/index.ts:2848` → enqueues `tenant.lifecycle` job with `command: "stop"`, `status: "suspended"`.
- Worker handler (`infra/worker-service/src/worker.ts:290–313`) runs `execa("docker", ["compose", "-p", composeProjectName, "stop"])` — Docker containers are **actually stopped**.
- After the lifecycle job completes, `runWorkerPostHook` updates `tenants.status` and `tenant_deployments.status` to `"suspended"` (`apps/api/src/index.ts:1126–1137`).
- **Reactivate** flow is symmetric: `POST /api/tenants/:id/reactivate` (line 2910) enqueues `tenant.lifecycle` job with `command: "start"`, `status: "active"` → worker runs `docker compose start` → status flips back.
- Reactivate is a **separate API route** from provisioning (not `POST /tenants`).
- After reactivate, the tenant detail UI calls `loadTenant()` to refetch (line 515). The tenant list page does an optimistic update + visibility refetch.
- **Provisioning progress is shown live**: `tenants/[id]/page.tsx:136–143` polls `loadTenant + loadEvents` every 2.5 s while `isProvisioning`. Provisioning events table (lines 438–478) renders phase + level-colored messages. The tenant list page also has a SSE stream (`/api/tenants/provision-stream/...`) with elapsed seconds.
- **Stop provisioning** mid-flight is supported via `POST /api/tenants/:id/provision-stop` and `/api/tenants/provision-stop/:correlationId` (lines 537 / 425).

### ⚠️ Partial
- **No confirmation dialog before suspend** on the tenant detail page Danger Zone — clicking "Suspend tenant" calls `fetch` immediately (lines 491–500). Likewise on the tenant list dropdown (`tenant-list.tsx:335`).
- **Stop provisioning** in `tenants/[id]/page.tsx:528` uses `globalThis.confirm(...)` (native browser dialog) instead of the in-app `<Dialog>` component used elsewhere.
- After suspension, the tenant **cannot** log into Bigcapital because the Docker stack is fully stopped — there is no `/auth/login` to reach. But there is **no explicit license/status gate at the application layer** that would refuse a logged-in user mid-session. If they had a valid session cookie before suspension, they'd lose access only when their HTTP call fails to reach the stack.

### ❌ Missing
- **No confirmation dialog** for the Suspend action (tenant detail or tenant list).
- **No "Retry failed provisioning" button** — once `tenant.provision` fails, the only path is Delete + recreate. The Danger Zone has Suspend / Reactivate / Stop / Delete, no Retry.
- **No re-trigger of provisioning** for a deployment stuck in `provisioning` for too long beyond Stop. The readiness reconciler (`apps/api/src/index.ts:2976+`) only logs `readiness.observed` events; it doesn't restart anything.
- **Suspended tenant cannot be re-suspended cleanly** — the API returns `tenant_not_active` (409) but the UI dropdown does not check this and may show Suspend on a non-active tenant only if `status === "active"` (the guard exists, so this is OK).
- **Files to edit**:
  - `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` — wrap Suspend button in a `<Dialog>` with typed slug confirmation (mirror Delete flow).
  - `apps/dashboard/components/tenant-list.tsx` — add confirmation `<Dialog>` for Suspend/Reactivate/Stop instead of bare dropdown trigger.
  - `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` — add a "Retry provisioning" button when `tenant.status === "failed"` (or `deployment.status === "failed"`).
  - `apps/api/src/index.ts` — add `POST /tenants/:id/retry-provision` route enqueueing a fresh `tenant.provision` job.

---

## 4. RBAC

### Owner-side roles (`apps/dashboard/lib/roles.ts` + `packages/shared/src/roles.ts`)

| Role | Rank | Label | Description |
|---|---|---|---|
| `super_admin` | 3 | Super Admin | Full access to all features including billing, deletion, admin management |
| `support_agent` | 2 | Support Agent | Can view and manage tenants, trigger provisioning and sync. Cannot access billing or delete data |
| `billing_manager` | 1 | Billing Manager | Billing section access only |
| `read_only` | 0 | Read Only | View-only access |

> The dashboard re-declares these in `apps/dashboard/lib/roles.ts` instead of importing from `@repo/shared`. **Duplication risk** — they currently match.

### API enforcement (`apps/api/src/middleware/rbac.ts`)

```ts
export function requiredApiRole(pathname, method) {
  if (pathname === "/health") return null;
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/internal/jobs")) return null;
  if (pathname.startsWith("/owners")) {
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  if (pathname.startsWith("/tenants")) {
    if (pathname.includes("/provision")) return "support_agent";
    if (method === "GET") return "read_only";
    return "super_admin";
  }
  return "read_only"; // ← everything else, including /licenses, /plans, /fingerprints
}
```

### ✅ Working
- `GET /tenants` and `GET /tenants/:id/organizations` → `read_only` minimum (`read_only` can see orgs ✓).
- `POST /tenants/:id/organizations`, `PATCH .../organizations/:orgId`, `DELETE .../organizations/:orgId` → all match the `/tenants` write rule → `super_admin` only.
- Provisioning endpoints (`*/provision-stream*`, `*/provision-status*`, `*/provision-stop*`) → `support_agent` (matches "/provision" substring).

### ⚠️ Partial — RBAC Matrix for Organizations

| Action | API path | Required role | super_admin | support_agent | billing_manager | read_only |
|---|---|---|---|---|---|---|
| List orgs | `GET /tenants/:id/organizations` | read_only | ✅ | ✅ | ✅ | ✅ |
| Create org | `POST /tenants/:id/organizations` | super_admin | ✅ | ❌ | ❌ | ❌ |
| View org | `GET /tenants/:id/organizations/:orgId` | read_only | ✅ | ✅ | ✅ | ✅ |
| Rename org | `PATCH .../organizations/:orgId` | super_admin | ✅ | ❌ | ❌ | ❌ |
| Suspend org | `DELETE .../organizations/:orgId` | super_admin | ✅ | ❌ | ❌ | ❌ |

> **Gap**: `support_agent` description claims they can "manage tenants" but cannot create/rename/suspend sub-organizations. This is inconsistent. The "/provision" carve-out lets them trigger provisioning, but the org CRUD does not contain "/provision" in the path so falls through to super_admin.

### ❌ Missing
- **🔴 Critical RBAC bug — license routes**: `requiredApiRole` only special-cases `/owners` and `/tenants`. **All `/licenses/*` and `/plans/*` and `/fingerprints/*` routes require only `read_only`** (the catch-all return). That means a `read_only` operator can:
  - `POST /licenses/generate` — mint new license keys
  - `POST /licenses/:id/assign` — assign licenses to tenants
  - `POST /licenses/:id/revoke` — revoke licenses
  - `POST /licenses/:id/activations/:activationId/deactivate` — kill POS activations
  - `POST /fingerprints/blacklist` — blacklist any hardware fingerprint
  - `POST /licenses/activate` and `/licenses/verify-offline` are also bound to read_only (these are partly OK because they're called by POS clients, not owners; but they shouldn't even be inside the dashboard RBAC bubble).
  - **Fix**: extend `requiredApiRole` to include `if (pathname.startsWith("/licenses"))` with method-based rules (GET → read_only, generate/assign/revoke → super_admin or billing_manager; activate/verify-offline likely should be public/unauthenticated since POS clients use them). Same for `/fingerprints` writes.
- **No per-organization RBAC** anywhere. There is no concept of "owner X can manage org A but not org B". The owner-side RBAC is entirely role-based at the platform level. To add this you'd need:
  - A new join table `owner_organization_access(owner_id, organization_id, scope)`.
  - Middleware that, for any `/tenants/:tenantId/organizations/:orgId/*` route, also checks that join table.
  - Currently **does not exist**.
- **No `billing_manager` enforcement** anywhere — that role is declared but the middleware has no `/billing` or `/licenses` rule that uses it.
- **No audit log emitted for org CRUD**: `apps/api/src/index.ts` org routes (lines 2446–2650) do not call `logAudit` for create / rename / suspend. Compare with tenant suspend (line 2862) which does.
- **Files to edit**:
  - `apps/api/src/middleware/rbac.ts` — extend `requiredApiRole` with per-prefix rules for `/licenses`, `/fingerprints`, `/plans`, plus a special case to let `support_agent` manage `/tenants/:id/organizations`.
  - `apps/api/src/index.ts` — call `logAudit` inside org create / patch / delete handlers.
  - New file: `packages/db/src/schema.ts` — add `owner_organization_access` table (if per-org RBAC is desired).
  - `apps/dashboard/lib/roles.ts` — re-export from `@repo/shared` instead of redeclaring.

### Bigcapital internal RBAC (`services/stockix-finance/packages/server/src/modules/Roles/**`)

Discovered model:
- `roles` table inside each tenant's MySQL DB: `id, name, slug, description, predefined`. Slug `"admin"` is a hard-coded super-admin (returns `[{ action: "manage", subject: "all" }]` via `TenantAbilities.ts:37`).
- `role_permissions` table: `roleId, ability, subject, value` — CASL rules.
- `users` (TenantUser) table: each row has `roleId`, `systemUserId` (FK to a global Auth user), `inviteAcceptedAt`, `active`, `firstName/lastName/email`.
- `AuthorizationGuard` resolves CASL ability from the user's role+permissions, cached in an LRU.

**Critical implication**:
- Because each Stockix **organization** runs its own Bigcapital Docker stack with its own MySQL (per `apps/api/src/org-provision.ts` enqueuing a fresh `tenant.provision` per org), the `roles` / `users` / `role_permissions` tables are **per-org-instance, NOT per-tenant**.
- So when a tenant has multiple orgs, a Bigcapital user (= an `auth.users` system user, plus a per-stack `users.systemUserId` mapping) is set up **separately in each org's MySQL**, with potentially different roles in each.
- There is no shared identity layer between two orgs of the same tenant. They are entirely independent Bigcapital instances.

#### Bigcapital RBAC findings

| Question | Answer |
|---|---|
| What roles exist inside Bigcapital? | A single predefined `admin` (super) + arbitrary user-defined roles (created via `CreateRole.service.ts`) with granular permissions per `ability + subject`. No fixed `accountant` / `viewer` enum — fully dynamic. |
| Are roles scoped per organization or per tenant? | **Per organization** (per Bigcapital instance / per MySQL). |
| Same role across all orgs of a tenant? | **No** — each org has its own `roles` + `users` tables. A user must be re-invited and re-assigned a role in every org. |
| Can a user have access to org A but not org B? | **Yes, mechanically** — because each Bigcapital MySQL is independent, simply do not invite that user in org B. But there is **no central UI** to manage this and no identity sync between orgs. |

#### Gap: Per-org user access in Bigcapital
- There is no UI in either Stockix dashboard or Bigcapital that says "Give user `alice@acme.com` access to org A but not org B." The current pattern is implicit (don't invite her into B), and any user-management work has to be done **separately inside each Bigcapital org**.
- The Bigcapital `users` table joins to a global `systemUserId` (cross-tenant), but the role and `active` flag are per-org. If two orgs of the same tenant share the same `systemUserId` mapping, they would still have **two independent `users` rows** with two independent roles.
- **Proposed solution** (zero-code summary only):
  1. Add a Stockix-side `tenant_user_org_access(tenant_id, system_user_id, organization_id, role_slug, status)` table.
  2. When a tenant admin invites a user from a new Stockix-side "Team" page, write a row per org that admin selects.
  3. Provide a Stockix → Bigcapital webhook (or worker job) that, for each `(systemUserId, organizationId, role_slug)`, calls into the org's Bigcapital API to create the matching `users` row and assign the role.
  4. Surface a single "Team" tab on the tenant detail page (Stockix) listing users and a matrix `org × user → role`.
  5. RBAC enforcement remains inside each Bigcapital instance (CASL), but Stockix becomes the source of truth for cross-org assignment.

---

## 5. UI Professionalism

### ✅ Working
- **Empty state — tenant list** (`tenant-list.tsx:135–154`): nice dashed-border card with `<Building2>` icon, headline "No tenants yet", subtitle, and Add tenant CTA.
- **Empty state — license list** (`licenses/page.tsx:349–365`): full-row `<TableCell colSpan={8}>` with contextual message ("No results match your filters" vs "No licenses found") and Generate-first-license CTA.
- **Skeleton loaders** used in: licenses list (analytics cards + table rows), license detail (3 skeletons), tenant detail (3 skeletons), OrgSwitcher dropdown (200px wide skeleton).
- **Buttons disabled with `<Loader2>` spinners** during async operations: license generate, revoke, deactivate, blacklist, tenant suspend/reactivate/stop-provision/delete, org create.
- **Initial-load loading state** on tenant detail page (`tenants/[id]/page.tsx:150–158`).
- **Confirmation dialogs (Dialog component)** for: Delete tenant (two-step with typed-slug + volumes choice), Revoke license, Deactivate POS terminal, Blacklist hardware fingerprint.
- **Toast (`sonner`)** used consistently for success / copy / failure feedback.
- `TenantStatusBadge` is fully color-coded (`active`=emerald, `suspended`=secondary/gray, `provisioning`=amber+spin, `failed`=destructive, `terminated`=secondary).
- `LicenseStatusBadge` is fully color-coded (`active`=emerald, `unassigned`=secondary, `revoked`=destructive, `expired`=amber).

### ⚠️ Partial
- **Friendly API errors**: many places fall back to `toast.error("Revoke failed")` (license detail line 512), `setError(\`HTTP ${res.status}\`)` (tenant detail loadTenant line 80), or unstructured `setError(String(e))`. No mapping of error codes (`tenant_busy`, `license_already_assigned`, `PLAN_LIMIT_REACHED`, `mfa_required`) to plain-English copy in one central place. The tenants page does map `mfa_required` (line 533) and `tenant_not_found` (multiple), but most others are raw.
- **Empty state — provisioning events** (`tenants/[id]/page.tsx:449`): plain `<p>No provisioning events recorded.</p>` text only. No icon, no help text, no visual treatment to match the other empty states.
- **Confirmation dialogs**: inconsistent — some use the in-app `<Dialog>`, others use `globalThis.confirm()` (Stop provisioning on tenant detail line 528, removeTenant in tenant list page 111, Stop provisioning in tenant list 266). And Suspend has **no** confirm.
- **Date formatting** is inconsistent across pages:
  - License list / detail: `format(new Date(d), "PP")` and `"PPp"` (date-fns).
  - Tenant detail: `new Date(t.createdAt).toLocaleString()` and `.toLocaleTimeString()`.
  - Tenant list: `new Date(t.registrationCompletedAt).toLocaleString()`.
  - OrgSwitcher: dates are not displayed.
  - No single `lib/date-format.ts` helper.
- **`org-switcher.tsx` imports `toast` from `@/components/reusabletoast`** while the rest of the dashboard imports from `sonner`. Two different toast implementations in use.

### ❌ Missing
- **No empty state when an org tenant has zero organizations** — `org-switcher.tsx` falls through to a working dropdown with only "+ Add Organization" inside, and the `<ul>` summary list is conditionally hidden (line 212 `organizations.length > 0`). Should be a card-style empty state like `TenantList`.
- **No global error boundary** — `apps/dashboard/app/error.tsx` and `apps/dashboard/app/global-error.tsx` both do not exist (glob check). A runtime exception in any page falls to Next.js default UI.
- **No 404 / not-found page** for the dashboard (`apps/dashboard/app/not-found.tsx` not found by glob — confirm separately, but no result appeared in `(dashboard)/**/page.tsx` enumeration).
- **Status-badge inconsistency between tenant pages and org cards**:
  - Tenant page → uses `TenantStatusBadge` (colored).
  - License pages → uses `LicenseStatusBadge` (colored).
  - **Org status in `org-switcher.tsx:229–231` → plain `Badge variant="outline"`** for every status. No `OrgStatusBadge` component exists.
- **No confirm dialog on Suspend tenant** (the most destructive action besides delete) — see Section 3.
- **No confirm dialog on Suspend org / Delete org** (these endpoints exist but the UI never calls them, so the gap is "missing entirely" rather than "missing confirm").
- **Files to add / edit**:
  - **New file**: `apps/dashboard/app/error.tsx` and `apps/dashboard/app/global-error.tsx`.
  - **New file**: `apps/dashboard/app/not-found.tsx`.
  - **New file**: `apps/dashboard/lib/date-format.ts` (centralize `format(d, "PP")` / `"PPp"`).
  - **New file**: `apps/dashboard/lib/api-errors.ts` (map error codes → user copy).
  - **New file**: `apps/dashboard/components/org-status-badge.tsx`.
  - **Edit**: `apps/dashboard/components/org-switcher.tsx` — replace `reusabletoast` with `sonner` for consistency; add empty state; use `OrgStatusBadge`.
  - **Edit**: `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` — replace `globalThis.confirm` with `<Dialog>` for Stop provisioning + Suspend; switch dates to centralized helper.
  - **Edit**: `apps/dashboard/components/tenant-list.tsx` — wrap dropdown actions in confirmation dialogs.

---

## Implementation Priority Queue

### 🔴 Critical (blocks real use / security)

1. **License routes fall through to `read_only` permission** — `apps/api/src/middleware/rbac.ts` — extend `requiredApiRole` to handle `/licenses` (GET = `read_only`, POST/PATCH/DELETE = `super_admin`; `/licenses/activate` + `/licenses/verify-offline` should be **public** since POS clients use them and current dashboard middleware already requires an owner JWT to call them — separate them into a sibling Hono router or skip auth for those two).
2. **License expiry is never enforced after `/licenses/activate`** — add either:
   - A periodic worker job (extend `infra/worker-service/src/worker.ts`) that flips `licenses.status` from `active` → `expired` when `expiresAt < now()` and is not `isPerpetual`.
   - A middleware that rejects critical tenant actions (login, org create, license assign) when the tenant's active license has expired.
3. **No confirmation on Suspend tenant** — `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` and `apps/dashboard/components/tenant-list.tsx` — wrap Suspend in a `<Dialog>` with typed-slug confirmation (mirror Delete tenant flow).

### 🟡 Important (incomplete feature)

1. **No license `validFrom` / `startDate` column** — `packages/db/src/schema.ts` (`licenses` table) — add `valid_from timestamp tz` and surface in `POST /licenses/generate` body, license detail UI, tenant license panel.
2. **No "Extend license" route** — `apps/api/src/license-http.ts` — add `POST /licenses/:licenseId/extend` body `{ expiresAt?: string; isPerpetual?: boolean }` with `super_admin` requirement and audit log; surface in the license detail UI as an "Extend" button next to "Revoke".
3. **No dedicated org detail page** — new `apps/dashboard/app/(dashboard)/tenants/[id]/organizations/[orgId]/page.tsx` — show name, slug, subdomain, status (colored), created at, primary-org indicator, last error, Rename / Suspend actions, link back to tenant.
4. **No Suspend / Rename actions in OrgSwitcher** — `apps/dashboard/components/org-switcher.tsx` — add dropdown items wired to `DELETE` and `PATCH` org endpoints; confirmation dialogs required.
5. **No retry of failed provisioning** — `apps/api/src/index.ts` add `POST /tenants/:id/retry-provision`; `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` add Retry button when failed.
6. **Org status badges not color-coded** — new `apps/dashboard/components/org-status-badge.tsx` mirroring `tenant-status-badge.tsx`.
7. **Tenant detail does not allow "assign existing license"** — `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` — add a second button next to "Generate & assign license" that opens `LicenseAssignDialog` with a tenant-scoped picker of `unassigned` licenses.
8. **Audit log gap for org CRUD** — `apps/api/src/index.ts` (lines 2474, 2566, 2611) — call `logAudit(...)` with actions `org.created` / `org.renamed` / `org.suspended`.
9. **Per-organization RBAC** — design + new `owner_organization_access` table + middleware; required for support_agent to safely manage one customer's orgs without seeing all.
10. **Cross-org user access design for Bigcapital** — per Section 4C gap; design a Stockix-side Team table that fans out into each Bigcapital instance.

### 🟢 Polish (nice to have)

1. **Section heading clarity** — `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx:292` — rename "Organizations" → "Sub-organizations of {tenant.name}" + count badge + descriptive intro.
2. **Org empty state** — `apps/dashboard/components/org-switcher.tsx` — add dashed-border `<Card>` empty state when `organizations.length === 0` (mirror `tenant-list.tsx:135`).
3. **Provisioning events empty state** — `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx:449` — proper empty-state with icon + help text.
4. **Centralize date formatting** — new `apps/dashboard/lib/date-format.ts` — replace ad-hoc `.toLocaleString()` and `format(..., "PP")` calls.
5. **Centralize API error → user-friendly message** — new `apps/dashboard/lib/api-errors.ts`.
6. **Add `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`** to the dashboard.
7. **Replace `globalThis.confirm()` calls** with the in-app `<Dialog>` component (3 sites: stop provisioning in detail + list, delete tenant in list).
8. **Unify toast imports** — `apps/dashboard/components/org-switcher.tsx` uses `@/components/reusabletoast`; everything else uses `sonner`. Pick one.
9. **De-duplicate `Role` enum** — `apps/dashboard/lib/roles.ts` and `packages/shared/src/roles.ts` declare the same `ROLES` tuple twice. Dashboard should `import { ROLES } from "@repo/shared/roles"`.
10. **License list pagination size** — `tenants/[id]/page.tsx:98` fetches `pageSize=1` for "the active license". This silently hides multi-license history. Add a "License history" panel showing all licenses ever assigned to the tenant.

---

## RBAC Matrix — Organizations

| Action | super_admin | support_agent | billing_manager | read_only |
|--------|:---:|:---:|:---:|:---:|
| View orgs (`GET /tenants/:id/organizations`) | ✅ | ✅ | ✅ | ✅ |
| View one org (`GET .../:orgId`) | ✅ | ✅ | ✅ | ✅ |
| Create org (`POST`) | ✅ | ❌ | ❌ | ❌ |
| Rename org (`PATCH .../:orgId`) | ✅ | ✅¹ | ❌ | ❌ |
| Suspend org (`DELETE .../:orgId`, soft) | ✅ | ❌ | ❌ | ❌ |
| Hard-delete org | n/a | n/a | n/a | n/a (no endpoint) |

¹ The current code does **not** allow `support_agent` to rename (PATCH falls under the `/tenants` non-GET, non-`/provision` write rule → `super_admin`). Marked ✅ as the **expected** behavior given the role description; today it is ❌. See gap below.

### Gap: `support_agent` can provision tenants but cannot manage their orgs
The "/provision" carve-out for `support_agent` was scoped narrowly. Anything under `/tenants/:id/organizations/*` (even though it provisions a fresh Bigcapital stack via `enqueueOrgProvisioning`) requires `super_admin`. Recommended: extend `requiredApiRole` to treat `pathname.includes("/organizations")` write methods the same as `/provision` (= `support_agent`), since creating an org IS provisioning.

### Gap: Per-org user access in Bigcapital

**Current state**:
- Stockix has zero per-org user access concept. Owner-side RBAC is whole-platform.
- Inside each Bigcapital org-instance, RBAC is fully working (`CASL` + roles table) but is **scoped to that one MySQL DB** — so a user added to org A's `users` table is *not* visible to org B's `users` table at all. There is also no UI in either system that shows "alice has admin in org A, accountant in org B."

**Mechanically yes, organizationally no**: a tenant admin _can_ already prevent alice from accessing org B by simply never inviting her into org B's Bigcapital instance, but
1. There's no central place to see who has access where.
2. There's no Stockix-side concept of "team members of tenant X" — invitations happen separately per Bigcapital stack.
3. Granting alice a role in org A and a different role in org B requires logging into each Bigcapital instance separately.

**Proposed solution (no code change in this audit)**:

| Layer | Change |
|---|---|
| `packages/db/src/schema.ts` | Add `tenant_team_members(id, tenant_id, system_user_id, email, status)` and `tenant_team_member_org_access(team_member_id, organization_id, role_slug, status)` tables. |
| `apps/api/src/index.ts` | New routes: `GET /tenants/:id/team`, `POST /tenants/:id/team` (invite by email), `PATCH /tenants/:id/team/:memberId/access/:orgId` (set role), `DELETE /tenants/:id/team/:memberId/access/:orgId` (revoke). |
| Worker | New job type `org.user.sync` that propagates a team change to the target Bigcapital MySQL via an admin API call. |
| Bigcapital | Add an internal endpoint that accepts `{ systemUserId, email, roleSlug }` and upserts the `users` row + role assignment for that org. |
| Dashboard | New "Team" tab on tenant detail page with a `members × orgs` matrix, plus inline role selector per cell. |

This is the only path that satisfies "give alice access to org A but not org B" in a way the operator can see and manage from one place. Until then, the gap is **documented but not implemented**.
