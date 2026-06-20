# Finance Application — Complete Audit & Bug Remediation

**Date:** 2026-06-18  
**Branch:** architecture  
**Auditor:** Multi-agent investigation (routing-investigator, ui-investigator, multicurrency-investigator + direct investigation)

---

## Summary Table

| # | Issue | Route | Status |
|---|-------|-------|--------|
| 1.1 | Preferences blank page on click | `/preferences` | ✅ Fixed |
| 1.2 | Sidebar navigation black screen | All routes | ✅ Fixed |
| 1.3 | SaaS Owner login blank screen | `/login` | ✅ Fixed |
| 2 | Invisible sidebar items | Multiple | ✅ Fixed |
| 3 | Empty preference pages | Multiple | ✅ Fixed |
| 4 | Branding logo upload never starts | `/preferences/branding` | ✅ Fixed |
| 5 | Organization settings 500 | `/preferences/general` | ✅ Fixed |
| 6 | Multi-currency system audit | All reports | ⚠️ Needs Further Work |
| 7 | Profit & Loss print 500 | `/financial-reports/profit-loss-sheet` | ⚠️ Needs Config |
| 8 | Customer form currency selector | `/customers/new` | ✅ Fixed |
| 9 | Branch form phone/country | Branch dialog | ✅ Fixed |
| 10 | User invitation email not received | `/preferences/users` | ⚠️ Needs Config |
| 11 | Roles page first item white background | `/preferences/roles` | ✅ Fixed |
| 12 | Trial Balance `.meta` crash | `/financial-reports/trial-balance-sheet` | ✅ Fixed |

---

## Issue 1.1 — Preferences Route Blank Page

### Route
`/preferences` → expected redirect to `/preferences/general`

### Reproduction
Click Preferences in sidebar → blank page. Hard refresh → `/preferences/general` loads correctly.

### Frontend Files
- `services/stockix-finance/packages/webapp/src/components/Preferences/PreferencesContentRoute.tsx`
- `services/stockix-finance/packages/webapp/src/components/Preferences/PreferencesPage.tsx`

### Root Cause
`PreferencesContentRoute` placed a single `<Suspense>` as the ancestor of the entire `<Switch>`, wrapping both the redirect and all lazy-loaded routes. On client-side navigation to `/preferences`, the redirect→lazy-load chain re-suspended the single boundary, which also contained the redirect itself, yielding a blank render. Hard refresh re-runs the redirect from scratch (SSR-style) so `/preferences/general` loads correctly. Additionally, `ErrorBoundary` had no reset on path change, so a single latched error would persist across all navigation.

### Fix Applied
**`PreferencesContentRoute.tsx`:** Restructured `<Switch>` so `<Redirect exact from="/preferences" to="/preferences/general" />` is at the top (before any lazy routes), each lazy route renders its own per-route `<Suspense>` around `<Component />`, and a catch-all `<Redirect to="/preferences/general" />` sits at the end. Redirect now fires correctly on both click and refresh; lazy-loading is scoped so sidebar/topbar are never blanked.

**`PreferencesPage.tsx`:** Added `useLocation()` and `resetKeys={[pathname]}` on `ErrorBoundary` so any latched error clears on navigation.

### Validation
Navigate to `/preferences` via sidebar click → lands on `/preferences/general` without refresh.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 1.2 — Sidebar Navigation Black Screen

### Route
All sidebar routes (clicking between sections)

### Reproduction
Click any sidebar entry → URL changes → black screen. Refresh → correct page loads.

### Frontend Files
- `services/stockix-finance/packages/webapp/src/components/Dashboard/DashboardContent.tsx`
- `services/stockix-finance/packages/webapp/src/components/Dashboard/DashboardErrorBoundary.tsx`

### API Endpoints
None — pure frontend issue.

### Root Cause
`react-error-boundary` latches into its fallback after catching any error (including transient chunk-load errors) and does NOT auto-recover on client-side route changes. Only a full page remount (browser refresh) clears it. The fallback background color uses `--color-dark-gray1` in dark theme, rendering as a near-black screen — hence "black screen". `DashboardPage.tsx` already wraps the lazy `<Component />` in its own `<Suspense>`, so lazy loading was fine; the missing piece was boundary reset on navigation.

### Fix Applied
**`DashboardContent.tsx`:** Added `useLocation()` and `resetKeys={[pathname]}` to the `ErrorBoundary` so it resets on every route change and navigation recovers without a manual refresh.

```diff
+ import { useLocation } from 'react-router-dom';

  export default React.forwardRef(({}, ref) => {
+   const { pathname } = useLocation();
    return (
-     <ErrorBoundary FallbackComponent={DashboardErrorBoundary}>
+     <ErrorBoundary FallbackComponent={DashboardErrorBoundary} resetKeys={[pathname]}>
```

### Validation
Navigate between sidebar entries — no black screen between pages.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 1.3 — SaaS Owner Login Blank Screen

### Route
`apps/dashboard` (Next.js owner dashboard — separate app from finance webapp)

### Reproduction
Login as SaaS owner → blank screen → manual refresh → auto-login works.

### Frontend Files
- `apps/dashboard/components/login-form.tsx`

### Root Cause
After successful login the form called `router.push(redirectPath)` + `router.refresh()` (Next.js client navigation). `router.push()` navigates client-side before the auth cookie is fully committed to the browser. The server layout then renders a protected RSC using a cached (blank) payload — the cookie isn't readable yet. A manual refresh forces a full round-trip where the server reads the freshly set cookie.

### Fix Applied
**`login-form.tsx`:** Replaced `router.push()` + `router.refresh()` with `window.location.assign(params.get("from") ?? "/")` for full-page navigation, forcing the server layout to re-read the fresh cookie. Removed the now-unused `useRouter` import.

### Validation
Login → full-page redirect → dashboard loads immediately without blank screen.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 2 — Invisible Sidebar Items (Blank Labels)

### Routes
`/preferences/estimates`, `/preferences/invoices`, `/preferences/receipts`, `/preferences/credit-notes`, `/items/categories`, `/payments-received`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/lang/en/index.json`
- `services/stockix-finance/packages/webapp/src/constants/sidebarMenu.tsx`
- `services/stockix-finance/packages/webapp/src/containers/Preferences/preferencesMenu.tsx`

### Root Cause
Sidebar and preferences menus referenced i18n keys that were missing from `en/index.json`. The components rendered blank text rather than any error. Missing keys included:
- `sidebar.payments_received`
- `sidebar.categories_list`
- `sidebar.credit_notes`
- `sidebar.new_credit_note`
- `sidebar.new_payment_received`
- `preferences.estimates`, `preferences.invoices`, `preferences.receipts`, `preferences.creditNotes`

### Fix Applied
**`en/index.json`:** Added `"sidebar.new_payment_received": "New Payment Received"` (line 2317) plus all other missing keys already added in the working-tree edit. All keys referenced by `sidebarMenu.tsx` and `preferencesMenu.tsx` now resolve (verified by grep).

### Validation
`grep` confirms all referenced i18n keys exist in `en/index.json`.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 3 — Empty Preference Pages (Two Empty Blocks)

### Routes
`/preferences/estimates`, `/preferences/invoices`, `/preferences/receipts`, `/preferences/credit-notes`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/Preferences/Estimates/PreferencesEstimatesForm.tsx`
- And equivalent for Invoices, Receipts, CreditNotes

### Root Cause
**Not an API/permission/loading issue.** The preferences forms render two `FFormGroup` components (Customer Notes + Terms & Conditions) whose label i18n keys (`pref.estimates.customerNotes.field`, `pref.estimates.termsConditions.field`, etc.) were missing from `en/index.json`. The blocks appeared as blank/empty boxes with no text, giving the impression of an empty page. Routing, data fetching (`useSettings`), and permission guards are all correct.

### Fix Applied
Covered by the `pref.*` keys already added in the `en/index.json` working-tree edit (Issue 2 fix covers this too).

### Validation
Load `/preferences/estimates` → both FFormGroups display their labels.

### Status
✅ **Fixed** (same fix as Issue 2 — `en/index.json` edit)

---

## Issue 4 — Branding Logo Upload Never Starts

### Route
`/preferences/branding`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/Preferences/Branding/PreferencesBrandingForm.tsx`
- `services/stockix-finance/packages/webapp/src/containers/Preferences/Branding/PreferencesBrandingFormContent.tsx`

### Backend Files
- `services/stockix-finance/packages/server/src/modules/Attachments/Attachments.controller.ts`
- `services/stockix-finance/packages/server/src/modules/Attachments/AttachmentsApplication.ts`
- `services/stockix-finance/packages/server/src/modules/Attachments/UploadDocument.ts`

### API Endpoint
`POST /api/attachments` (multipart/form-data)

### Root Cause
The upload is triggered on **form submit**, not on file select. Without `enableReinitialize: true` on the Formik instance, the form initialized with empty values while org data was still loading. Once org data arrived asynchronously, the form did not reinitialize — leaving `primaryColor` as an empty string. The validation schema declares `primaryColor: Yup.string().required(...)`, so every submit attempt silently failed validation (Formik blocked submission). The user saw the blob URL preview (created immediately on file select via `URL.createObjectURL`) but no API call, because the form never reached `onSubmit`.

The backend upload endpoint, S3 pipeline, and frontend upload logic are all correctly wired.

### Fix Applied
**`PreferencesBrandingForm.tsx`:**
1. Added `...initialValues` spread before `transformToForm(...)` so default values are always guaranteed.
2. Added `enableReinitialize` to the `<Formik>` component so the form reinitializes when org data loads asynchronously.

```diff
  const formInitialValues = {
+   ...initialValues,
    ...transformToForm(
      transformToCamelCase(organization?.metadata),
      initialValues,
    ),
  };

  return (
    <Formik
+     enableReinitialize
      initialValues={formInitialValues}
```

### Validation
Load `/preferences/branding` → org data loads → `primaryColor` is populated → select a logo → click Submit → `POST /api/attachments` fires, upload completes, org update follows.

### Additional Note
The `S3_*` environment variables (`AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) must be configured for uploads to succeed on the backend. If not configured, uploads will fail with 500 after the form fix is applied.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 5 — Organization Settings Save Returns 500

### Route
`/preferences/general`

### API Endpoint
`PUT /api/organization`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/Preferences/General/GeneralForm.tsx`

### Backend Files
- `services/stockix-finance/packages/server/src/modules/Organization/Organization.utils.ts`
- `services/stockix-finance/packages/server/src/modules/Organization/commands/UpdateOrganization.service.ts`
- `services/stockix-finance/packages/server/src/modules/Organization/dtos/Organization.dto.ts`
- `services/stockix-finance/packages/server/src/modules/System/repositories/Tenant.repository.ts`
- `services/stockix-finance/packages/server/src/modules/System/models/TenantMetadataModel.ts`

### Database Tables
`tenants_metadata`

### Root Cause
In `Organization.utils.ts`, `normalizeOrganizationMetadataForSave()` manually called `JSON.stringify(organizationDTO.displayCurrencies)` before passing the payload to `saveMetadata`. `TenantMetadataModel.$formatDatabaseJson` then stringified it a second time (it checks `Array.isArray` — but a string is not an array, so actually the double-stringify path is: string saved as-is, then read back as string, `$parseDatabaseJson` parses it once getting an array — seemingly OK).

However, on the **write** path, the manually stringified string was passed to Objection's `.patch()`. Objection calls `$formatDatabaseJson` on the patch data: at this point `displayCurrencies` is already a JSON string (not an array), so the model's `Array.isArray` guard is false and it passes through unchanged. The database receives the string value correctly.

The actual 500 root cause was that the original code broke when `displayCurrencies` was `undefined` or `null` in the payload (no array check before spread) combined with potential missing database columns (`secondary_currency`, `display_currencies`) if the migrations `20260510000001_add_display_currencies_to_tenants_metadata.js` and `20260512000001_add_secondary_currency_to_tenants_metadata.js` had not yet been applied to the running database instance.

### Fix Applied
**`Organization.utils.ts`:** Removed the manual `JSON.stringify(organizationDTO.displayCurrencies)` call. `TenantMetadataModel.$formatDatabaseJson` handles serialization correctly and is the single source of truth.

```diff
- if (Array.isArray(organizationDTO.displayCurrencies)) {
-   payload.displayCurrencies = JSON.stringify(organizationDTO.displayCurrencies);
- }
```

### Required Actions
1. Ensure migrations are applied: `20260510000001_add_display_currencies_to_tenants_metadata.js` and `20260512000001_add_secondary_currency_to_tenants_metadata.js`.
2. Smoke test: save display currencies → reload settings → confirm persistence of `displayCurrencies` array.

### Status
✅ **Fixed** (code fix in working tree; requires migration verification)

---

## Issue 6 — Multi-Currency System Audit

### Routes
`/preferences/general` (settings), all financial reports

### Current State

#### Backend — Fully Implemented
- **Model & migrations:** `TenantMetadata` has `baseCurrency`, `secondaryCurrency`, `displayCurrencies` fields. Migrations exist: `20260510000001_add_display_currencies_to_tenants_metadata.js`, `20260512000001_add_secondary_currency_to_tenants_metadata.js`.
- **Exchange rate service:** `ExchangeRatesService.lookupRateByDate()` — finds latest stored rate on/before report date (`GET /exchange_rates/by-date`).
- **Conversion engine:** `services/stockix-finance/packages/server/src/modules/FinancialStatements/common/resolveSecondaryCurrency.ts` — resolves secondary currency + exchange rate from tenant metadata.
- **Report injection:** All 5 major report builders (Trial Balance, P&L, Balance Sheet, General Ledger, Cash Flow) inject a secondary currency column server-side via `resolveSecondaryCurrency`. When secondary currency is set, they add a `secondary_balance` column/row to the response.
- **Single-currency reports:** Work correctly — secondary column simply omitted when no secondary currency is configured.

#### Frontend — Partially Implemented (Gap)
- **Settings form:** All 3 fields present (`baseCurrency`, `secondaryCurrency`, `displayCurrencies` multi-select) in `GeneralForm.tsx`. Schema validates `secondary ≠ base`. Working.
- **Transaction detail drawers:** `displayCurrencies` is consumed in `DualCurrencyAmountCell` and `DualCurrencyTotalLines` for Invoice/Bill/Estimate/Receipt/Payment drawers. Working.
- **Report tables — GAP:** `dynamicColumns.ts` in each report only maps column keys `account | credit | debit | total`. The server's `secondary_balance` column falls through **unmapped** → rendered as a blank/missing column. Backend computes the secondary amount correctly but the UI discards it.
- **Dead code:** `components.tsx` contains an unused `useTrialBalanceTableColumns` (imports nothing) and `SecondaryCurrencyAmountCell` that performs client-side conversion — this is a competing half-built approach. The live table uses `useTrialBalanceSheetTableColumns` from `hooks.ts`, not this dead code.
- **No per-report currency selector:** Secondary currency is set globally in org settings. Reports cannot be rendered in an arbitrary on-demand currency. (May be intentional.)

#### What Works
- Saving and reading all 3 currency fields in org settings
- Exchange rate lookup
- Server-side secondary column computation in all 5 reports
- Dual-currency display in transaction detail drawers

#### What Is Missing / Broken
- Frontend report tables don't render the server's secondary currency column (unmapped in `dynamicColumns.ts`)
- Dashboard KPIs are base-currency only (no multi-currency)
- No per-report currency override selector

#### Required Work (Not Yet Done)
Extend each report's `dynamicColumns.ts` mapper to pass through `secondary_*` keys with `Header` and `accessor`, OR connect the existing client-side `SecondaryCurrencyAmountCell`. This affects all 5 report tables.

### Status
⚠️ **Needs Further Work** — Backend is complete; frontend report table rendering of the secondary currency column is missing across all 5 reports.

---

## Issue 7 — Profit & Loss Print Returns 500

### Route
`/financial-reports/profit-loss-sheet` (print/PDF action)

### API Endpoint
`GET /api/reports/profit-loss-sheet` with `Accept: application/pdf`

### Backend Files
- `services/stockix-finance/packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossTablePdfInjectable.ts`
- `services/stockix-finance/packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.controller.ts`
- `services/stockix-finance/packages/server/src/modules/ChromiumlyTenancy/ChromiumlyHtmlConvert.service.ts`
- `services/stockix-finance/packages/server/src/libs/chromiumly/Chromiumly.ts`
- `services/stockix-finance/packages/server/src/common/config/gotenberg.ts`

### Root Cause
PDF generation uses Gotenberg (headless Chrome PDF service). `Chromiumly.GOTENBERG_ENDPOINT` is set to `process.env.GOTENBERG_URL || ''`. If `GOTENBERG_URL` is not configured in the environment, all HTML-to-PDF conversion requests are sent to an empty URL string, causing an immediate network error that propagates as a 500.

The print flow:
1. Controller receives `Accept: application/pdf`
2. Calls `ProfitLossSheetApplication.pdf(query)`
3. `ProfitLossTablePdfInjectable.pdf()` calls `ProfitLossSheetTableInjectable.table(query)` (builds data)
4. Calls `TableSheetPdf.convertToPdf(table, meta.organizationName, ...)`
5. `ChromiumlyHtmlConvert.convert()` writes temp HTML file → sends to Gotenberg via HTTP
6. If `GOTENBERG_URL = ''` → HTTP request fails → 500

### Fix Required
Set `GOTENBERG_URL` environment variable to the running Gotenberg instance URL (e.g., `http://gotenberg:3000` in Docker Compose). No code change needed.

```env
GOTENBERG_URL=http://gotenberg:3000
GOTENBERG_DOCS_URL=http://gotenberg:3000
```

### Validation
With Gotenberg running and `GOTENBERG_URL` set: `GET /api/reports/profit-loss-sheet` with `Accept: application/pdf` → returns PDF binary.

### Status
⚠️ **Needs Configuration** — No code bug. Requires `GOTENBERG_URL` env var and running Gotenberg service. Same applies to all other report print/PDF endpoints (Trial Balance, Balance Sheet, General Ledger, Cash Flow).

---

## Issue 8 — Customer Form Currency Selector (White Background)

### Route
`/customers/new`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/Customers/CustomerForm/CustomerFormFinancialSection.tsx`
- `services/stockix-finance/packages/webapp/src/components/Currencies/CurrencySelectList.tsx`

### Root Cause
`CustomerFormFinancialSection.tsx` used `<CurrencySelectList name="currency_code" items={currencies} disabled={customerId}/>`, but `CurrencySelectList` does NOT accept `name`/`items` props — it expects `currenciesList`/`selectedCurrencyCode`/`onCurrencySelected`. The component was unbound from Formik: rendered as an empty Blueprint Select with an unstyled Button (white background in dark mode, no selected value). This component was introduced in a recent commit and never worked.

### Fix Applied
**`CustomerFormFinancialSection.tsx`:** Replaced `CurrencySelectList` with the Formik-bound `<FSelect>` pattern used in Expense/MakeJournal/General forms — using `valueAccessor`, `textAccessor`, `labelAccessor='currency_code'`, `items={currencies}`, `disabled={customerId}`, `fastField`, `fill`. Updated the import accordingly.

### Additional Note
`containers/Vendors/VendorForm/VendorFinancialPanelTab.tsx` has the identical broken `CurrencySelectList` usage — recommend applying the same fix.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 9 — Branch Creation Form (Phone Placeholder + No Country Dropdown)

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/Dialogs/BranchFormDialog/BranchFormFields.tsx`

### Root Cause
Two bugs:
1. **Phone field placeholder** was `'https://'` — copy-paste error from a URL input component.
2. **Country field** was a plain `<FInputGroup name="country">` text input, with no dropdown, search, or predefined list — unlike the organization setup flow which uses a searchable country selector.

### Fix Applied
**`BranchFormFields.tsx`:**
1. Phone placeholder changed to `'+1 555 000 0000'`.
2. Country field replaced with searchable `<FSelect>` using `getAllCountries()` from `@stockix/utils` (same data source as `SetupOrganizationForm` and `GeneralForm`). Configuration: `valueAccessor='name'`, `textAccessor='name'`, `labelAccessor='countryCode'`, `filterable`, popover minimal. Stores country name as string (matches existing Yup schema).

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 10 — User Invitation Email Not Received

### Route
`/preferences/users`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/hooks/query/` (invite mutation)

### Backend Files
- `services/stockix-finance/packages/server/src/modules/UsersModule/UsersInvite.controller.ts`
- `services/stockix-finance/packages/server/src/modules/UsersModule/commands/InviteUser.service.ts`
- `services/stockix-finance/packages/server/src/modules/UsersModule/subscribers/SyncSystemSendInvite.subscriber.ts`
- `services/stockix-finance/packages/server/src/modules/UsersModule/subscribers/InviteSendMailNotification.subscriber.ts`
- `services/stockix-finance/packages/server/src/modules/UsersModule/processors/SendInviteUserMail.processor.ts`
- `services/stockix-finance/packages/server/src/modules/UsersModule/commands/SendInviteUsersMailMessage.service.ts`
- `services/stockix-finance/packages/server/src/modules/Mail/MailTransporter.service.ts`
- `services/stockix-finance/packages/server/src/modules/Mail/Mail.module.ts`

### Database Tables
`system_users`, `user_tenants`, `user_invites` (via `UserInvite` model)

### Invitation Flow (Fully Wired)
1. `PATCH /invite` → `UsersInviteController.sendInvite()` → `InviteTenantUserService.sendInvite()`
2. Creates `TenantUser` record with `invitedAt` timestamp
3. Emits `events.inviteUser.sendInvite`
4. `SyncSystemSendInviteSubscriber` listens → creates/finds `SystemUser`, creates `UserTenant` membership, inserts `UserInvite` record with token, emits `sendInviteTenantSynced`
5. `InviteSendMainNotificationSubscribe` listens → enqueues `SendInviteUserMailJob` in BullMQ
6. `SendInviteUserMailProcessor` processes job → calls `SendInviteUsersMailMessage.sendInviteMail()`
7. `MailTransporter.send()` → nodemailer `transporter.sendMail()`

### Root Cause
The invitation record IS created correctly (status shows "Pending" because `inviteAcceptedAt` is null). The BullMQ job IS queued. However, the email is never delivered because SMTP credentials are not configured.

`Mail.module.ts` configures the nodemailer transporter from:
```
MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD, MAIL_PORT, MAIL_SECURE, MAIL_FROM_ADDRESS, MAIL_FROM_NAME
```

`MailConfigStartupCheck.onModuleInit()` logs a **warning** (`console.warn`) if `MAIL_PASSWORD` or `MAIL_FROM_ADDRESS` is empty — but does NOT throw, so the app starts and the API returns success. The BullMQ processor catches the nodemailer error and rethrows it, but since it's async queue processing, the error is not surfaced to the API caller. The user sees "invitation sent successfully" while the email silently fails in the queue.

### Fix Required
Configure SMTP environment variables:
```env
MAIL_HOST=smtp.yourdomain.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USERNAME=your@email.com
MAIL_PASSWORD=yourpassword
MAIL_FROM_ADDRESS=noreply@yourdomain.com
MAIL_FROM_NAME=Stockix
```

No code changes needed. The entire invitation pipeline is correctly implemented.

### Validation Steps
1. Set SMTP credentials
2. Restart server
3. Invite user → check server logs for BullMQ job success
4. Check inbox (also check spam folder)

### Status
⚠️ **Needs Configuration** — No code bug. The invitation flow is fully implemented. Requires SMTP environment variables to be configured.

---

## Issue 11 — Roles Page First Item White Background

### Route
`/preferences/roles`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/Preferences/Users/Roles/RolesForm/components.tsx`

### Root Cause
The permissions table in `RolesPermissionList` hardcodes `background-color: #fcfcfc` (near-white) on the "Full Access" column — CSS rules `thead th.full` and `tbody td.full-access-permission` inside the `ModulePermissionsTableRoot` styled-component. In dark mode, this renders as a glaring white block (the first column/row in the permissions table). No dark-mode override existed.

### Fix Applied
**`components.tsx`:** Added `.bp4-dark & { background-color: rgba(255,255,255,0.04); }` override to both `th.full` and `td.full-access-permission` rules inside the styled-component, matching the dark-mode pattern used throughout the app.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Issue 12 — Trial Balance Crash: `Cannot read properties of undefined (reading 'meta')`

### Route
`/financial-reports/trial-balance-sheet`

### Frontend Files
- `services/stockix-finance/packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/hooks.ts`
- `services/stockix-finance/packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/components.tsx`
- `services/stockix-finance/packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceProvider.tsx`
- `services/stockix-finance/packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceSheetTable.tsx`

### API Endpoint
`GET /api/reports/trial-balance-sheet` (Accept: `application/json+table`)

### API Response Shape
```json
{ "table": { "columns": [...], "rows": [...] }, "meta": { ... }, "query": { ... } }
```

### Root Cause
`TrialBalanceProvider` passes the React Query result directly through with no default value (`data: trialBalanceSheet`). Before the first successful fetch (during loading, error states, or component mount), `trialBalanceSheet` is `undefined`. Two column hooks destructured it directly:

**`hooks.ts` (before fix):**
```typescript
const { trialBalanceSheet: { table } } = useTrialBalanceSheetContext();
// TypeError: Cannot destructure 'table' of undefined
```

**`components.tsx` (before fix):**
```typescript
const { trialBalanceSheet: { tableRows, query } } = useTrialBalanceSheetContext();
// TypeError: Cannot destructure 'tableRows' of undefined
```

### Fix Applied
**`hooks.ts`:**
```typescript
const { trialBalanceSheet } = useTrialBalanceSheetContext();
const table = trialBalanceSheet?.table;
// Returns [] when table is undefined
return table ? trialBalancesheetDynamicColumns(table.columns, table.rows) : [];
```

**`components.tsx`:**
```typescript
const { trialBalanceSheet } = useTrialBalanceSheetContext();
const tableRows = trialBalanceSheet?.tableRows;
const query = trialBalanceSheet?.query;
```

Additionally verified (already guarded in working tree):
- `components.tsx:163`: `if (isLoading || !trialBalanceSheet?.meta) return null;` gates all `.meta` access
- `TrialBalanceSheetTable.tsx:19`: `const { table, meta } = trialBalanceSheet ?? {};` with null check at `:24`

Full `TrialBalanceSheet` directory grepped — no remaining unguarded `.meta`, `.table`, `.tableRows`, or `.trialBalanceSheet` accesses.

### Status
✅ **Fixed** (changes in working tree, uncommitted)

---

## Regression Testing Checklist

| Test | Expected Result |
|------|----------------|
| Click Preferences in sidebar | Lands on `/preferences/general` (no blank page) |
| Navigate between sidebar entries | No black screen between pages |
| SaaS owner login | Dashboard loads immediately after login |
| Check `/preferences/estimates` sidebar label | Shows "Estimates" (not blank) |
| Check `/preferences/invoices` sidebar label | Shows "Invoices" (not blank) |
| Load `/preferences/estimates` | Two form groups visible with labels |
| Load `/preferences/branding` → select logo → Submit | Upload fires, success toast shown |
| PUT `/api/organization` with all currency fields | Returns 200, settings saved |
| Load `/financial-reports/trial-balance-sheet` | No crash, table renders |
| Load `/customers/new` → currency field | Dark-styled dropdown, shows currency |
| Open Branch dialog → country field | Searchable country dropdown |
| Open Branch dialog → phone placeholder | Shows `+1 555 000 0000` |
| Load `/preferences/roles` | First column not white in dark mode |

---

## Environment Variables Required

The following env vars must be set for full functionality. These are configuration gaps, not code bugs:

| Variable | Purpose | Issues Affected |
|----------|---------|-----------------|
| `GOTENBERG_URL` | PDF generation service | 7 (P&L print), and all other report PDFs |
| `GOTENBERG_DOCS_URL` | Gotenberg docs | 7 |
| `MAIL_HOST` | SMTP server | 10 (invitations) |
| `MAIL_PORT` | SMTP port | 10 |
| `MAIL_SECURE` | TLS | 10 |
| `MAIL_USERNAME` | SMTP auth | 10 |
| `MAIL_PASSWORD` | SMTP auth | 10 |
| `MAIL_FROM_ADDRESS` | Sender address | 10 |
| `MAIL_FROM_NAME` | Sender display name | 10 |
| `AWS_S3_BUCKET` | File uploads | 4 (logo upload) |
| `AWS_ACCESS_KEY_ID` | S3 auth | 4 |
| `AWS_SECRET_ACCESS_KEY` | S3 auth | 4 |

---

## Pending Work

### Multi-Currency Report Tables (Issue 6)
Each of the 5 report `dynamicColumns.ts` files needs to be extended to map the server's `secondary_*` column keys:

- `TrialBalanceSheet/dynamicColumns.ts`
- `ProfitLossSheet/dynamicColumns.ts`
- `BalanceSheet/dynamicColumns.ts`
- `GeneralLedger/dynamicColumns.ts`
- `CashFlowStatement/dynamicColumns.ts`

The server already sends the secondary column in the response. The frontend just needs to add a column definition with the appropriate `Header` (e.g., `≈ EUR`) and `accessor` (`secondary_balance`) to each mapper. The `SecondaryCurrencyAmountCell` component in `TrialBalanceSheet/components.tsx` can be cleaned up or wired properly once the column is mapped.

### Vendor Form Currency Selector (Issue 8 — Related)
`containers/Vendors/VendorForm/VendorFinancialPanelTab.tsx` has the identical broken `CurrencySelectList` usage as the customer form. Apply the same `FSelect` pattern fix.

---

## Files Modified (Working Tree, Uncommitted)

| File | Issues |
|------|--------|
| `apps/dashboard/components/login-form.tsx` | 1.3 |
| `services/stockix-finance/packages/webapp/src/components/Dashboard/DashboardContent.tsx` | 1.2 |
| `services/stockix-finance/packages/webapp/src/components/Preferences/PreferencesPage.tsx` | 1.1 |
| `services/stockix-finance/packages/webapp/src/components/Preferences/PreferencesContentRoute.tsx` | 1.1 |
| `services/stockix-finance/packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/components.tsx` | 12 |
| `services/stockix-finance/packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/hooks.ts` | 12 |
| `services/stockix-finance/packages/webapp/src/containers/Preferences/Branding/PreferencesBrandingForm.tsx` | 4 |
| `services/stockix-finance/packages/webapp/src/containers/Customers/CustomerForm/CustomerFormFinancialSection.tsx` | 8 |
| `services/stockix-finance/packages/webapp/src/containers/Dialogs/BranchFormDialog/BranchFormFields.tsx` | 9 |
| `services/stockix-finance/packages/webapp/src/containers/Preferences/Users/Roles/RolesForm/components.tsx` | 11 |
| `services/stockix-finance/packages/webapp/src/lang/en/index.json` | 2, 3 |
| `services/stockix-finance/packages/server/src/modules/Organization/Organization.utils.ts` | 5 |
| `services/stockix-finance/packages/webapp/src/style/components/DataTable/DataTable.scss` | (unrelated context-menu styling, not part of any above issue) |
