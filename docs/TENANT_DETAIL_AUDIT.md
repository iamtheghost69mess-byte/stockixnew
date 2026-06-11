# TENANT_DETAIL_AUDIT.md

**Page:** `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx`  
**Reference URL:** `http://localhost:3000/tenants/4f754320-9a3b-49b9-b184-73401adb46d4`  
**Audit date:** 2026-06-08  
**Method:** Source-code trace only (no runtime assumptions)

---

## Executive Summary

| # | Section | Verdict | Primary risk |
|---|---------|---------|--------------|
| 1 | Branding | **Partial** — DB + runtime Finance metadata sync; webapp logo/title needs rebuild | Stale UI after save without reprovision |
| 2 | Sub-Org Rename | **Functional (display name only)** — slug/infra untouched | UX confusion (name ≠ subdomain); not infra-breaking |
| 3 | Add Organization | **Functional** — creates row, enqueues provisioning, dropdown refreshes | None critical |
| 4 | Support Agent Access | **Partial enforcement** — org routes scoped; legacy full access; gaps on finance/config routes | **P0** cross-tenant / bypass |
| 5 | Invite Finance User | **Functional** — end-to-end when stack + mail configured | Depends on running Finance + tenant mail env |
| 6 | License | **Functional** — real DB model, assign/revoke UI, backend enforcement on mutations | Fingerprint not on tenant panel (activation APIs only) |

---

## Page Layout (verified)

Tenant detail mounts these sections in order (`page.tsx:117-210`):

| Section | Component | Visibility |
|---------|-----------|------------|
| Tenant profile (rename tenant) | `TenantProfileForm` | All with `tenants.read` |
| Infrastructure / credentials / integration | Various cards | Role-gated per card |
| Branding | `TenantBrandingPanel` | All with access to page |
| Sub-organizations | `OrgSwitcher` | All with access to page |
| Support agent org access | `TenantOrgAccessPanel` | `isSuper` only (`page.tsx:179-183`) |
| Finance users (invite) | `TenantUsersPanel` | All with access to page |
| License | `TenantLicensePanel` | All with access to page |

**Inaccurate copy on page:** `page.tsx:172-175` states *"Child organizations each run their own Bigcapital stack"*. Provisioning enqueues per-org jobs (`org-provision.ts:12+`) but the **primary org shares the parent tenant Finance stack**; non-primary orgs may get separate compose projects (`tenants.ts:207-209`). The statement is misleading, not a functional bug.

---

## 1. Branding

### Verdict: **Partial**

### UI

| Item | Location |
|------|----------|
| Component | `apps/dashboard/app/(dashboard)/tenants/[id]/_components/tenant-branding-panel.tsx` |
| GET on load | `tenant-branding-panel.tsx:27` → `/api/tenants/:tenantId/config` |
| PUT on save | `tenant-branding-panel.tsx:48-55` → same endpoint |
| Default color in UI state | `#ca8a04` (amber), **not black** (`tenant-branding-panel.tsx:22,35`) |
| Color picker | Text input + live swatch preview (`tenant-branding-panel.tsx:100-114`) — wired, not disabled |
| Post-save message | Toast says rebuild Finance webapp for logo/title (`tenant-branding-panel.tsx:62`) |

### API (control plane)

| Item | Location |
|------|----------|
| Route registrar | `apps/api/src/routes/tenant-config.ts:60-196` |
| GET handler | `tenant-config.ts:64-101` |
| PUT handler | `tenant-config.ts:103-195` |
| Validation | `logoUrl` URL, `primaryColor` `#RRGGBB` regex (`tenant-config.ts:20-28`) |

### Storage — logo

| Layer | Field | File:Line |
|-------|-------|-----------|
| Postgres (canonical) | `tenant_config.logo_url` | `packages/db/src/schema.ts:169` |
| PUT persists | `tenantConfig.logoUrl` | `tenant-config.ts:138` |
| Provision → tenant `.env` | `REACT_APP_STOCKIX_LOGO_URL` | `infra/worker-service/domain/provisioning/tenant-env.ts:258` |
| Provision reads config | `cfg.logoUrl` | `infra/worker-service/src/provision-runtime.ts:1529,1538` |
| Runtime Finance sync | `metadata.logoUri` | `InternalSyncOrganizationBranding.service.ts:39-40` |

**Logo owner:** Control-plane Postgres `tenant_config` is source of truth. Finance receives copies via (a) provision-time `.env` bake-in and (b) best-effort async sync.

### Storage — color

| Layer | Field | File:Line |
|-------|-------|-----------|
| Postgres (canonical) | `tenant_config.primary_color` | `packages/db/src/schema.ts:170` |
| Default on insert | `#ca8a04` | `tenant-config.ts:54,172` |
| GET fallback when no row | `#ca8a04` | `tenant-config.ts:89` |
| Provision → tenant `.env` | `REACT_APP_STOCKIX_PRIMARY_COLOR` | `tenant-env.ts:259` |
| Runtime Finance sync | `metadata.primaryColor` | `InternalSyncOrganizationBranding.service.ts:36-37` |

Color is fully implemented in DB and API. A reported "black" default is **not** what the code sets; empty/null falls back to `#ca8a04`.

### Finance reads branding how?

1. **Webapp (React):** Build-time `REACT_APP_STOCKIX_*` from tenant `.env` (`tenant-env.ts:253-259`). Requires webapp rebuild/reprovision to change compiled assets.
2. **Finance server (runtime):** `PUT /tenants/:id/config` triggers `syncTenantBrandingToFinance` (`tenant-config.ts:157-162`) → `finance-branding-sync.ts:42-54` → Finance `POST /api/internal/organization/branding/sync` (`InternalOrganization.controller.ts:25-48`) → `TenantRepository.saveMetadata` (`InternalSyncOrganizationBranding.service.ts:43`).

Sync is skipped when:
- `INTERNAL_API_SECRET` unset (`finance-branding-sync.ts:18-21`)
- No `financeTenantId` on deployment (`finance-branding-sync.ts:30-33`)
- No internal base URL (`finance-branding-sync.ts:36-39`)
- HTTP failure (logged, non-blocking) (`finance-branding-sync.ts:58-61`)

### Scope gap

`tenant-config.ts` routes do **not** call `tenantWithinOwnerScope` (unlike most routes in `tenants.ts:687-689`). RBAC requires `tenants.write` for PUT (`route-permissions.ts:61-79`) but scoped support agents are not tenant-filtered on this path.

---

## 2. Sub-Organization Rename

### Verdict: **Functional — display name only; infra-safe**

### UI

| Item | Location |
|------|----------|
| Rename dialog + submit | `apps/dashboard/components/org-switcher.tsx:265-287` |
| Payload | `{ name }` only — **no `slug`** (`org-switcher.tsx:273`) |
| Tenant-level rename (separate) | `TenantProfileForm` → `PATCH /api/tenants/:id` with profile fields (`use-tenant-detail-page.ts:161-168`) |

### API — organization rename

| Item | Location |
|------|----------|
| Endpoint | `PATCH /tenants/:tenantId/organizations/:orgId` |
| Handler | `apps/api/src/routes/tenants.ts:1963-2082` |
| Body schema | `organizationPatchBody` — `name?`, `status?: "suspended"` only (`tenants.ts:130-135`) |
| DB update | `organizations.name` (and optional `status`) (`tenants.ts:2026-2033`) |
| Slug update | **None** — `organizations.slug` not in `setVals` |
| Audit on rename | `org.renamed` with unchanged `slug` in metadata (`tenants.ts:2064-2072`) |

### API — tenant rename

| Item | Location |
|------|----------|
| Endpoint | `PATCH /tenants/:tenantId` (`tenants.ts:2791`) |
| Body schema | `name`, `adminEmail`, `adminFirstName`, `adminLastName` only (`tenants.ts:2782-2788`) |
| Slug update | **None** — `tenants.slug` not in schema |

### Slug assignment (create only)

| Item | Location |
|------|----------|
| Slug derived from name at create | `pickUniqueOrganizationSlug` (`tenants.ts:193-205`) |
| Pattern | `{slugified-name}-{random4}` (`tenants.ts:196`) |
| Uniqueness check | DB lookup on `organizations.slug` (`tenants.ts:197-202`) |
| Subdomain set at create | `{slug}.{rootDomain}` (`tenants.ts:1882-1883`) |

### What rename does **not** touch

| System | Verified |
|--------|----------|
| `organizations.slug` / `subdomain` | Not updated on PATCH |
| `tenants.slug` | Immutable after create |
| Tenant `.env` (`APP_URL`, `REACT_APP_*`, etc.) | No handler writes env on rename |
| Docker compose project name | Derived from slug at provision (`tenants.ts:207-209`); unchanged on rename |
| Traefik labels | Set at provision from slug; no rename hook found |
| Container restart / reprovision | Not triggered by rename handler |
| Status guard | Rename allowed regardless of `active` / `provisioning` — no status check on name PATCH |

### Name collision

- **Slug collision:** Prevented at create via `pickUniqueOrganizationSlug` (`tenants.ts:193-205`). Not re-checked on rename because slug is not changed.
- **Display name collision:** No uniqueness constraint on `organizations.name` or `tenants.name`.

### P0 risk assessment

**Can renaming break a live tenant today?** **No** — for the implemented rename paths, only human-readable `name` columns change. Routing, containers, `.env`, and JWT slugs remain tied to the immutable `slug`.

**Should rename be disabled?** **No** — current behavior is safe for infra. Recommended improvements (not blockers):
- Clarify in UI that rename does not change subdomain/slug
- Optionally sync `tenant_config.appName` when tenant display name changes

---

## 3. Add Organization

### Verdict: **Functional**

### UI

| Item | Location |
|------|----------|
| Form + submit | `org-switcher.tsx:237-263` |
| Payload | `{ name }` (`org-switcher.tsx:244`) |
| Dropdown data source | `useOrganizations(tenantId)` (`org-switcher.tsx:196`) |
| Refetch after create | `refetch(true)` on 201 (`org-switcher.tsx:249`) — no full page reload |
| Provisioning poll | 5s interval while any org `status === "provisioning"` (`org-switcher.tsx:217-225`) |

### Hook / API

| Item | Location |
|------|----------|
| Fetch | `use-organizations.ts:83` → `GET /api/tenants/:tenantId/organizations` |
| List handler | `tenants.ts:1745-1799` |
| Support-agent org filter | `filterOrganizationsForSupportAgent` (`tenants.ts:1778-1784`) |

### Create flow

```
POST /api/tenants/:tenantId/organizations
  → tenantWithinOwnerScope (tenants.ts:1806)
  → support_agent create block if org-scoped (tenants.ts:1819-1830)
  → license eligibility (tenants.ts:1843-1860)
  → plan limit canCreateOrganization (tenants.ts:1863-1871)
  → pickUniqueOrganizationSlug (tenants.ts:1881)
  → INSERT organizations status=provisioning (tenants.ts:1885-1895)
  → enqueueOrgProvisioning (tenants.ts:1901)
  → audit org.created (tenants.ts:1905-1912)
  → 201 + serialized org
```

Provisioning is **not** metadata-only — `enqueueOrgProvisioning` inserts worker jobs (`org-provision.ts:12+`).

### Error handling

| Case | Response |
|------|----------|
| Plan limit | 402 `PLAN_LIMIT_REACHED` (`tenants.ts:1865-1870`) — UI toast (`org-switcher.tsx:253-255`) |
| Expired / missing license | 402 `LICENSE_EXPIRED` / `NO_ACTIVE_LICENSE` (`tenants.ts:1844-1860`) |
| Scoped support agent | 403 `organization_access_create_denied` (`tenants.ts:1822-1828`) |
| Duplicate org **name** | Allowed (no check) |

---

## 4. Support Agent Organization Access

### Verdict: **Partial enforcement — P0 gaps**

### Role definition

| Item | Location |
|------|----------|
| Role slug enum | `packages/shared/src/roles.ts:3` |
| Permissions | `tenants.read`, `tenants.write`, `tenants.provision`, `tenants.org_scope`, `licenses.*` (`packages/shared/src/permissions.ts:59-68`) |

### UI (assign support agent)

| Item | Location |
|------|----------|
| Panel | `apps/dashboard/components/tenant-org-access-panel.tsx` |
| Shown when | `isSuper` on tenant detail (`page.tsx:179-183`) |
| List grants | `GET /api/tenants/:tenantId/organization-access` (`tenant-org-access-panel.tsx:78`) |
| Add grant | `POST` with `ownerId` + `organizationId` (`tenants.ts:2245-2343`) |
| Constraint | Target owner must have `role === "support_agent"` (`tenants.ts:2276-2283`) |

### Grant management RBAC

Organization-access routes require `["*"]` → **super_admin only** (`route-permissions.ts:72`).

### Enforcement mechanism

**Tenant-level scope** (`org-access-scope.ts`):

```text
getScopedTenantIdsForOwner:
  - support_agent (or tenants.org_scope) with ZERO rows in owner_organization_access
    → returns null → FULL access to ALL tenants (legacy)
  - with rows → tenant IDs limited to distinct tenantId in grants (org-access-scope.ts:27-42)

assertTenantInOwnerScope:
  - scopedTenantIds === null → true (org-access-scope.ts:52-54)
```

**Org-level scope** (within a tenant):

```text
getSupportScopedOrgIdsForTenant:
  - ZERO grants for (owner, tenant) → null → ALL orgs in tenant (org-access-scope.ts:62-74)
  - with grants → only listed organizationIds

filterOrganizationsForSupportAgent / assertOrgInSupportScope:
  - applied on org list, GET/PATCH/DELETE org (tenants.ts:1778-1784, 1943-1951, 2005-2013)
  - blocks org create when scoped (tenants.ts:1819-1830)
```

**Schema:** `owner_organization_access` (`packages/db/src/schema.ts:139-158`) — `(ownerId, organizationId)` unique.

### Tenant detail route guard

`GET /tenants/:tenantId` calls `tenantWithinOwnerScope` before returning data (`tenants.ts:2422-2424`). Returns 404 `tenant_not_found` when out of scope (intentional anti-enumeration).

### JWT / session scope

Owner session uses role + permissions from DB at request time (`middleware/rbac.ts:88-92`). **No tenant scope embedded in JWT** — scope is computed per request from `owner_organization_access` rows.

### Cross-tenant access gaps (P0)

| Gap | Severity | File:Line | Description |
|-----|----------|-----------|-------------|
| Legacy full access | **P0** | `org-access-scope.ts:13-14,40,57-60` | Support agent with **no** `owner_organization_access` rows can list and mutate **all tenants** |
| Finance users routes unscoped | **P0** | `finance-users.ts:205-241` | `POST/GET /tenants/:id/users*` does not call `tenantWithinOwnerScope` — scoped agent can hit any tenant UUID |
| Tenant config unscoped | **P1** | `tenant-config.ts:64-195` | `GET/PUT /tenants/:id/config` lacks tenant scope check |
| Org scope ≠ tenant scope | **P1** | — | Agent with grants on tenant A only is blocked on `tenants.ts` org routes for tenant B, but could still call finance-users for tenant B |

**What works:** Org list/detail/mutate within a tenant respects org grants when grants exist. Tenant list filters by scoped tenant IDs when grants exist (`tenants.ts:352-377`). Organization-access management is super_admin-only.

---

## 5. Invite Finance User

### Verdict: **Functional** (conditional on stack + mail)

### UI

| Item | Location |
|------|----------|
| Panel | `apps/dashboard/components/tenant-users-panel.tsx` |
| Invite submit | `tenant-users-panel.tsx:266-290` |
| Endpoint | `POST /api/tenants/:tenantId/users/invite` |
| Gating in UI | `deploymentReady` + `hasAccountingModule` (`page.tsx:186-196`) |

### Control plane API

| Item | Location |
|------|----------|
| Registrar | `apps/api/src/routes/finance-users.ts:164-241` |
| Module gate | `assertTenantModuleLicensed(..., "accounting")` (`finance-users.ts:141-144`) |
| Proxy client | `finance-users.client.ts:42-49` → Finance internal API |
| Scope check | **Missing** — no `tenantWithinOwnerScope` |

### Finance internal handler

| Step | File:Line |
|------|-----------|
| Controller | `InternalUsers.controller.ts` (invite route) |
| Service | `InternalUsers.service.ts:270-352` |
| Tenant MySQL `users` insert | `InternalUsers.service.ts:286-293` |
| System `users` + `user_tenants` | `InternalUsers.service.ts:300-325` |
| Invite token record | `InternalUsers.service.ts:331-337` |
| Email event | `events.inviteUser.sendInviteTenantSynced` (`InternalUsers.service.ts:339-346`) |

### Email delivery

| Item | Location |
|------|----------|
| Subscriber | `InviteSendMailNotification.subscriber.ts:29-50` |
| Transport | BullMQ queue `SendInviteUserMailQueue` (`InviteSendMailNotification.subscriber.ts:41-49`) |
| Control-plane mail | Resend via `@repo/config` mail settings (startup warns if unset — `create-control-plane-app.ts:81-88`) |
| Tenant mail env | Provision warns if `MAIL_PASSWORD` / `MAIL_FROM_ADDRESS` missing (`provision-runtime.ts:1570-1573`) |

Invite email is sent from **Finance stack mail config** (tenant `.env`), not control-plane Resend.

### Control plane invite storage

No invite row in Stockix Postgres — invite lives in Finance MySQL (`invites` table via `inviteModel` at `InternalUsers.service.ts:332-337`).

### Unreachable Finance service

`withFinanceUsersContext` resolves internal URL + secret; failures map to 404/503/502 (`finance-users.ts:146-161`). UI shows toast on error (`tenant-users-panel.tsx:280-282`).

### Accept flow

Invite token created with `uniqid()` (`InternalUsers.service.ts:331`). Accept-link resolution was not traced end-to-end in this audit; mail job payload includes `invite` + `organizationId` (`InviteSendMailNotification.subscriber.ts:43-48`). **Assumption not made** on accept URL shape — verify in Finance mail template if needed.

---

## 6. License

### Verdict: **Functional** (not a placeholder)

### UI

| Item | Location |
|------|----------|
| Component | `tenant-license-panel.tsx` |
| Primary license fetch | `GET /api/licenses?tenantId=…&pageSize=1&primary=1` (`tenant-license-panel.tsx:74-76`) |
| History | `GET /api/licenses?tenantId=…&pageSize=50` (`tenant-license-panel.tsx:88`) |
| Actions (super_admin) | Generate, assign, extend, revoke, suspend, reactivate (`tenant-license-panel.tsx:233-318`) |

### Fields rendered on tenant panel

| Field | Shown |
|-------|-------|
| Plan / status / key suffix | Yes |
| Expiry / perpetual | Yes |
| Modules | Yes (`tenant-license-panel.tsx:204-212`) |
| Activation count | Yes for non-platform products (`tenant-license-panel.tsx:215-218`) |
| Grace period | Yes (`tenant-license-panel.tsx:220`) |
| Hardware fingerprint | **No** on tenant panel (checked at activation API — `licenses.ts:891-895`, `1136-1143`) |

### DB model

`licenses` table (`packages/db/src/schema.ts:392-443`):
- `tenant_id` FK links license to tenant
- `status`, `expires_at`, `is_perpetual`, `max_organizations`, `max_users`, `activation_count`, etc.

Assignment: `POST /licenses/:licenseId/assign` (`licenses.ts:1491-1559`) sets `tenantId`, `status: active`, copies plan limits.

### Enforcement (backend, not cosmetic)

| Operation | Check | File:Line |
|-----------|-------|-----------|
| Add organization | `getTenantLicenseEligibility` | `tenants.ts:1843-1860` |
| Eligibility logic | Active license + date validity + grace | `plan-limits.ts:34-44`, `9-30` |
| Module proxy routes | `assertTenantModuleLicensed` | `tenant-module-access.ts:41-72` |
| POS/finance proxies | Same module license gate | `finance-users.ts:141`, `pos-proxy-http.ts:61` |
| Device blacklist | Activation / verify-offline only | `licenses.ts:891-895` |

Expired license blocks org creation (402). Grace period allows limited continued use per `isLicenseDateValid` (`plan-limits.ts:25-28`).

### Reassignment

Assign only when `status === "unassigned"` (`licenses.ts:1503-1505`). Active tenant license must be revoked/expired before another assign (`licenses.ts:1517-1524`).

---

## Priority Fix Table

| # | Section | Issue | Severity | File:Line |
|---|---------|-------|----------|-----------|
| 1 | Support Agent | Legacy behavior: support_agent with **no** `owner_organization_access` rows has **full tenant + org access** | **P0** | `org-access-scope.ts:13-14,40,57-60` |
| 2 | Support Agent | Finance user routes skip `tenantWithinOwnerScope` — scoped agent can invite/list users on unassigned tenants | **P0** | `finance-users.ts:205-241` |
| 3 | Support Agent | Tenant branding config routes skip `tenantWithinOwnerScope` | **P1** | `tenant-config.ts:64-195` |
| 4 | Rename | UI label "Rename" does not change slug/subdomain — operator confusion | **P2** | `org-switcher.tsx:265-287`, `tenants.ts:2026-2033` |
| 5 | Branding | Logo/title in Finance **webapp** require rebuild; runtime sync only updates Finance metadata | **P2** | `tenant-branding-panel.tsx:62`, `tenant-env.ts:257-259` |
| 6 | Branding | `syncTenantBrandingToFinance` silently no-ops without secret/financeTenantId | **P3** | `finance-branding-sync.ts:18-33` |
| 7 | Page copy | "Each child org runs its own Bigcapital stack" is inaccurate for primary org | **P3** | `page.tsx:172-175` |
| 8 | License | Hardware fingerprint not surfaced on tenant detail (only on activation flows) | **P3** | `tenant-license-panel.tsx` (no fingerprint field) |

**Rename (original P0 suspect):** Downgraded to **P2 UX only** — verified safe for slug/infra; no disable recommended.

---

## Recommended Fix Order (post-audit)

1. Add `tenantWithinOwnerScope` to `finance-users.ts` and `tenant-config.ts` (match `tenants.ts:687-689` convention).
2. Decide product policy on legacy full access: require at least one grant row for `support_agent`, or default-deny until super_admin assigns tenants.
3. Branding: either auto-trigger webapp rebuild job on save, or update UI copy to distinguish metadata sync vs compiled webapp assets.
4. Clarify rename UX (show immutable slug next to editable name).

---

## Files Index

| Purpose | Path |
|---------|------|
| Tenant detail page | `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` |
| Branding UI | `apps/dashboard/app/(dashboard)/tenants/[id]/_components/tenant-branding-panel.tsx` |
| Branding API | `apps/api/src/routes/tenant-config.ts` |
| Branding sync | `apps/api/src/finance-branding-sync.ts` |
| Org switcher | `apps/dashboard/components/org-switcher.tsx` |
| Org hook | `apps/dashboard/hooks/use-organizations.ts` |
| Tenant/org routes | `apps/api/src/routes/tenants.ts` |
| Scope logic | `apps/api/src/org-access-scope.ts` |
| Route permissions | `apps/api/src/permissions/route-permissions.ts` |
| Support access UI | `apps/dashboard/components/tenant-org-access-panel.tsx` |
| Finance users UI | `apps/dashboard/components/tenant-users-panel.tsx` |
| Finance users API | `apps/api/src/routes/finance-users.ts` |
| Finance invite service | `services/stockix-finance/.../InternalUsers.service.ts` |
| License UI | `apps/dashboard/app/(dashboard)/tenants/[id]/_components/tenant-license-panel.tsx` |
| License API | `apps/api/src/routes/licenses.ts` |
| License enforcement | `apps/api/src/plan-limits.ts`, `apps/api/src/lib/tenant-module-access.ts` |
| Provision branding → env | `infra/worker-service/src/provision-runtime.ts:1521-1568` |
