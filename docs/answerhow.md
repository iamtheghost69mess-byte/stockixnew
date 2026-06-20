# Audit Findings: Tenant Detail Page

## Phase 1 — Branding section: necessity and functionality

**Current Behavior:**
- **Dashboard Form:** `tenant-branding-panel.tsx` provides a form for `appName`, `logoUrl`, and `primaryColor`.
- **API Route & DB Write:** Submitting the form calls `PUT /api/tenants/:tenantId/config` (in `apps/api/src/routes/tenant-config.ts`), which writes these values to the `tenantConfig` database table.
- **Sync to Finance:** The API then calls `syncTenantBrandingToFinance()` (in `finance-branding-sync.ts`), which attempts to send a `POST` to the internal Finance API (`/api/internal/organization/branding/sync`).

**Working End-to-End?**
- Yes, but it has a designed fallback: if no Finance deployment exists yet, `syncTenantBrandingToFinance` catches this, skips the sync, and returns a warning (`"Tenant has no Finance deployment — branding saved but not synced."`). The data is successfully saved to the database without silently failing, and the UI displays this warning via a toast.

**Is it required?**
- This is **100% optional cosmetic white-labeling**. No core functionality depends on it. 
- **Recommendation:** Add the following subtitle/tooltip to the card to prevent confusion: 
  *"Optional. These settings customize the visual branding (logo, colors, and app name) of your Finance webapp. They are not required for functionality."*

## Phase 2 — Organization dropdown: "Rename" option

**Current Behavior:**
- **Location & API:** The "Rename" action is located in `apps/dashboard/components/org-switcher.tsx` (lines 112, 428). It opens a dialog that calls `PATCH /api/tenants/:tenantId/organizations/:orgId` with the new `{ name }`.
- **Endpoint Functionality:** The endpoint exists in `apps/api/src/routes/tenants-shared.ts` (line 2039). It successfully updates the `name` field in the `organizations` database table.

**What Gets Updated:**
- It **only** updates the display `name` field. It **does NOT** change the `slug` or `subdomain`.

**Is it safe to use?**
- **Yes**, it is technically safe because existing access URLs, links, and emails rely on the subdomain, which remains unbroken. 
- **Risk/Flag:** There is a discrepancy risk. Users will expect the URL subdomain to update when they rename the organization, but it remains the old name. Additionally, the new name is saved in the Stockix database but is **not** synced down to the Finance stack (there is no call to update the Finance organization name), meaning the old name will still appear inside the actual Finance app.

## Phase 3 — Support Agent Organization Access panel

### 3a. Support agent dropdown shows nothing
- **Root Cause:** In `tenant-org-access-panel.tsx` (line 87), the frontend fetches all owners (`/api/owners`) and explicitly filters the list with `(oData.owners ?? []).filter((o) => o.role === "support_agent" && o.status === "active")`. Since no users currently have the `support_agent` role assigned, the resulting array is empty. The API and query are fully functional; the filter is just strict.

### 3b. Organization dropdown shows name closed, but ID when opened
- **Root Cause:** This is not the same mismatched `value` bug as before. It is a separate rendering issue caused by how the `SelectItem` children are defined. In `tenant-org-access-panel.tsx` (line 198), the list items render as:
  `{o.name} <span className="text-muted-foreground">({o.slug})</span>`
  This causes the dropdown list to visually show the name alongside the slug (which looks like an ID, e.g. "Acme (acme-123)"). To make both states show just the name consistently, the `span` containing the `o.slug` should be removed from the `SelectItem`.

## Phase 4 — Invite Finance User form

**Current Behavior:**
- **Field Order & Layout:** In `tenant-users-panel.tsx` (line 593+), the "Email" field is the first visible field (full width). The next row is a grid containing "First Name" and "Last Name" side-by-side. "First Name" is **not** missing; it is correctly labeled and positioned immediately after Email.
- **Form Schema:** All expected fields (`email`, `firstName`, `lastName`, `roleId`) exist in both the frontend Zod schema (`inviteUserSchema`) and the rendered UI.
- **Role Dropdown:** The Role dropdown correctly shows labels ("Admin" / "Staff"). It uses `{FINANCE_ROLES.map(r => ... {r.label})}` to properly display human-readable names. The earlier fix has **not** regressed.
- **Submit Action:** On submit, `onInvite()` calls the API with `{ email, roleId, firstName, lastName }` mapped directly from the form values. There are no field-mapping bugs (e.g., email going to last name). The payload fires exactly as expected.

## Phase 5 — Summary table

| Phase | Component | Status | Root Cause (1 line) | Fix Required? |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Branding Panel | Working | Works as intended; gracefully handles missing Finance deployments. | No (Add UI copy for clarity) |
| 2 | Org Rename | Needs Decision | Updates DB name only; doesn't update subdomain or sync to Finance. | Yes (Needs Finance sync & UX decision on subdomain) |
| 3a | Support Agent List | Working | Explicitly filters by `support_agent` role; empty if no such users exist. | No |
| 3b | Org Dropdown List | Needs Decision | `SelectItem` explicitly renders `{o.name} ({o.slug})`, making it look like an ID. | Yes (Remove slug span from SelectItem) |
| 4 | Invite User Form | Working | Fields exist in correct order, Role labels show correctly, mapping is accurate. | No |
