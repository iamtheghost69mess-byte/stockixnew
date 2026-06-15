# Stockix Bug Audit — errorsnow.md
> Audited: 2026-06-15. No code changes made.

---

## Issue 1 — License Revocation Not Enforced

**Root cause (2 layers):**

**Layer A — sync sends `"active"` after revoke.**
`apps/api/src/license-utils.ts` → `getActiveLicenseForTenant()` only queries for
`status IN ('active', 'expired')`; it never returns a revoked row. After revocation
`apps/api/src/routes/licenses.ts` calls `triggerFinanceLicenseSync` →
`syncFinanceLicenseForStockixTenant` → `getActiveLicenseForTenant` returns `null` →
`apps/api/src/finance-license.client.ts:~123` `mapStockixLicenseStatus(null, ...)` short-circuits
with `if (!license) { return "active"; }` → Finance sync receives `status: "active"` — the
tenant's Finance service is never told it is revoked.

**Layer B — Finance cache serves stale state for up to 60 s.**
Even if the sync payload were correct, `LicenseGuard.cache.ts` `LICENSE_CACHE_TTL_MS = 60_000`
means the revocation takes up to one minute to propagate inside Finance. The cache is cleared
after sync (`clearLicenseCache(dto.tenantId)` in `SyncLicense.service.ts`), so layer B only
matters if layer A is fixed without fixing `getActiveLicenseForTenant`.

**Repair plan:**
1. In `getActiveLicenseForTenant` add a fourth query branch that returns revoked rows so callers
   receive the actual record instead of `null`.
2. In `mapStockixLicenseStatus` remove the `if (!license) return "active"` early-return; treat
   `null` as no-license-found and propagate an appropriate status (e.g., `"suspended"` or reject
   the sync entirely).
3. Smoke-test: revoke a license via the dashboard, verify Finance immediately returns 402 on any
   write operation.

---

## Issue 2 — ORGANIZATION_LIMIT_REACHED (402) During COA Copy

**Root cause:**
`services/stockix-finance/packages/server/src/modules/License/License.service.ts:58`
`assertCanCreateOrganization()` counts ALL rows in `tenant_models` — it does not exclude orgs
whose license was revoked or orgs that are inactive. When the `maxOrganizations` limit is
reached (including orgs provisioned before a revocation), every new tenant creation throws 402.
Revocation on the control-plane side (Issue 1) does not delete or de-count the Finance orgs.

A secondary cause is the control-plane provision flow passing
`copy_chart_of_accounts: true` by default, which triggers an internal Finance org-create
before the limit check has been re-evaluated after any revocation.

**Repair plan:**
1. Fix Issue 1 first so Finance actually knows which licenses are revoked.
2. In `assertCanCreateOrganization`, join `tenant_licenses` and exclude tenants whose license
   `status = "revoked"` or `status = "suspended"` from the count.
3. Consider a deprovisioning step that removes Finance orgs when a Stockix license is revoked.

---

## Issue 3 — Organization Settings Missing from Sidebar

**Root cause:**
The Settings/Preferences entry point was **removed from the Finance sidebar nav** when the fork
was created (or during a later sidebar refactor), not from the org-switcher dropdown. Upstream
Bigcapital has a full Preferences section reachable as a top-level sidebar item:

| Route | Content |
|---|---|
| `/preferences/general` | Org name, fiscal year, date format, time zone, language |
| `/preferences/accountant` | Accounting method, base currency, opening balance date |
| `/preferences/items` | Default cost / income accounts |
| `/preferences/currencies` | Multi-currency management |

Source files live at
`services/stockix-finance/packages/webapp/src/containers/Preferences/` (sub-folders: `General/`,
`Accountant/`, `Items/`, `Currencies/`). The pages themselves still exist in this fork; what is
missing is the **sidebar nav item** that links to them. `SidebarHead.tsx` and `org-switcher.tsx`
were red herrings — the feature was never in either dropdown.

**Repair plan:**
Restore the Preferences sidebar link in the Finance sidebar nav component (the main sidebar, not
the org-switcher or the user popover). Check `SidebarMenu` / `SidebarItems` for where other
top-level nav links are defined and add:
```tsx
<SidebarItem icon={SettingsIcon} to="/preferences/general">
  Preferences
</SidebarItem>
```
The `TopbarUser.tsx` already has a keyboard-shortcut entry for `/preferences`, confirming the
routes are live — only the primary nav entry is missing.

---

## Issue 4 — User Cannot Modify Own Profile

**Root cause:**
No self-edit endpoint exists in the Finance server. The `Auth` controller
(`services/stockix-finance/packages/server/src/modules/Auth/Authed.controller.ts`) exposes only:
`GET /auth/account`, `GET /auth/my-tenants`, `POST /auth/switch-tenant`,
`POST /auth/change_password`. There is no `PUT /auth/profile` or `PUT /users/me` route.

The only edit route is `PUT /users/:id` in `Users.controller.ts` — an admin-scoped path that
requires knowing the target user's ID and does not serve as a self-edit endpoint.

On the UI side, `components/Dashboard/TopbarUser.tsx` contains no "Edit Profile" menu item.

**Repair plan:**
1. Add `PUT /auth/profile` (or `PATCH /auth/me`) to `AuthedController` or a new
   `UserProfileController` — scoped so users can only edit their own record.
2. Add an "Edit Profile" item in `TopbarUser.tsx` that opens a form/dialog backed by the new
   endpoint. Fields: first name, last name, avatar, phone number (not email — email change needs
   separate verification flow).

---

## Issue 5 — Notifications Not Working (Completely Non-Functional)

**Important context:** The entire notification stack is **100% custom Stockix code** — upstream
Bigcapital has no in-app notification system. There is no `NotificationBell`, no SSE stream, no
`owner_notifications` table, no pub/sub worker in the `bigcapitalhq` repo. You cannot reference
or borrow a fix from upstream. The audit findings below are entirely internal.

**Root cause (most probable):**
`safeCreateNotification` in `apps/api/src/notification-service.ts:108` swallows all errors
via `.catch(err => console.error(...))`. If the `owner_notifications` table (migration
`packages/db/drizzle/0041_owner_notifications.sql`) has not been applied to the running DB, every
notification insert fails silently — no error surfaces to the caller, the bell always shows empty.

**Secondary causes:**
1. `ownerId` mismatch — notifications are stored with `ownerId = tenant.ownerId` (set at
   provision time from `me.id`). The SSE stream reads notifications for `actorId` resolved at
   request time. If `actorId` (from `PLATFORM_API_SECRET` → first super_admin) differs from the
   `me.id` used when creating the tenant, no notifications appear for that stream.
2. `CONTROL_PLANE_REDIS_URL` not set — live push is degraded to DB polling every 10 s
   (`NOTIFICATION_STREAM_POLL_MS`). Notifications still arrive but up to 10 s late; live Sonner
   toasts don't fire because `streamReady` is never set from the Redis path.

**Architecture note:** The notification stack itself is complete — SSE stream, DB polling
fallback, `NotificationBell` component, `owner_notifications` schema, pub/sub helpers — it just
silently fails at the DB layer.

**Repair plan:**
1. Verify migration 0041 is applied on the running database (`SELECT to_regclass('owner_notifications')`).
2. In `createNotification`, propagate errors up (or at minimum log with stack + rethrow in dev)
   so they are visible in logs / Sentry.
3. Set `CONTROL_PLANE_REDIS_URL` in production to restore live push notifications.
4. For multi-owner deployments, ensure the SSE stream resolves `actorId` from the session cookie
   (not just from `PLATFORM_API_SECRET`) so each owner sees their own notifications.

---

## Issue 6 — Double-Slash API URLs (`/api//pdf-templates`, etc.)

**Root cause:**
`services/stockix-finance/packages/webapp/src/hooks/useRequest.tsx:13`
`useApiRequest().get(resource)` concatenates without stripping the leading slash:
```ts
get(resource, params) {
  return http.get(`/api/${resource}`, params);
}
```
Callers pass resources **with a leading slash**, producing double-slashes:

| Caller file | Resource passed | Resulting URL |
|---|---|---|
| `hooks/query/pdf-templates.ts` | `'/pdf-templates'` | `/api//pdf-templates` |
| `hooks/query/payment-services.ts` | `'/payment-services'` | `/api//payment-services` |
| `hooks/query/invoices.tsx:542` | `'/sale-invoices/state'` | `/api//sale-invoices/state` |

The fix (`normalizeApiPath`) already exists at `src/utils/index.tsx:17` and is correctly applied
in `useAuthApiRequest`, but **not** in the main `useApiRequest`.

Note: hooks that go through `useRequestQuery` (e.g., `useBalanceSheet`) are NOT affected — that
wrapper calls `normalizeApiPath` at line 29 of `useQueryRequest.tsx`.

**PDF / Gotenberg note:** Upstream Bigcapital generates PDFs via **Gotenberg** — a Dockerized
REST service that wraps Chromium. The `/pdf-templates` routes (and any PDF export endpoints)
proxy through to the Gotenberg container in the per-tenant Docker stack. Fixing the double-slash
is necessary but not sufficient: if the per-tenant `docker-compose.yml` is missing a `gotenberg`
service entry, PDF generation will return connection errors even after the URL is corrected.
Verify each tenant stack includes:
```yaml
gotenberg:
  image: gotenberg/gotenberg:8
  ports:
    - "3000"
```

**Repair plan (minimal):**
In `useApiRequest` (in `useRequest.tsx`), import `normalizeApiPath` and apply it to every method:
```ts
get(resource, params) {
  return http.get(`/api/${normalizeApiPath(resource)}`, params);
},
```
Apply to all six methods: `get`, `post`, `update`, `put`, `patch`, `delete`.

---

## Issue 7 — BalanceSheet Crash (`Cannot read properties of undefined`)

**Root cause:**
`services/stockix-finance/packages/webapp/src/containers/FinancialStatements/BalanceSheet/BalanceSheetTable.tsx:21`
unconditionally destructures `{ table, query, meta }` from `balanceSheet`:
```tsx
const {
  balanceSheet: { table, query, meta },
} = useBalanceSheetContext();
```

`BalanceSheetBody.tsx` guards with `{isLoading ? <Skeleton /> : <BalanceSheetTable />}`.
In React Query v3, `isLoading` is `false` after an error (status switches from `"loading"` to
`"error"`). When the balance-sheet API call fails (e.g., Finance backend returns an error or is
unreachable), `data` is `undefined` and `isLoading` is `false` — so `BalanceSheetTable` renders
with `balanceSheet = undefined`, immediately throwing:
- `Cannot read properties of undefined (reading 'table')`
- `Cannot read properties of undefined (reading 'meta')`

**Repair plan:**
Add a null/error guard in `BalanceSheetBody.tsx` (or `BalanceSheetTable.tsx`):
```tsx
const { isLoading, balanceSheet } = useBalanceSheetContext();
if (isLoading || !balanceSheet?.table) return <FinancialSheetSkeleton />;
return <BalanceSheetTable companyName={organizationName} />;
```
This prevents rendering `BalanceSheetTable` when the context lacks data, regardless of whether
`isLoading` is true or false.

---

## Issue 8 — Provisioning Auto-fill in Setup Wizard

**Root cause:**
`services/stockix-finance/packages/webapp/src/containers/Setup/SetupOrganizationPage.tsx:16`
`defaultValues` hardcodes empty strings for all locale-sensitive fields:
```ts
const defaultValues = {
  name: '',
  industry: '',
  location: '',      // always empty
  baseCurrency: '',  // always empty
  language: 'en',
  fiscalYear: '',    // always empty
  timezone: '',      // always empty
  dateFormat: 'DD MMM YYYY',
};
```
No browser locale detection is attempted. The `Intl.DateTimeFormat().resolvedOptions()` API
(available in all modern browsers) could supply `timeZone` and the locale subtag for currency
inference, but it is never called. The Stockix provisioning wizard (in the dashboard) does not
capture or forward currency/timezone/location, so Finance's setup wizard has no source to
pull defaults from.

**Repair plan:**
In `SetupOrganizationPage.tsx`, populate defaults from the browser:
```ts
const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
const detectedLocale = navigator.language ?? 'en';
const initialValues = {
  ...defaultValues,
  timezone: detectedTz,
  // currency and location can be inferred from locale subtag if desired
};
```
For `location` and `baseCurrency`, a lookup table keyed by `navigator.language` country subtag
(e.g., `"en-US"` → `"US"` / `"USD"`) provides reasonable defaults that the user can change
before saving.

---

## Summary Table

| # | Issue | File / Symbol | Root Cause One-liner |
|---|---|---|---|
| 1 | License revocation not enforced | `license-utils.ts:getActiveLicenseForTenant` + `finance-license.client.ts:mapStockixLicenseStatus` | `getActiveLicenseForTenant` never queries `status='revoked'`; null license maps to `"active"` in sync |
| 2 | ORGANIZATION_LIMIT_REACHED on COA copy | `License.service.ts:assertCanCreateOrganization` | Counts all Finance orgs including those under revoked licenses |
| 3 | Org settings missing from sidebar | Finance sidebar nav (main menu) | Preferences sidebar nav item removed from fork; pages at `/preferences/*` still exist |
| 4 | User cannot modify own profile | `AuthedController`, `TopbarUser.tsx` | No `PUT /auth/profile` endpoint and no UI entry point |
| 5 | Notifications non-functional | `notification-service.ts:safeCreateNotification` | Likely migration 0041 not applied; errors swallowed silently |
| 6 | Double-slash API URLs | `useRequest.tsx:useApiRequest` | `normalizeApiPath` missing from main `useApiRequest`; present only in `useAuthApiRequest` |
| 7 | BalanceSheet crash | `BalanceSheetTable.tsx:21` | Unconditional destructure of `undefined` when API errors; `isLoading` is false after react-query error |
| 8 | Setup wizard no auto-fill | `SetupOrganizationPage.tsx:defaultValues` | `timezone`, `location`, `baseCurrency` hardcoded as `''`; no `Intl` browser detection |
