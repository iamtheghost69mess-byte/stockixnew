# Stockix — Post-Implementation Audit
_Generated: 2026-05-13_
_Based on: [missingorga.md](missingorga.md) + Phase 1–7 implementation passes_

> Method: read-only inspection of the workspace. The schema and route checks below were verified against [`packages/db/src/schema.ts`](../packages/db/src/schema.ts), [`apps/api/src/index.ts`](../apps/api/src/index.ts), [`apps/api/src/license-http.ts`](../apps/api/src/license-http.ts), [`apps/api/src/plan-limits.ts`](../apps/api/src/plan-limits.ts), [`apps/api/src/middleware/rbac.ts`](../apps/api/src/middleware/rbac.ts), [`infra/worker-service/src/`](../infra/worker-service/src/), and [`apps/dashboard/`](../apps/dashboard/). No live SQL was executed — [`packages/db/src/schema.ts`](../packages/db/src/schema.ts) is treated as the source of truth (Drizzle migrations are derived from it).

---

## Implementation Score

**4 / 4** open/critical items from [missingorga.md](missingorga.md) closed or formally deferred — the file is now down to **Resolved / By design / Deferred** rows only.

Phase pass results:

| Phase | Result |
|------:|--------|
| 1 — Destructive UX dialogs | **8 / 8** target flows confirmed; `window.confirm` count = 0 |
| 2 — Route boundaries | **9** `error.tsx` + **9** `loading.tsx` + **4** `not-found.tsx` (all targets hit) |
| 3 — Dashboard overview | KPI cards, alerts, quick actions, 30s auto-refresh — all live |
| 4 — Owners page | shadcn `Table`, `Dialog`, `DropdownMenu`, MFA shield, status `Badge` — all live |
| 5 — Sidebar + headers | 0 `href="#"`; `getPageTitle` covers org detail + tenant detail + license detail |
| 6 — shadcn alignment | 0 raw `<button>` and 0 raw `<input>` outside `components/ui/` |
| 7 — Form validation | 3 / 4 forms migrated to `react-hook-form` + `zod`; **`LicenseGenerateDialog` still on `useState`** |

---

## What We Built — Confirmed Working

### 1A — Database schema (control-plane)
Verified columns against [`packages/db/src/schema.ts`](../packages/db/src/schema.ts):

| Table | Column | Status |
|-------|--------|--------|
| `organizations` | `id` (uuid, default `gen_random_uuid()`) | ✅ Present |
| `organizations` | `tenant_id` (uuid, FK → tenants) | ✅ |
| `organizations` | `name` (varchar 255) | ✅ |
| `organizations` | `slug` (varchar 100, unique) | ✅ |
| `organizations` | `subdomain` (varchar 255, unique) | ✅ |
| `organizations` | `status` (varchar, default `'provisioning'`) | ✅ |
| `organizations` | `provisioning_error` (text) | ✅ |
| `organizations` | `created_at` / `updated_at` (timestamptz) | ✅ |
| `licenses` | `id`, `tenant_id`, `status`, `created_at`, `updated_at` | ✅ |
| `licenses` | `valid_from` (timestamptz, nullable) | ✅ **resolved** (was flagged ❌ in earlier audit) |
| `licenses` | `max_organizations` (int, default `1`) | ✅ |

### 1B — Org API routes ([`apps/api/src/index.ts`](../apps/api/src/index.ts))

| Method | Path | Line | Status |
|--------|------|------|--------|
| `GET` | `/public/tenant-orgs/:tenantId` | 726 | ✅ Exempt from RBAC ([`rbac.ts`](../apps/api/src/middleware/rbac.ts) L33) |
| `GET` | `/tenants/:tenantId/organizations` | 2474 | ✅ + support-scope filter |
| `POST` | `/tenants/:tenantId/organizations` | 2507 | ✅ Gated by `canCreateOrganization` (L2565) + license eligibility (L2545); calls `logAudit` (L2602) |
| `GET` | `/tenants/:tenantId/organizations/:orgId` | 2614 | ✅ + scope assert |
| `PATCH` | `/tenants/:tenantId/organizations/:orgId` | 2657 | ✅ `logAudit` `org.renamed` / `org.suspended` |
| `DELETE` | `/tenants/:tenantId/organizations/:orgId` | 2783 | ✅ Enqueues **`tenant.deprovision`** when slug maps to a child tenant (L2864–2872) — **not** a soft suspend; `logAudit` `org.deleted` (L2877) |

### 1C — Plan limits ([`apps/api/src/plan-limits.ts`](../apps/api/src/plan-limits.ts))
- ✅ `getTenantLicenseEligibility(db, tenantId)` — returns `"ok" | "no_active_license" | "license_expired"`, `db=null` ⇒ `"no_active_license"`.
- ✅ `getMaxOrganizations(db, tenantId)` — returns `-1` (unlimited), `0` (no valid license), or a positive int; `db=null` ⇒ `0`.
- ✅ `canCreateOrganization(db, tenantId)` — combines eligibility + count vs `max_organizations`; `db=null` ⇒ `false`.

### 1D — Provisioning steps in order ([`infra/worker-service/src/provision-runtime.ts`](../infra/worker-service/src/provision-runtime.ts))

| Step (operationKey) | Line | Adapter |
|----------------------|------|---------|
| `tenant.health_check` | 449 | — |
| `tenant.bootstrap_admin` | 469 | [`fetch-stockix-finance-bootstrap.ts`](../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts) |
| `tenant.fetch_org_settings` | 506, 530 | [`fetch-stockix-finance-org-settings.ts`](../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-org-settings.ts) |
| `tenant.build_organization` | 559 | [`fetch-stockix-finance-build-org.ts`](../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts) |
| `edge.publish` | 611 | [`traefik-edge-publisher.ts`](../infra/worker-service/domain/provisioning/adapters/traefik-edge-publisher.ts) |

### 1E — Cascade suspend / reactivate
- ✅ `POST /tenants/:tenantId/suspend` (L3360) loops over child orgs and enqueues `tenant.lifecycle` (`command: "stop"`) per child + flips `organizations.status` to `suspended` (L3382–3406).
- ✅ `POST /tenants/:tenantId/reactivate` (L3456) does the inverse for suspended child orgs (L3472–3504).

### 1F — Child-org filtering in `GET /tenants`
- ✅ L1647–1653 — `notExists` subquery hides tenant rows that exist only because a parent org carries the same slug.

### 1G — Dashboard org switcher ([`apps/dashboard/components/org-switcher.tsx`](../apps/dashboard/components/org-switcher.tsx))
- ✅ Provisioning spinner (`Loader2`, L136)
- ✅ Failed badge + error tooltip (L155–173)
- ✅ Suspended badge (L142–152)
- ✅ Auto-poll every 5s while any org `status === "provisioning"` (L197–203)
- ✅ Add-org `Dialog` driven by `react-hook-form` + `zod` (`createOrgSchema`, L188–192, L437–469)
- ✅ Helper text “Currency, timezone, and regional settings will be inherited…” (L465–467)
- ✅ Color-coded `OrgStatusBadge` ([`components/org-status-badge.tsx`](../apps/dashboard/components/org-status-badge.tsx)) — active / suspended / provisioning / failed each have distinct icon+color.
- ✅ Empty state when `organizations.length === 0` (L342–357)
- ✅ Dashboard Next.js proxy routes both exist:
  - [`app/api/tenants/[tenantId]/organizations/route.ts`](../apps/dashboard/app/api/tenants/[tenantId]/organizations/route.ts)
  - [`app/api/tenants/[tenantId]/organizations/[orgId]/route.ts`](../apps/dashboard/app/api/tenants/[tenantId]/organizations/[orgId]/route.ts)

### 1H — Bigcapital org switcher
- ✅ [`useStockixOrgs.tsx`](../services/stockix-finance/packages/webapp/src/hooks/query/useStockixOrgs.tsx) returns `[]` when `REACT_APP_STOCKIX_API_URL` or `REACT_APP_STOCKIX_TENANT_ID` is empty (L21); calls `/public/tenant-orgs/${tenantId}` (L23).
- ✅ [`SidebarHead.tsx`](../services/stockix-finance/packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx) imports `useStockixOrgs` (L8); `isCurrent = currentHost === org.subdomain` (L40 — exact match, not `endsWith`); falls back to the single-org name block when `stockixOrgs.length < 1` (L64–70).

### 2 — License system
- ✅ `valid_from` column is present in [`schema.ts`](../packages/db/src/schema.ts) (L302) and exposed by `GET /licenses` and `GET /licenses/:licenseId` (`validFrom` in [`license-http.ts`](../apps/api/src/license-http.ts) L305, L585).
- ✅ Activation honors `valid_from`: `POST /licenses/activate` rejects with `license_not_yet_valid` (L347–350) and `license_expired` (L351–353).
- ✅ License-expiry background job: [`infra/worker-service/src/worker.ts`](../infra/worker-service/src/worker.ts) `expireDueLicenses` (L28–41) runs every 5 minutes and flips active+non-perpetual+past-expiry rows to `status='expired'`.
- ✅ Org-create endpoint gates on `getTenantLicenseEligibility` and returns `LICENSE_EXPIRED` / `NO_ACTIVE_LICENSE` (402) ([`apps/api/src/index.ts`](../apps/api/src/index.ts) L2545–2563).
- ✅ `POST /licenses/:licenseId/extend` ([`license-http.ts`](../apps/api/src/license-http.ts) L640) accepts `expiresAt` (datetime) and `isPerpetual` (bool); rejects on `status='revoked'`; resurrects `status='expired'` → `active` when extended; calls `logAudit('license.extended')`.
- ✅ License detail page ([`apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx)) has an **Extend or set perpetual** button (L394–404) wired to a `Dialog` with `Checkbox` perpetual toggle + `Calendar` date picker (L545–611).
- ✅ Tenant detail page has **Assign existing license** action (L645) wired through [`LicenseAssignDialog`](../apps/dashboard/components/license-assign-dialog.tsx) (L12, L723).

### 3 — Owner dashboard Phases 1–7

**Phase 1 — Destructive dialogs.** `grep -r "window.confirm" apps/dashboard/` → **0 matches.**

| Flow | Pattern | Evidence |
|------|---------|----------|
| Reactivate tenant (detail) | `Dialog` | [`tenants/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx) L934–973 |
| Reactivate tenant (list) | `Dialog` | [`tenant-list.tsx`](../apps/dashboard/components/tenant-list.tsx) L229–262 |
| Remove org access | `AlertDialog` | [`tenant-org-access-panel.tsx`](../apps/dashboard/components/tenant-org-access-panel.tsx) L239–276 |
| Disable MFA | `AlertDialog` | [`settings/page.tsx`](../apps/dashboard/app/(dashboard)/settings/page.tsx) L280–301 |
| Deactivate terminal | `AlertDialog` | [`licenses/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx) L669–702 |
| Blacklist fingerprint | `AlertDialog` + required reason (min 10 chars) | [`licenses/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx) L704–760 |
| Suspend tenant (detail) | `Dialog` + slug confirm | L977–1031 |
| Delete tenant | two-step `Dialog` (slug, then volumes) | L1033–1090 |
| Delete owner | `Dialog` + email confirm | [`owners/page.tsx`](../apps/dashboard/app/(dashboard)/owners/page.tsx) L681–738 |

**Phase 2 — Route boundaries.**

| Boundary | Count | Files |
|----------|------:|-------|
| `error.tsx` | 9 | root + `(dashboard)/`, `tenants/`, `tenants/[id]/`, `tenants/[id]/organizations/[orgId]/`, `licenses/`, `licenses/[id]/`, `owners/`, `settings/` |
| `loading.tsx` | 9 | root + all 8 route folders |
| `not-found.tsx` | 4 | root + `tenants/[id]/`, `tenants/[id]/organizations/[orgId]/`, `licenses/[id]/` |

**Phase 3 — Dashboard overview** ([`dashboard-home.tsx`](../apps/dashboard/components/dashboard-home.tsx)):
- ✅ Live tenant KPIs: total / active / suspended / failed (L122–153, color-coded).
- ✅ Live license KPIs: total / active / unassigned / expiring-30d (L155–187).
- ✅ Alerts section (provisioning failures / expiring licenses / in-progress provisioning) (L254–307).
- ✅ Quick actions panel (capability-gated, uses `me.capabilities.*`) (L192–249).
- ✅ Greeting uses `useMe()` (L77, L81–83).
- ✅ `Skeleton` while loading (L117–118 and `KpiSkeletonGrid`).
- ✅ Auto-refresh every 30s — [`use-dashboard-stats.ts`](../apps/dashboard/hooks/use-dashboard-stats.ts) `REFRESH_MS = 30_000` (L34, L181–186).
- ✅ Parallel fetch `/api/tenants` + `/api/licenses/analytics` (+ expiring page) (L116–120).

**Phase 4 — Owners page** ([`owners/page.tsx`](../apps/dashboard/app/(dashboard)/owners/page.tsx)):
- ✅ Invite overlay → shadcn `Dialog` (L375).
- ✅ Owners list → shadcn `Table` (L492).
- ✅ Row actions → `DropdownMenu` (L602).
- ✅ Status `Badge` (Active / Pending invite) (L572–574).
- ✅ MFA `ShieldCheck` / `ShieldAlert` + `Tooltip` (L575–595).
- ✅ `mfaEnabled` plumbed from API: select in [`apps/api/src/index.ts`](../apps/api/src/index.ts) `GET /owners`, default-mapped in `load()` (L159).

**Phase 5 — Sidebar + headers**:
- ✅ [`app-sidebar.tsx`](../apps/dashboard/components/app-sidebar.tsx) — every entry uses `Link href="…"`; `grep "href=\"#\"" apps/dashboard` → 0 matches.
- ✅ [`dashboard-app-shell.tsx`](../apps/dashboard/components/dashboard-app-shell.tsx) `getPageTitle` handles `/`, `/tenants`, `/licenses`, `/owners`, `/settings`, plus regex matches for `/tenants/[id]/organizations/[orgId]` → “Organization detail” (L22–24), `/tenants/[id]` → “Tenant detail”, `/licenses/[id]` → “License detail”.
- ✅ Breadcrumbs imported on `/tenants/[id]/organizations/[orgId]`, `/owners`, `/settings`.

**Phase 6 — shadcn alignment**:
- ✅ Raw `<button>` outside `components/ui/` — only `components/ui/sidebar.tsx` L284 remains (a shadcn primitive). **0** in app/feature code.
- ✅ Raw `<input>` outside `components/ui/` — **0**.
- ✅ Plan tiles + license-mode tiles in [`tenant-create-wizard.tsx`](../apps/dashboard/components/tenant-create-wizard.tsx) and the perpetual/fixed switch in [`license-generate-dialog.tsx`](../apps/dashboard/components/license-generate-dialog.tsx) use `ToggleGroup`/`ToggleGroupItem`.
- ✅ License-key copy buttons + fingerprint copy + perpetual `Checkbox` swapped to shadcn primitives on the licenses pages.

**Phase 7 — Form validation**:
- ✅ [`apps/dashboard/lib/schemas.ts`](../apps/dashboard/lib/schemas.ts) defines `tenantProfileSchema`, `inviteOwnerSchema`, `createOrgSchema` (delegates to `validateOrganizationDisplayName` via `.superRefine`), `generateLicenseSchema`.
- ✅ [`apps/dashboard/components/ui/form.tsx`](../apps/dashboard/components/ui/form.tsx) exists (custom shadcn `Form` adapted to use `React.cloneElement` instead of `@radix-ui/react-slot`).
- ✅ [`apps/dashboard/package.json`](../apps/dashboard/package.json): `react-hook-form 7.75.0`, `@hookform/resolvers 5.2.2`, `zod ^3.25.76`.
- ✅ Three of four forms migrated to `useForm` + `zodResolver`:
  - [`owners/page.tsx`](../apps/dashboard/app/(dashboard)/owners/page.tsx) invite (L125–128, L399–457).
  - [`org-switcher.tsx`](../apps/dashboard/components/org-switcher.tsx) create (L188–192, L437–469).
  - [`tenants/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx) profile edit (L107–108).

### 4 — RBAC ([`apps/api/src/middleware/rbac.ts`](../apps/api/src/middleware/rbac.ts))

| Route family | Required role | Line |
|--------------|---------------|------|
| `GET /licenses*` | `read_only` | 36 |
| `POST /licenses/:id/extend` | `billing_manager` | 37 |
| `PATCH /licenses/:id` (notes only) | `billing_manager` | 38 |
| `POST …/activations/:id/deactivate` | `support_agent` | 39 |
| Other `/licenses` mutations (generate, revoke, assign, blacklist) | `super_admin` | 40 |
| `POST /licenses/activate`, `POST /licenses/verify-offline` | _public_ | 30–31 |
| `GET /plans`, `GET /public/tenant-orgs/:id`, `/auth/*`, `/internal/jobs/*`, `/health` | _public_ | 27–33 |
| `/tenants/.../organizations` non-GET | `support_agent` (then `org-access-scope.ts` further restricts) | 50 |
| `/tenants/.../organization-access*` | `super_admin` | 48 |
| `/tenants/.../provision*` | `support_agent` | 49 |
| `/owners` non-GET | `super_admin` | 45 |

- ✅ All org CRUD writes through `logAudit` (`org.created` L2602, `org.renamed` L2764, `org.suspended` L2755, `org.deleted` L2877).

### 5 — UI Professionalism
- ✅ Centralized date formatter [`apps/dashboard/lib/date-format.ts`](../apps/dashboard/lib/date-format.ts) — `formatDate` / `formatDateTime` / `formatTime` all delegate to `date-fns`.
- ✅ `OrgStatusBadge` is the color-coded source of truth ([`org-status-badge.tsx`](../apps/dashboard/components/org-status-badge.tsx)) and is consumed by `OrgSwitcher`.
- ✅ Empty states present where exercised: `OrgSwitcher` (no orgs), tenant detail (no provisioning events, L853–855), owners page (no team members, L503–512).
- ✅ Retry-provisioning button on tenant detail (L449) ↔ `POST /tenants/:tenantId/retry-provision` ([`apps/api/src/index.ts`](../apps/api/src/index.ts) L3154 + Next.js proxy [`app/api/tenants/[tenantId]/retry-provision/route.ts`](../apps/dashboard/app/api/tenants/[tenantId]/retry-provision/route.ts)).

---

## Still Missing or Partial

### ⚠️ `LicenseGenerateDialog` not migrated to react-hook-form
**Where**: [`apps/dashboard/components/license-generate-dialog.tsx`](../apps/dashboard/components/license-generate-dialog.tsx) L46–60 — still 13 `useState` hooks (`product`, `planSlug`, `count`, `term`, `expiresAt`, `maxActivations`, `graceDays`, `tenantId`, `notes`, `validFrom`, `loading`, `error`, `generatedKeys`).
**Schema waiting**: `generateLicenseSchema` is defined in [`lib/schemas.ts`](../apps/dashboard/lib/schemas.ts) L52–76 (including the cross-field rule “Expiry date is required for fixed term licenses”) but never imported.
**Fix**: refactor the dialog body to `useForm<GenerateLicenseValues>({ resolver: zodResolver(generateLicenseSchema) })` and replace the manual numeric inputs with `FormField`s.

### ⚠️ Toast import — not routed through `reusabletoast`
**Where**: ~14 feature files import `toast` directly from `"sonner"` (e.g. [`tenants/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx) L10, [`org-switcher.tsx`](../apps/dashboard/components/org-switcher.tsx) L8, [`licenses/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx) L14, [`licenses/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/page.tsx) L15, [`owners/page.tsx`](../apps/dashboard/app/(dashboard)/owners/page.tsx) L16, [`license-generate-dialog.tsx`](../apps/dashboard/components/license-generate-dialog.tsx) L5, etc.).
**Why it matters**: the wrapper at [`apps/dashboard/components/reusabletoast.tsx`](../apps/dashboard/components/reusabletoast.tsx) exists but is bypassed everywhere except its own file, so any future styling/tracking changes won’t propagate.
**Fix**: re-export `toast` from `reusabletoast.tsx` and switch imports to `@/components/reusabletoast`.

### ⚠️ License revoke is indirect from the list view
**Where**: [`licenses/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/page.tsx) — the row menu does **not** offer an inline revoke; it links into the detail page where the revoke dialog lives. Documented in [`docs/owner-dashboard-audit.md`](owner-dashboard-audit.md) as ⚠️ Partial and unchanged.
**Fix**: add a row-level `AlertDialog` (with reason field) directly in the list to match the “Extend” affordance.

### ⚠️ Tenant list pagination is client-side
**Where**: [`tenants/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/page.tsx) fetches the full `/api/tenants` array and filters in memory. Already flagged in the prior audit; not a regression but still pending.

### ❌ Inconsistent date-formatting in shadcn primitives
**Where**:
- [`components/ui/calendar.tsx`](../apps/dashboard/components/ui/calendar.tsx) L43, L201 — `toLocaleString` / `toLocaleDateString`.
- [`components/ui/chart.tsx`](../apps/dashboard/components/ui/chart.tsx) L258 — `toLocaleString`.
- [`components/chart-area-interactive.tsx`](../apps/dashboard/components/chart-area-interactive.tsx) L261, L272 — `toLocaleDateString`.

These are shadcn template files (not feature code), so they sit outside the `formatDate` policy. **Acceptable** as-is unless the team wants strict project-wide formatting; if so, override the calendar formatter and remove the template chart.

---

## New Issues Found

None of the changes broke a previously-working flow. Two minor risks worth flagging:

1. **`generateLicenseSchema` not enforced.** Because `LicenseGenerateDialog` is still on `useState`, the cross-field rule “Expiry date required for fixed-term licenses” is enforced by the server only (`license-http.ts` accepts `expiresAt?` as optional). A user can submit `term=fixed` with no date; the API will silently treat it as perpetual-with-no-end. Fixing this requires either the Phase 7 migration above _or_ a `.refine` on `license-http.ts`’s `generateBody`.

2. **`OrgSwitcher` rename dialog still uses `useState`** (L482–504) rather than the new `react-hook-form` pattern. The name field is validated via `validateOrganizationDisplayName` so functionality is fine, but the dialog is inconsistent with the create-form pattern next to it.

3. **`global-error.tsx` uses a raw `<button>`** ([`apps/dashboard/app/global-error.tsx`](../apps/dashboard/app/global-error.tsx)). This was already documented in [owner-dashboard-audit.md](owner-dashboard-audit.md) and is intentional (it must render before React context is hydrated), but worth re-stating so the next sweep doesn’t “fix” it incorrectly.

---

## Remaining Priority Queue

### 🔴 Critical
_None._ All schema gaps, RBAC gaps, and cascade gaps from [missingorga.md](missingorga.md) are closed.

### 🟡 Important
1. **Migrate `LicenseGenerateDialog`** to `react-hook-form` + `generateLicenseSchema` so the “fixed term ⇒ expiresAt required” rule is enforced client-side (see Still Missing #1).
2. **Centralize `toast`**: re-export from `reusabletoast.tsx` and ban direct `from "sonner"` imports via an ESLint rule (see Still Missing #2).
3. **Inline license revoke** from `/licenses` list — match the “Extend” affordance for the most common destructive action (see Still Missing #3).
4. **Server-side `/api/tenants` pagination** — the current full-list fetch will degrade once tenant count > ~1k.

### 🟢 Polish
1. Migrate `OrgSwitcher` rename + suspend dialogs to `react-hook-form`.
2. Replace `useState`/manual error UX in [`license-assign-dialog.tsx`](../apps/dashboard/components/license-assign-dialog.tsx) with `react-hook-form`.
3. Remove or refactor the shadcn `chart-area-interactive.tsx` template if it’s not on a real page.
4. Consider an internal `<DateText value=…/>` helper that uses `formatDate` to make “use the centralized formatter” impossible to miss.

---

## Section 6 — Missing features (professional SaaS standard)

| Feature | Status | Notes |
|---------|--------|-------|
| Audit log viewer page (`/audit-log` or similar) | ❌ Not built | `adminAuditLog` rows are written everywhere (see RBAC table above) but never surfaced in the dashboard. No `apps/dashboard/app/**/audit*` route. |
| Plans admin page (`/plans`) | ❌ Not built | Only `/api/plans` exists (read-only proxy of `GET /plans`). Plans must be edited via DB. |
| Platform API key management | ❌ Not built | No `apps/dashboard/app/**/api-keys/**` route. |
| Tenant impersonation | ❌ Not built | No code path matches `impersonate` in `apps/dashboard`. |
| CSV export (tenants / licenses) | ❌ Not built | No matches for `csv` / `export` outside unrelated files. |
| Email notification settings | ❌ Not built | No settings UI beyond MFA. |
| Webhook configuration | ❌ Not built | No webhook table or UI. |
| Usage metrics per tenant | ⚠️ Partial | Dashboard home shows global KPIs; per-tenant usage page does not exist. |
| Global search | ❌ Not built | Each list has its own search; no top-bar “⌘K”-style global search. |
| Billing / subscription management | ❌ Not built | No `app/(dashboard)/billing/**`. |
| `validFrom` / `startDate` on licenses | ✅ Built | Column present, surfaced in API + activation logic + license-extend flow. |

---

## Quick Reference — File Map

### API (control plane)
- [`apps/api/src/index.ts`](../apps/api/src/index.ts) — tenants + orgs + suspend/reactivate routes (~3,500 lines).
- [`apps/api/src/license-http.ts`](../apps/api/src/license-http.ts) — `/licenses*`, `/fingerprints/blacklist`.
- [`apps/api/src/plan-limits.ts`](../apps/api/src/plan-limits.ts) — `canCreateOrganization`, `getMaxOrganizations`, `getTenantLicenseEligibility`.
- [`apps/api/src/middleware/rbac.ts`](../apps/api/src/middleware/rbac.ts) — single source of truth for route → min-role.
- [`apps/api/src/org-access-scope.ts`](../apps/api/src/org-access-scope.ts) — `support_agent` scoped grants.
- [`apps/api/src/audit.ts`](../apps/api/src/audit.ts) — `logAudit` writer.

### Schema
- [`packages/db/src/schema.ts`](../packages/db/src/schema.ts) — `organizations` (L74–86), `licenses` (L300–) including `valid_from` (L302) and `max_organizations` (L306).

### Worker
- [`infra/worker-service/src/worker.ts`](../infra/worker-service/src/worker.ts) — job poller; `expireDueLicenses` (L28–41) runs every 5 min.
- [`infra/worker-service/src/provision-runtime.ts`](../infra/worker-service/src/provision-runtime.ts) — `tenant.bootstrap_admin` → `fetch_org_settings` → `build_organization` → `edge.publish`.
- [`infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts`](../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts)
- [`infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-org-settings.ts`](../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-org-settings.ts)
- [`infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts`](../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts)

### Dashboard
- Shell + nav: [`components/dashboard-app-shell.tsx`](../apps/dashboard/components/dashboard-app-shell.tsx), [`components/app-sidebar.tsx`](../apps/dashboard/components/app-sidebar.tsx).
- Home: [`components/dashboard-home.tsx`](../apps/dashboard/components/dashboard-home.tsx) + [`hooks/use-dashboard-stats.ts`](../apps/dashboard/hooks/use-dashboard-stats.ts).
- Tenants: [`app/(dashboard)/tenants/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/page.tsx), [`app/(dashboard)/tenants/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx), [`components/tenant-list.tsx`](../apps/dashboard/components/tenant-list.tsx), [`components/tenant-create-wizard.tsx`](../apps/dashboard/components/tenant-create-wizard.tsx).
- Orgs UI: [`components/org-switcher.tsx`](../apps/dashboard/components/org-switcher.tsx), [`components/org-status-badge.tsx`](../apps/dashboard/components/org-status-badge.tsx), [`hooks/use-organizations.ts`](../apps/dashboard/hooks/use-organizations.ts), [`app/(dashboard)/tenants/[id]/organizations/[orgId]/page.tsx`](../apps/dashboard/app/(dashboard)/tenants/[id]/organizations/[orgId]/page.tsx).
- Licenses: [`app/(dashboard)/licenses/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/page.tsx), [`app/(dashboard)/licenses/[id]/page.tsx`](../apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx), [`components/license-generate-dialog.tsx`](../apps/dashboard/components/license-generate-dialog.tsx), [`components/license-assign-dialog.tsx`](../apps/dashboard/components/license-assign-dialog.tsx).
- Owners: [`app/(dashboard)/owners/page.tsx`](../apps/dashboard/app/(dashboard)/owners/page.tsx).
- Settings (MFA): [`app/(dashboard)/settings/page.tsx`](../apps/dashboard/app/(dashboard)/settings/page.tsx).
- Forms / validation: [`lib/schemas.ts`](../apps/dashboard/lib/schemas.ts), [`components/ui/form.tsx`](../apps/dashboard/components/ui/form.tsx), [`lib/validate-org-name.ts`](../apps/dashboard/lib/validate-org-name.ts).
- Shared formatters / errors: [`lib/date-format.ts`](../apps/dashboard/lib/date-format.ts), [`lib/api-errors.ts`](../apps/dashboard/lib/api-errors.ts).

### Bigcapital (`services/stockix-finance`)
- [`services/stockix-finance/packages/webapp/src/hooks/query/useStockixOrgs.tsx`](../services/stockix-finance/packages/webapp/src/hooks/query/useStockixOrgs.tsx)
- [`services/stockix-finance/packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx`](../services/stockix-finance/packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx)

---

_Run methodology: zero changes to source; all assertions are line-anchored against the files cited above. Re-running this audit reduces to: (1) re-checking `grep -r "window.confirm" apps/dashboard` (must remain 0), (2) confirming the four schemas in [`lib/schemas.ts`](../apps/dashboard/lib/schemas.ts), and (3) re-counting `error.tsx` / `loading.tsx` / `not-found.tsx`._
