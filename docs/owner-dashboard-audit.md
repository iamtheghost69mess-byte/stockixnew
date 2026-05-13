# Stockix Owner Dashboard — Full Audit
_Generated: 2026-05-13_

## Quick Summary

The owner shell delivers **solid tenant and license operations** against real Next.js API routes (provisioning with live events, license lifecycle, RBAC gates). The **home route is a navigation hub**, not a metrics or activity dashboard. **Loading and route-level error boundaries are largely absent**, and **destructive UX is uneven** (`AlertDialog` unused; some actions have no confirmation). **shadcn primitives are widely adopted**, with a handful of raw HTML patterns and one **custom invite overlay** on the team page.

---

## Page Inventory

| Route | Status | Loading | Error | Not-Found |
|-------|--------|---------|-------|-----------|
| `/` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/tenants` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/tenants/[id]` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/tenants/[id]/organizations/[orgId]` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/licenses` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/licenses/[id]` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/owners` | ✅ Page exists | ❌ | ❌ | ❌ |
| `/settings` | ✅ Page exists | ❌ | ❌ | ❌ |

Command equivalent (sorted): `find apps/dashboard/app/(dashboard) -name "page.tsx" | sort`

| # | File (repo path) | Route path | One-line purpose |
|---|------------------|------------|------------------|
| 1 | `apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx` | `/licenses/[id]` | Single-license detail: metadata, notes, extend/perpetual, assign, revoke, activation rows, terminal ops. |
| 2 | `apps/dashboard/app/(dashboard)/licenses/page.tsx` | `/licenses` | License directory with analytics cards, filters, paginated table, generate/assign entry points. |
| 3 | `apps/dashboard/app/(dashboard)/owners/page.tsx` | `/owners` | Platform owners list, invites, role changes, removals. |
| 4 | `apps/dashboard/app/(dashboard)/page.tsx` | `/` | Home shell delegating to `DashboardHome` (overview cards). |
| 5 | `apps/dashboard/app/(dashboard)/settings/page.tsx` | `/settings` | MFA setup / enable / disable for the signed-in owner (labeled “Settings”). |
| 6 | `apps/dashboard/app/(dashboard)/tenants/[id]/organizations/[orgId]/page.tsx` | `/tenants/[id]/organizations/[orgId]` | Single child-organization profile, rename, suspend. |
| 7 | `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` | `/tenants/[id]` | Tenant profile, infra, org switcher, license block, events, danger zone. |
| 8 | `apps/dashboard/app/(dashboard)/tenants/page.tsx` | `/tenants` | Tenant list, provisioning UX, create wizard, delete/suspend flows. |

### Per-route boundary files (`loading` / `error` / `not-found`)

| Route | `loading.tsx` | `error.tsx` | `not-found.tsx` |
|-------|----------------|-------------|-----------------|
| `/` | ❌ Missing | ❌ Missing | ❌ Missing |
| `/tenants` | ❌ | ❌ | ❌ |
| `/tenants/[id]` | ❌ | ❌ | ❌ |
| `/tenants/[id]/organizations/[orgId]` | ❌ | ❌ | ❌ |
| `/licenses` | ❌ | ❌ | ❌ |
| `/licenses/[id]` | ❌ | ❌ | ❌ |
| `/owners` | ❌ | ❌ | ❌ |
| `/settings` | ❌ | ❌ | ❌ |

### App-root boundaries (`apps/dashboard/app/`)

| File | Exists? | Notes |
|------|---------|--------|
| `error.tsx` | ✅ Yes | Client error UI with `Alert` + `Button`. |
| `not-found.tsx` | ✅ Yes | Global 404 with link home. |
| `global-error.tsx` | ✅ Yes | **Raw `<button>`**, minimal styling, no shadcn. |
| `loading.tsx` | ❌ No | No global loading UI. |

**Note:** `apps/dashboard/app/dashboard/page.tsx` exists **outside** `(dashboard)` and only `redirect("/")` (legacy); not part of the owner route tree above.

---

## Feature Status Per Page

### Overview / Dashboard (`/`, `page.tsx` → `components/dashboard-home.tsx` + `section-cards.tsx`)

| Question | Status | Evidence |
|------------|--------|----------|
| Metrics/stats (tenant count, license count, etc.) | ❌ Missing | No live counts; copy describes capabilities only. |
| Data source | N/A (static) | Cards are a **hardcoded** array of links/descriptions. |
| Charts vs numbers | ❌ Neither | No charts; no KPI numbers. |
| Recent activity feed | ❌ Missing | None. |
| Quick actions | ⚠️ Partial | **Three navigation cards** (Tenants, Team, Security/settings) — shortcuts, not actions on data. |
| Overall | ⚠️ Partial | Polished **hub**, not an operational overview. |

### Tenants (`/tenants`, `tenants/page.tsx` + `tenant-list.tsx` + `tenant-create-wizard.tsx`)

| Question | Status | Notes |
|----------|--------|------|
| Search / filter | ✅ Done | Search + status chips + sort (`tenant-list.tsx`). |
| Pagination | ❌ Missing (server) | **Client-side** filter over full list from `GET /api/tenants`; no paged API on this view. |
| Columns | ✅ Done | Organization, admin, status, registered, public URL, actions. |
| Row actions | ✅ Done | View, open login, copy URL, suspend, reactivate, stop provision, delete (via parent callbacks). |
| Status color-coded | ✅ Done | `TenantStatusBadge` + deployment status. |
| Create tenant flow | ✅ Done | “Add tenant” opens wizard (`TenantCreateWizard` in dialog). |
| Wizard vs simple form | ✅ Done | **4-step wizard** (business → slug → plan & license → review). |
| Creation fields | ✅ Done | Name, admin first/last/email, slug, plan (from `/api/plans`), auto vs existing unassigned platform license. |
| TODO / `console.log` stubs | ✅ Clean | No `TODO`/`FIXME`/`console.log` hits under `apps/dashboard` in repo scan. |

### Tenant Detail (`/tenants/[id]`, `tenants/[id]/page.tsx` + related components)

| Section | Status | Detail |
|---------|--------|--------|
| Tenant profile | ✅ Done | View: name, slug, badges, admin fields, owner id, plan, created. **Editable:** name + admin fields via PATCH `/api/tenants/[id]` (“Edit profile”). |
| Infrastructure | ✅ Done | Status badge, internal port, compose project name, registration time, `lastError` alert; **Retry provisioning** when failed (`POST .../retry-provision`). Open login when active. |
| Sub-organizations | ✅ Done | `OrgSwitcher` list + links; copy explains local dev. |
| Org access (scoped support) | ✅ Done (super_admin) | `TenantOrgAccessPanel` — grants table, add/remove (remove **no confirm** — see Section 3D). |
| License card | ✅ Done | Current license or empty state; super: generate/assign; revoke dialog; history toggle. |
| Provisioning history | ✅ Done | `GET .../events` in scroll area; auto-refresh while provisioning. |
| Danger zone | ⚠️ Partial | Suspend (slug **Dialog**), reactivate (**no confirmation** — immediate POST), stop provision (slug **Dialog**), delete (slug then volumes **Dialog**). |

### Licenses (`/licenses`, `licenses/page.tsx`)

| Question | Status | Notes |
|----------|--------|------|
| Search / filter | ✅ Done | Debounced search, status/product/plan selects, “expiring in 30 days” toggle. |
| Pagination | ✅ Done | Page + pageSize query; Prev/Next buttons (not shadcn `Pagination` component). |
| Columns | ✅ Done | Key, product, plan, tenant, status, activations, expires, menu. |
| Row actions | ⚠️ Partial | View details; assign if unassigned (super); “Revoke…” **navigates** to detail (no inline revoke). |
| Generate from page | ✅ Done (super) | `LicenseGenerateDialog`. |
| Assign to tenant | ✅ Done (super) | From row menu + `LicenseAssignDialog`. |
| Revoke | ⚠️ Partial | From list: indirect via detail; full revoke on detail/license cards. |
| Extend / expiry | ⚠️ Partial | **Not on list page**; on `/licenses/[id]`. |
| License detail route | ✅ Yes | `/licenses/[id]` — see below. |

### License detail (`/licenses/[id]`)

| Area | Status | Notes |
|------|--------|------|
| Summary / metadata | ✅ Done | Breadcrumb, key, product/plan badges, tenant link, detail grid. |
| Notes | ✅ Done | PATCH with capability `canExtendLicenses` (naming: extends license *metadata* too). |
| Extend / perpetual | ✅ Done | Dialog + calendar/popover; `POST .../extend`. |
| Assign | ✅ Done | If unassigned + super. |
| Revoke | ✅ Done | Dialog + optional reason. |
| Activations table | ✅ Done | Deactivate (support/super per rules), blacklist (super), fingerprint copy via **raw `<button>`**. |

### Owners / Team (`/owners`, `owners/page.tsx`)

| Question | Status | Notes |
|----------|--------|------|
| What is shown | ✅ Done | Table: name, email, id snippet, role controls, “activated” vs “pending” from **`hasPassword`** (invitation/password state — **not MFA status**). |
| Invite | ✅ Done | `POST /api/owners/invite` — **custom fixed overlay**, not `Dialog`/`Sheet`. |
| Change roles | ✅ Done | Per-row `Select` opens **confirm `Dialog`**, PATCH `/api/owners/[id]`. |
| Remove owner | ✅ Done | Delete opens **`Dialog`** with email confirmation. |
| MFA status | ❌ Missing | Not displayed per owner. |
| Invite form roles | ✅ Done | All `ROLES` from `@/lib/roles` (same as `SelectItem` map). |

### Settings (`/settings`, `settings/page.tsx`)

| Question | Status | Notes |
|----------|--------|------|
| What exists | ⚠️ Partial | **MFA only** (begin QR/secret, verify enable, code to disable). |
| General / platform settings | ❌ Missing | None. |
| Security (beyond MFA) | ❌ Missing | No session list, password change, IP allowlist, etc., in this file. |
| Billing | ❌ Missing | None here (role `billing_manager` exists in RBAC but no billing UI on this page). |
| Configurable vs display | ⚠️ Partial | MFA toggling only; explanatory copy about super-admin MFA in production. |

### Security / MFA dedicated route (`/security`, `/settings/security`)

| Finding | Status |
|---------|--------|
| Dedicated route | ❌ Missing | **No** `security` or `settings/security` page under `(dashboard)/`. |
| MFA in UI | ✅ Done | Consolidated into **`/settings`**. |
| MFA enforce per role | ⚠️ Partial | **Copy only** on settings page; no UI for org-wide policy or per-role enforcement matrix. |
| Session management | ❌ Missing | No UI. |
| Audit log viewer | ❌ Missing | No page; no `app/api/**/audit**` route in dashboard API tree. |

### Plans (`/plans`)

| Finding | Status |
|---------|--------|
| Plans admin page | ❌ Missing | No `(dashboard)/plans/page.tsx`. |
| Plans in product | ⚠️ Partial | `GET /api/plans` consumed by **tenant wizard** and **license generate** dialog only. |
| Connected to license generation | ✅ Done | Generate dialog + wizard both load plans from API. |

---

## shadcn Component Inventory

### 3A — `components/ui/` files (actual install set)

`alert.tsx`, `alert-dialog.tsx`, `avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button.tsx`, `calendar.tsx`, `card.tsx`, `chart.tsx`, `checkbox.tsx`, `command.tsx`, `dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `field.tsx`, `input.tsx`, `input-group.tsx`, `input-otp.tsx`, `label.tsx`, `popover.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`, `sonner.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `toggle.tsx`, `toggle-group.tsx`, `tooltip.tsx`

### Official checklist (reference list from task)

| Component | Status |
|-----------|--------|
| accordion | ❌ Not installed |
| alert | ✅ Installed |
| alert-dialog | ✅ Installed *(unused in app — see 3D)* |
| aspect-ratio | ❌ Not installed |
| avatar | ✅ Installed |
| badge | ✅ Installed |
| breadcrumb | ✅ Installed |
| button | ✅ Installed |
| calendar | ✅ Installed |
| card | ✅ Installed |
| carousel | ❌ Not installed |
| chart | ✅ Installed |
| checkbox | ✅ Installed |
| collapsible | ❌ Not installed |
| command | ✅ Installed |
| context-menu | ❌ Not installed |
| data-table | ⚠️ Partial | **`components/data-table.tsx` exists** (with `zod`) but **not referenced** by any dashboard page. |
| dialog | ✅ Installed |
| drawer | ✅ Installed |
| dropdown-menu | ✅ Installed |
| form | ❌ Not installed |
| hover-card | ❌ Not installed |
| input | ✅ Installed |
| input-otp | ✅ Installed |
| label | ✅ Installed |
| menubar | ❌ Not installed |
| navigation-menu | ❌ Not installed |
| pagination | ❌ Not installed *(Prev/Next `Button` pattern used instead)* |
| popover | ✅ Installed |
| progress | ❌ Not installed |
| radio-group | ❌ Not installed |
| resizable | ❌ Not installed |
| scroll-area | ✅ Installed |
| select | ✅ Installed |
| separator | ✅ Installed |
| sheet | ✅ Installed |
| sidebar | ✅ Installed |
| skeleton | ✅ Installed |
| slider | ❌ Not installed |
| sonner | ✅ Installed |
| switch | ❌ Not installed |
| table | ✅ Installed |
| tabs | ✅ Installed |
| textarea | ✅ Installed |
| toast | ❌ Not installed | **Sonner** used as toast layer (`Toaster` in shell). |
| toggle | ✅ Installed |
| toggle-group | ✅ Installed |
| tooltip | ✅ Installed |

### 3B — Hand-written UI that should align with shadcn

| File | Line (approx) | What | Prefer |
|------|-----------------|------|--------|
| `apps/dashboard/app/global-error.tsx` | 23–28 | Raw `<button>` for reset | `Button` from `@/components/ui/button` *(requires root layout constraints for CSS — may need minimal import strategy)* |
| `apps/dashboard/app/(dashboard)/owners/page.tsx` | 272–346 | **Custom modal** (`fixed inset-0 bg-black/45` + panel) for invite | `Dialog` or `Sheet` from shadcn |
| `apps/dashboard/app/(dashboard)/owners/page.tsx` | 370–479 | Raw `<table>` / `<thead>` / `<tbody>` | `Table`, `TableHeader`, `TableRow`, `TableCell` |
| `apps/dashboard/app/(dashboard)/owners/page.tsx` | 458–474 | Raw `<button>` for row delete trigger | `Button` `variant="ghost"` or `DropdownMenu` |
| `apps/dashboard/app/(dashboard)/licenses/page.tsx` | 380–387 | Raw `<button>` for truncated key + copy | `Button` `variant="link"` or keep + ensure a11y parity |
| `apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx` | 453–465 | Raw `<button>` for fingerprint copy | `Button` `variant="link"` / `size="sm"` |
| `apps/dashboard/app/(dashboard)/licenses/[id]/page.tsx` | 536–542 | Raw `<input type="checkbox">` for perpetual toggle | `Checkbox` + `Label` |
| `apps/dashboard/components/tenant-create-wizard.tsx` | 255–308 | Raw `<button>` for plan tiles and license mode cards | `Button` `variant="outline"` or `ToggleGroup` |
| `apps/dashboard/components/license-generate-dialog.tsx` | 213–234 | Raw `<button>` for perpetual vs fixed term | `ToggleGroup` or `Button` variants |

*Excluded:* `components/ui/sidebar.tsx` internal `<button>` — primitive implementation.

### 3C — Form handling

| Topic | Status |
|-------|--------|
| shadcn `Form` + react-hook-form | ❌ Not used | No imports of `@/components/ui/form` or `useForm` in `apps/dashboard`. |
| Raw `<form>` + `useState` | ✅ Dominant pattern | Owners invite, various dialogs use controlled inputs. |
| Zod on client | ⚠️ Partial | **`zod` only in `components/data-table.tsx`**, which is **unused** by pages. Some ad-hoc validation (e.g. `validateOrganizationDisplayName` on org rename). |
| Forms missing stronger validation | ⚠️ Partial | Tenant profile edit on tenant detail, license revoke reason, many numeric fields rely on **API errors** rather than zod schemas. |

### 3D — Destructive actions vs confirmation

| Action | Location | Confirmation |
|--------|----------|--------------|
| Delete tenant | `/tenants` | ✅ `Dialog` + slug match + second volumes `Dialog` |
| Suspend tenant | `/tenants` (list) | ✅ `Dialog` + slug |
| Stop provisioning | `/tenants` (list) | ✅ `Dialog` + slug |
| Delete tenant | `/tenants/[id]` | ✅ `Dialog` slug + volumes `Dialog` |
| Suspend tenant | `/tenants/[id]` | ✅ `Dialog` + slug |
| Stop provisioning | `/tenants/[id]` | ✅ `Dialog` + slug |
| Reactivate tenant | `/tenants/[id]` | ❌ **None** — immediate POST |
| Revoke license | `/tenants/[id]`, `/licenses/[id]` | ⚠️ `Dialog` but **no typed confirm** (optional reason only) |
| Remove org access grant | `TenantOrgAccessPanel` | ❌ **None** — icon click fires DELETE |
| Suspend organization | Org detail / `OrgSwitcher` | ⚠️ `Dialog` — **confirm text only**, no slug/email gate |
| Deactivate activation | `/licenses/[id]` | ⚠️ `Dialog` — short copy, no typed confirm |
| Blacklist fingerprint | `/licenses/[id]` | ⚠️ `Dialog` — serious action; reason optional |
| Delete owner | `/owners` | ✅ `Dialog` + email match |
| Change role | `/owners` | ✅ Confirm `Dialog` |
| Disable MFA | `/settings` | ⚠️ Code acts as confirmation; **no** `AlertDialog` |

**`window.confirm`:** ✅ None found.

**`AlertDialog`:** Installed but **never used** for destructive flows; **`Dialog` is used instead** (semantically weaker pattern for “alert” modals).

---

## Navigation & Layout

### Sidebar (`app-sidebar.tsx`)

**Main items:** Overview `/`, Tenants `/tenants`, Licenses `/licenses`, Team & access `/owners`, and conditionally **Security & settings** `/settings` when `me.capabilities.canAccessSettings`.

**Resources (documents):** “Operator guide” → `#`, “Platform status” → `#` (**non-pages; same-document hash only**).

**Secondary:** “Help & support” → `#`.

### Missing / broken links

| Item | Status |
|------|--------|
| `#` resource links | ❌ Broken / placeholder — not real routes. |
| `/plans` | N/A — not linked (and route does not exist). |

### Active state

| Topic | Status |
|-------|--------|
| Sidebar highlight | ✅ `nav-main.tsx` uses `pathname === item.url \|\| pathname.startsWith(\`\${item.url}/\`)` (root special-cased). |

### Breadcrumb

| Topic | Status |
|-------|--------|
| Component | ✅ `Breadcrumb` used on **tenant detail** and **license detail** only. |
| Other pages | ❌ No breadcrumb on `/`, `/tenants`, `/licenses`, `/owners`, `/settings`, org detail (only “Back to tenant” link). |

### Layout / responsive

| Topic | Status |
|-------|--------|
| Mobile sidebar | ✅ `Sidebar` `collapsible="offcanvas"` + `SidebarTrigger` in `SiteHeader`. |
| Page header pattern | ⚠️ Partial | **`SiteHeader`** shows a **single title** derived from pathname; **no subtitle / actions slot**. Nested routes like `/tenants/[id]/organizations/[orgId]` still read as **“Tenant detail”** (same branch as `/tenants/[id]`). |

---

## API Route Coverage

All `route.ts` files under `apps/dashboard/app/api` (sorted):

`auth/invite/[token]`, `auth/invite/accept`, `auth/logout`, `fingerprints/blacklist`, `licenses`, `licenses/[licenseId]`, `licenses/[licenseId]/activations/[activationId]/deactivate`, `licenses/[licenseId]/assign`, `licenses/[licenseId]/extend`, `licenses/[licenseId]/revoke`, `licenses/activate`, `licenses/analytics`, `licenses/generate`, `licenses/verify-offline`, `me`, `owners`, `owners/[ownerId]`, `owners/invite`, `plans`, `session/login`, `session/password/forgot`, `session/password/reset`, `security/mfa/begin`, `security/mfa/disable`, `security/mfa/enable`, `security/mfa/status`, `tenants`, `tenants/[tenantId]`, `tenants/[tenantId]/events`, `tenants/[tenantId]/organization-access`, `tenants/[tenantId]/organization-access/[accessId]`, `tenants/[tenantId]/organizations`, `tenants/[tenantId]/organizations/[orgId]`, `tenants/[tenantId]/provision-stop`, `tenants/[tenantId]/reactivate`, `tenants/[tenantId]/retry-provision`, `tenants/[tenantId]/suspend`, `tenants/provision-status/[correlationId]`, `tenants/provision-stop/[correlationId]`, `tenants/provision-stream/[correlationId]`

### Routes with no first-class owner-dashboard UI (typical)

| Area | Notes |
|------|--------|
| `licenses/activate`, `licenses/verify-offline` | Product / terminal activation flows — **not** surfaced in owner pages reviewed. |
| `session/password/forgot`, `session/password/reset`, `session/login`, `auth/invite/*` | **Auth flows** under `(auth)/` pages, not `(dashboard)/` hub. |

### UI with no matching API (in this app)

| UI | Notes |
|----|--------|
| Operator guide / platform status / help `#` | **No API** — placeholders only. |

### Gaps (professional expectations)

| Gap | Notes |
|-----|--------|
| Platform audit log | **No** `/api/.../audit...` in this tree; **no** viewer UI. |
| Billing / subscriptions | **No** billing API routes under this dashboard `app/api` snapshot. |

---

## Missing Features vs SaaS Standard

| Feature | Status | Priority |
|---------|--------|----------|
| Dashboard analytics (revenue, growth, churn) | ❌ Missing | 🟡 Important |
| Audit log viewer | ❌ Missing | 🔴 Critical |
| Tenant impersonation | ❌ Missing | 🟡 Important |
| Bulk actions (multi-select suspend, etc.) | ❌ Missing | 🟢 Polish |
| Export (CSV tenants/licenses) | ❌ Missing | 🟡 Important |
| Email notification settings | ❌ Missing | 🟡 Important |
| Webhook configuration | ❌ Missing | 🟡 Important |
| Platform API keys | ❌ Missing | 🔴 Critical |
| Platform health / status page | ⚠️ Partial | 🟡 Important *(sidebar link is `#` placeholder only)* |
| Billing / subscription management | ❌ Missing | 🔴 Critical *(roles hint at future; no UI)* |
| Onboarding checklist per tenant | ❌ Missing | 🟢 Polish |
| Usage metrics per tenant | ❌ Missing | 🟡 Important |
| Global search | ❌ Missing | 🟢 Polish |

---

## Priority Fix Queue

### 🔴 Critical

1. **Remove or confirm destructive actions without friction** — especially **reactivate tenant** (no dialog) and **remove support grant** (single click).
2. **Use `AlertDialog` (or equivalent dedicated pattern) for irreversible / high-impact actions** — `AlertDialog` is installed but unused; several flows use generic `Dialog` only.
3. **Platform governance** — no **audit log** or **API key** management for a serious multi-tenant control plane.

### 🟡 Important

1. **Real overview** — KPIs (tenant/license counts, failures, expiring licenses) on `/` using existing APIs (`/api/tenants`, `/api/licenses/analytics`, etc.).
2. **Route-level `loading.tsx` / `error.tsx`** under `(dashboard)` for perceived performance and failure isolation.
3. **Replace placeholder `#` sidebar links** or hide until real routes exist.
4. **Owners invite overlay** → shadcn `Dialog`/`Sheet`; **Owners table** → shadcn `Table`.
5. **Header titles** for nested routes (org detail vs tenant detail).

### 🟢 Polish

1. **Align raw `<button>` / checkbox** instances with `Button` / `Checkbox` (Section 3B).
2. **Adopt `Form` + zod** on high-risk forms (tenant profile, license generation) for consistent validation.
3. **Wire up or remove** unused `components/data-table.tsx` or reuse it for licenses/tenants tables.

---

_End of audit._
