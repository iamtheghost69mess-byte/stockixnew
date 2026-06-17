# Finance Application — 7-Issue Bug Investigation & Fixes

Stack: NestJS backend (`packages/server/src`) + React/TypeScript webapp (`packages/webapp/src`), BlueprintJS UI. Bigcapital-derived codebase. All paths below are relative to `services/stockix-finance`.

---

## Issue 1 – Trial Balance Sheet Crash

### Reproduction Steps
1. Navigate to `/financial-reports/trial-balance-sheet`.
2. On initial mount (before the report data has loaded), the page throws.
3. Console: `TypeError: Cannot read properties of undefined (reading 'meta')`.

### Root Cause
`TrialBalanceSheetAlerts` is rendered **outside** the `isLoading` guard in `TrialBalanceSheet.tsx` (line 64). It destructured `trialBalanceSheet: { meta }` from context at the top of the component, **before** the `if (isLoading) return null;` check. On the first render the React Query hook has not resolved yet, so `trialBalanceSheet` is `undefined`. Babel transpiles the object destructure into a direct `trialBalanceSheet.meta` member access, producing exactly `Cannot read properties of undefined (reading 'meta')`.

`TrialBalanceSheetTable.tsx` had the same unguarded destructure (`trialBalanceSheet: { table, query, meta }`); it was only protected indirectly by the body's `isLoading` check, so it would still crash if the query settled with `undefined` data (e.g. on error).

### Files Involved
- `packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/components.tsx` (`TrialBalanceSheetAlerts`, lines ~151–178)
- `packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceSheet.tsx` (line 64 — renders the alerts outside the loading guard)
- `packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceSheetTable.tsx` (lines 16–24)
- `packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceProvider.tsx` (supplies `trialBalanceSheet`, `isLoading`)
- Data source: `hooks/query/FinancialReports/use-trial-balance-sheet.ts` → `GET /reports/trial-balance-sheet` (`Accept: application/json+table`), `select: (res) => res.data`. Returns `undefined` until loaded.

### Code Changes
`components.tsx` — `TrialBalanceSheetAlerts`:
```diff
-  const {
-    trialBalanceSheet: { meta },
-    isLoading,
-    refetchSheet,
-  } = useTrialBalanceSheetContext();
+  const {
+    trialBalanceSheet,
+    isLoading,
+    refetchSheet,
+  } = useTrialBalanceSheetContext();
   ...
-  if (isLoading) {
-    return null;
-  }
+  if (isLoading || !trialBalanceSheet?.meta) {
+    return null;
+  }

-    <If condition={meta.is_cost_compute_running}>
+    <If condition={trialBalanceSheet.meta.is_cost_compute_running}>
```

`TrialBalanceSheetTable.tsx`:
```diff
-  const {
-    trialBalanceSheet: { table, query, meta },
-    isLoading,
-  } = useTrialBalanceSheetContext();
+  const { trialBalanceSheet, isLoading } = useTrialBalanceSheetContext();
+  const { table, meta } = trialBalanceSheet ?? {};

   const columns = useTrialBalanceSheetTableColumns();
+
+  if (!table) {
+    return null;
+  }
```

### Validation Steps
- Load `/financial-reports/trial-balance-sheet` cold: no crash; skeleton shows while loading, then the table renders.
- The cost-compute alert still appears when `meta.is_cost_compute_running` is true after data loads.

### Regression Checks
- `dateText={meta?.formatted_date_range ?? meta?.formatted_as_date}` still works (meta defined once table renders).
- The unused `query` destructure was removed (was never referenced).

### Status: Fixed

---

## Issue 2 – Preferences Route Redirect Problem

### Reproduction Steps
1. Click the user menu → **Preferences** (navigates to `/preferences`).
2. The page lands on `/preferences` and does not consistently advance to `/preferences/general` until a manual refresh.

### Root Cause
The redirect from `/preferences` was handled by a **lazy-loaded** component, `containers/Preferences/DefaultRoute.tsx`, registered at path `/preferences/` in the route table. Because it was `lazy(() => import(...))`, clicking the menu caused React to suspend (Suspense spinner) while the chunk downloaded, leaving the URL on `/preferences`; the redirect only fired once the chunk resolved (inconsistent vs. a refresh where the chunk may already be cached). The component also used the anti-pattern `<Redirect from='/preferences' .../>` rendered outside a `Switch` (the `from` prop is ignored there).

### Files Involved
- `packages/webapp/src/components/Preferences/PreferencesContentRoute.tsx` (the `<Switch>` for `/preferences/*`)
- `packages/webapp/src/routes/preferences.tsx` (route table; previously contained the lazy `/preferences/` → `DefaultRoute`)
- `packages/webapp/src/containers/Preferences/DefaultRoute.tsx` (deleted)
- Sidebar/topbar trigger: `components/Dashboard/TopbarUser.tsx:72` (`history.push('/preferences')`)

### Code Changes
`PreferencesContentRoute.tsx` — synchronous redirect as the first `Switch` child:
```diff
         <Switch>
+          <Redirect exact from="/preferences" to="/preferences/general" />
           {preferencesRoutes.map((route, index) => ( ... ))}
           <Redirect to="/preferences/general" />
         </Switch>
```

`routes/preferences.tsx` — removed the redundant lazy `DefaultRoute` entry:
```diff
-  {
-    path: `${BASE_URL}/`,
-    component: lazy(() => import('../containers/Preferences/DefaultRoute')),
-    exact: true,
-  },
 ];
```

Deleted now-unused file `containers/Preferences/DefaultRoute.tsx`.

### Validation Steps
- Click **Preferences** from any page → immediately lands on `/preferences/general` (synchronous, no spinner flash).
- Refresh on `/preferences` → same result.
- Unknown sub-paths (e.g. `/preferences/foo`) still fall through to the trailing `<Redirect to="/preferences/general" />`.

### Regression Checks
- All explicit tabs (`/preferences/general`, `/branding`, `/users`, …) still match their own routes before the catch-all.
- Trailing-slash `/preferences/` is now covered by the final catch-all redirect.

### Status: Fixed

---

## Issue 3 – Invisible Profile/Edit Menu Item

### Reproduction Steps
1. Open the topbar user dropdown.
2. The menu item that opens the First/Last name edit dialog renders with no visible label (`<a class="bp4-menu-item ..."><div class="bp4-fill bp4-text-overflow-ellipsis"></div></a>`).

### Root Cause
The menu item label is `<T id={'edit_profile'} />` (`react-intl-universal`). The translation key `edit_profile` was **missing** from the locale dictionary, so `intl.get('edit_profile')` returned an empty string → empty label. Sibling keys (`logout`, `preferences`, `keyboard_shortcuts`) were present, confirming the gap.

### Files Involved
- `packages/webapp/src/components/Dashboard/TopbarUser.tsx:63` (`<MenuItem text={<T id={'edit_profile'} />} onClick={() => openDialog(DialogsName.UserProfileForm)} />`)
- `packages/webapp/src/lang/en/index.json` (missing key)

### Code Changes
`lang/en/index.json`:
```diff
   "preferences": "Preferences",
+  "edit_profile": "Edit Profile",
   "auditing_system": "Auditing System",
```

### Validation Steps
- Open the user dropdown → the item now reads **Edit Profile** and still opens the `UserProfileForm` dialog (First/Last name).

### Regression Checks
- Pure JSON key addition; no impact on other entries. Other locales (ar/es/sv) fall back to the key as before.

### Status: Fixed

---

## Issue 4 – Invisible Sidebar Menu Item (Banking/Cash)

### Reproduction Steps
1. View the main dashboard sidebar.
2. The Banking overlay entry (opens Cash/Bank Accounts, Rules, Add Money In/Out, Add Cash/Bank Account) renders with no visible title.

### Root Cause
The sidebar overlay item uses `<T id={'sidebar.banking'} />` (`constants/sidebarMenu.tsx:444`, also `:449`). The translation key `sidebar.banking` was **missing** from the locale, while neighbouring keys (`sidebar.cash_bank_accounts`, `sidebar.add_money_in`, `sidebar.new_tasks`, …) were present — so only the Banking label rendered empty.

### Files Involved
- `packages/webapp/src/constants/sidebarMenu.tsx:444` (Cashflow overlay item) and `:449` (its group header)
- `packages/webapp/src/lang/en/index.json` (missing key)

### Code Changes
`lang/en/index.json`:
```diff
+  "sidebar.banking": "Banking",
   "sidebar.cash_bank_accounts": "Cash/Bank Accounts",
   "sidebar.add_money_in": "Add Money In",
```

### Validation Steps
- Sidebar now shows **Banking**; clicking it opens the overlay with Cash/Bank Accounts, Rules, Add Money In/Out, Add Cash/Bank Account.

### Regression Checks
- Items are RBAC-gated by `permission: { subject: AbilitySubject.Cashflow, ability: CashflowAction.* }`; gating unchanged. Label-only fix.

### Status: Fixed

---

## Issue 5 – Branding Logo Upload Not Working

### Reproduction Steps
1. Go to `/preferences/branding`.
2. Click **Upload File** / select an image.
3. Nothing happens — no preview, no network request, no error; on submit the logo is not applied.

### Root Cause
Two distinct defects:

1. **File picker never returns a file (primary symptom).** `CompanyLogoUpload` uses the shared `Dropzone` (`components/Dropzone/Dropzone.tsx`), whose default props set `useFsAccessApi: true`. With the File System Access API, `accept` is converted to `showOpenFilePicker` `types`. The picker is configured with **mime types only** (`{'image/png': [], 'image/jpeg': []}` — empty extension arrays), which makes `showOpenFilePicker` throw a `DOMException`. react-dropzone swallows that error, so the dialog effectively does nothing — no `onDropAccepted`, no preview, no formik `_logoFile`, and therefore no upload on submit.

2. **Logo key would not persist even after a successful upload.** `PreferencesBrandingForm` holds **camelCase** form values (`logoKey`, `primaryColor`) but ran `transfromToSnakeCase(...)` before `PUT /organization`. The backend `UpdateOrganizationDto` is camelCase and the global validation pipe strips non-whitelisted (snake_case) props, so `logoKey`/`primaryColor` were discarded server-side. (Same casing class of bug as Issue 7.)

The backend endpoint itself is correct: `POST /attachments` exists (`modules/Attachments/Attachments.controller.ts`, `@UseInterceptors(FileInterceptor('file'))`), and `useUploadAttachments` posts the `FormData` to it.

### Files Involved
- `packages/webapp/src/containers/ElementCustomize/components/CompanyLogoUpload.tsx` (Dropzone config, lines 66–75)
- `packages/webapp/src/components/Dropzone/Dropzone.tsx` (`useFsAccessApi` default true, line 148; passes to `useDropzone`, line 224)
- `packages/webapp/src/containers/Preferences/Branding/PreferencesBrandingFormContent.tsx` (`BrandingCompanyLogoUpload`, sets `_logoFile`/`logoUri` on change)
- `packages/webapp/src/containers/Preferences/Branding/PreferencesBrandingForm.tsx` (submit: upload then `updateOrganization`)
- `packages/webapp/src/hooks/query/attachments.ts` (`useUploadAttachments` → `POST attachments`)
- Backend: `packages/server/src/modules/Attachments/Attachments.controller.ts`

### Code Changes
`CompanyLogoUpload.tsx` — disable the FS Access API so a native `<input type="file">` is used (works with mime-type accept):
```diff
       maxSize={5 * 1024 ** 2}
       accept={[MIME_TYPES.png, MIME_TYPES.jpeg]}
       classNames={{ root: clsx(styles?.root, classNames?.root), content: styles.dropzoneContent }}
       activateOnClick={false}
+      useFsAccessApi={false}
       openRef={openRef}
```

`PreferencesBrandingForm.tsx` — send camelCase (do not snake-case the payload), and drop the now-unused import:
```diff
-import {
-  excludePrivateProps,
-  transformToCamelCase,
-  transformToForm,
-  transfromToSnakeCase,
-} from '@/utils';
+import {
+  excludePrivateProps,
+  transformToCamelCase,
+  transformToForm,
+} from '@/utils';
 ...
-    const __values = transfromToSnakeCase(
-      omit(excludedPrivateValues, ['logoUri']),
-    );
+    const __values = omit(excludedPrivateValues, ['logoUri']);
     // @ts-expect-error
     await updateOrganization({ ...__values });
```

### Validation Steps
- `/preferences/branding` → **Upload File** opens the OS picker; selecting a PNG/JPEG shows the preview immediately.
- Submit → `POST /attachments` fires (returns `key`), then `PUT /organization` with `{ logoKey, primaryColor }`; logo persists and appears on reload.

### Regression Checks
- `ImportDropzoneFile.tsx` uses the same shared `Dropzone` but was left untouched (csv/xls/xlsx, separate flow); the fix is scoped to the logo uploader via the `useFsAccessApi={false}` prop.
- Branding boot still hydrates initial values via `transformToCamelCase(organization?.metadata)`, so load/save casing is now consistent.

### Status: Fixed

---

## Issue 6 – Time Zone Dropdown Styling Bug

### Reproduction Steps
1. Go to `/preferences/general`.
2. The Time Zone field appears blank/white; the value (e.g. `Asia/Beirut … +03:00`) is only perceptible on hover.

### Root Cause
The field renders `@blueprintjs/timezone` `TimezonePicker` with `valueDisplayFormat="composite"`. The FormGroup carries the global `form-group--select-list` class, whose styling in `style/objects/form.scss` sets the button text to the very faint `color: #8d8d8d` (line 201). A darker override exists only for `.bp4-popover-target .bp4-button` (`#1C2127`, lines 253–256), so depending on render state the composite value falls back to the near-invisible gray — reading as "blank/white" on a white button background.

The page-specific stylesheet `style/pages/Preferences/GeneralForm.scss` already attempted a fix, but its rules were scoped to `.preferences-page__inside-content--general` — and although that wrapper class **is** applied (via `GeneralFormProvider`), it contained no rule for the timezone control. (The sibling register-organization page carries an explicit `.form-group--time-zone` fix, confirming the same control needs it here.)

### Files Involved
- `packages/webapp/src/containers/Preferences/General/GeneralForm.tsx:218–242` (`FastField name="timezone"` → `TimezonePicker`, FormGroup class `form-group--time-zone`)
- `packages/webapp/src/style/objects/form.scss:200–201` (faint `#8d8d8d`), `:253–256` (dark override scoped to `.bp4-popover-target`)
- `packages/webapp/src/style/pages/Preferences/GeneralForm.scss` (page stylesheet; imported by `GeneralFormPage.tsx:6`)
- `packages/webapp/src/style/pages/register-organizaton.scss:57–67` (reference fix for the same control)

### Code Changes
`style/pages/Preferences/GeneralForm.scss` — force the selected timezone value to a visible dark color on a white button (rule keyed on the applied `form-group--time-zone` class):
```scss
.form-group--time-zone {
  .bp4-button:not(:disabled) {
    background: #fff;

    &,
    .bp4-button-text {
      color: #1c2127;
    }
  }

  .bp4-text-muted {
    color: #5c7080;
  }
}
```

### Validation Steps
- `/preferences/general` → the Time Zone value (`Asia/Beirut (EEST) +03:00`) is clearly visible without hovering.
- Opening the picker and selecting another zone updates the visible value.

### Regression Checks
- Rule scoped to `.form-group--time-zone`, so other select-list fields are unaffected.
- Placeholder (`.bp4-text-muted`) remains a standard muted gray rather than invisible.

### Status: Fixed

---

## Issue 7 – Currency Update Fails (500)

### Reproduction Steps
1. Go to `/preferences/general`.
2. Change the base currency (or save the form) → `PUT /api/organization` returns **500 Internal Server Error**.

### Root Cause
Casing mismatch between the General form and the backend DTO, which cascades into a database error:

1. The General form uses **snake_case** field names (`base_currency`, `secondary_currency`, `display_currencies`, `fiscal_year`, `date_format`) and submitted `updateOrganization({ ...values })` as-is.
2. The backend `UpdateOrganizationDto` is **camelCase**, and the global validation pipe (`common/pipes/ClassValidation.pipe.ts`, `validate(object, { whitelist: true })`) **strips** every non-decorated property. So `base_currency` etc. are removed and `organizationDTO.baseCurrency` becomes `undefined`. (Single-word fields like `name`/`industry`/`location`/`language`/`timezone` survive because they are identical in both cases.)
3. In `UpdateOrganization.service.execute`, the guard was `if (organizationDTO.baseCurrency !== tenant.metadata?.baseCurrency)`. With `baseCurrency === undefined` and an existing currency of e.g. `USD`, `undefined !== 'USD'` is **true**, so the `onOrganizationBaseCurrencyUpdated` event fires.
4. The subscriber `MutateBaseCurrencyAccountsSubscriber` calls `mutateAllAccountsCurrency(organizationDTO.baseCurrency)` → `accountModel().query().update({ currencyCode: undefined })`. An Objection/Knex update whose only column is `undefined` throws → **500**. (And the currency never actually changed.)

### Files Involved
- `packages/webapp/src/containers/Preferences/General/GeneralFormPage.tsx` (submit handler; sent snake_case)
- `packages/webapp/src/containers/Preferences/General/GeneralForm.tsx:113–196` (snake_case field names: `base_currency`, `secondary_currency`, `fiscal_year`)
- `packages/webapp/src/hooks/query/organization.tsx:82-96` (`useUpdateOrganization` → `PUT organization`)
- `packages/webapp/src/services/axios.tsx` (no case-conversion interceptor — confirms raw casing reaches the API)
- `packages/server/src/common/pipes/ClassValidation.pipe.ts` (whitelist stripping)
- `packages/server/src/modules/Organization/dtos/Organization.dto.ts` (`UpdateOrganizationDto`, camelCase)
- `packages/server/src/modules/Organization/commands/UpdateOrganization.service.ts:31,44` (base-currency guard + event emit)
- `packages/server/src/modules/Accounts/susbcribers/MutateBaseCurrencyAccounts.subscriber.ts` and `modules/Accounts/MutateBaseCurrencyAccounts.ts:17` (`update({ currencyCode })`)
- `packages/server/src/modules/System/models/TenantMetadataModel.ts` and `repositories/Tenant.repository.ts:108` (`saveMetadata` persistence, camelCase columns)

### Code Changes
Frontend — `GeneralFormPage.tsx` send camelCase so the DTO is populated correctly:
```diff
-import { transformToForm, transfromToSnakeCase } from '@/utils';
+import { transformToForm, transfromToSnakeCase, transformToCamelCase } from '@/utils';
 ...
-    updateOrganization({ ...values }).then(onSuccess).catch(onError);
+    updateOrganization(transformToCamelCase(values)).then(onSuccess).catch(onError);
```
(`transformToCamelCase` deep-maps keys via `lodash.camelCase`; string arrays like `display_currencies` are preserved as values.)

Backend — `UpdateOrganization.service.ts` only mutate account currency when a base currency is actually supplied and changed (defense-in-depth; prevents the empty `update({ currencyCode: undefined })`):
```diff
-    if (organizationDTO.baseCurrency !== tenant.metadata?.baseCurrency) {
+    if (
+      organizationDTO.baseCurrency &&
+      organizationDTO.baseCurrency !== tenant.metadata?.baseCurrency
+    ) {
```

### Validation Steps
- `/preferences/general` → change base currency → `PUT /api/organization` returns 200; the value persists and accounts' `currencyCode` is updated to the new currency.
- Saving the form **without** changing the currency no longer fires the account-currency mutation and no longer 500s.
- `displayCurrencies` now arrives as `displayCurrencies` (camelCase) and is JSON-stringified by `normalizeOrganizationMetadataForSave` before persisting.

### Regression Checks
- `base-currency-mutate` validation (`commandOrganizationValidators.validateMutateBaseCurrency`) still runs when a real new currency is provided.
- Initial form hydration still uses `transfromToSnakeCase(organization?.metadata)` → snake_case form fields, so display values are unchanged.
- The same camelCase fix was applied to the Branding form (Issue 5) so `logoKey`/`primaryColor` persist.

### Status: Fixed

---

## Summary

| # | Issue | Status | Primary fix location |
|---|-------|--------|----------------------|
| 1 | Trial Balance crash | Fixed | `TrialBalanceSheet/components.tsx`, `TrialBalanceSheetTable.tsx` |
| 2 | Preferences redirect | Fixed | `Preferences/PreferencesContentRoute.tsx`, `routes/preferences.tsx` |
| 3 | Invisible Edit Profile label | Fixed | `lang/en/index.json` |
| 4 | Invisible Banking sidebar label | Fixed | `lang/en/index.json` |
| 5 | Branding logo upload | Fixed | `CompanyLogoUpload.tsx`, `PreferencesBrandingForm.tsx` |
| 6 | Timezone value invisible | Fixed | `style/pages/Preferences/GeneralForm.scss` |
| 7 | Currency update 500 | Fixed | `GeneralFormPage.tsx`, `UpdateOrganization.service.ts` |

Cross-cutting theme: Issues 5 and 7 share the same root cause — the webapp sends snake_case to camelCase NestJS DTOs, and the global validation pipe (`whitelist: true`) silently strips the mismatched keys.
