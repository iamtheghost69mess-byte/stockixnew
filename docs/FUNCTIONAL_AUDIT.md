# Stockix Platform — Complete Functional Audit

**Date:** 2026-05-24  
**Mode:** Read-only — no files modified  
**Scope:** Plans, licenses, provisioning, POS, accounting, combined mode, multi-org, warehouses, users, PIN codes, emails, owner dashboard  
**References:** [SAAS_AUDIT_EMAIL.md](./SAAS_AUDIT_EMAIL.md), [PROVISIONING_REFERENCE.md](./PROVISIONING_REFERENCE.md), [PLATFORM_REFERENCE.md](./PLATFORM_REFERENCE.md)

---

## 1. Plans & License

### 1.1 Plans Schema

**Source:** `packages/db/src/schema.ts:317-344`

| Field | DB column | Stored in DB | Shown in dashboard | Enforced at provision | Enforced in Finance | Enforced in POS |
|-------|-----------|:--------------:|:------------------:|:---------------------:|:-------------------:|:---------------:|
| `id` | `id` | ✅ | — | — | — | — |
| `name` | `name` | ✅ | ✅ `apps/dashboard/app/(dashboard)/plans/page.tsx` | — | — | — |
| `slug` | `slug` | ✅ | ✅ (create only) | ✅ plan must exist to generate license | — | — |
| `description` | `description` | ✅ | ✅ | — | — | — |
| `maxOrganizations` | `max_organizations` | ✅ default `1` | ✅ | ✅ copied to license on generate/assign | ✅ via sync + `assertCanCreateOrganization` | N/A |
| `maxActivations` | `max_activations` | ✅ default `1` | ✅ | ✅ copied to license | Reference only in Finance | N/A |
| `isActive` | `is_active` | ✅ | ✅ | ✅ blocks generate if inactive | — | — |
| `sortOrder` | `sort_order` | ✅ | ✅ | — | — | — |
| `priceMonthly` | `price_monthly` | ✅ (cents) | ✅ | — | — | — |
| `priceAnnually` | `price_annually` | ✅ (cents) | ✅ | — | — | — |
| `currency` | `currency` | ✅ default `USD` | ✅ | — | — | — |
| `billingInterval` | `billing_interval` | ✅ | ✅ | — | — | — |
| `isPublic` | `is_public` | ✅ | ✅ | — | — | — |
| `features` | `features` | ✅ JSON array | ✅ | Display only | — | — |
| `createdAt` / `updatedAt` | timestamps | ✅ | — | — | — | — |

**Not on `plans` table:** `maxUsers` — staff caps exist only on Finance `tenant_licenses.max_users` (synced separately; see §1.4).

**Plans API** (`apps/api/src/license-http.ts` via `registerLicenseApi` at `apps/api/src/index.ts:5066`):

| Method | Path | RBAC |
|--------|------|------|
| `GET /plans` | List | `read_only` |
| `POST /plans` | Create | `super_admin` |
| `PATCH /plans/:planId` | Update | `super_admin` |
| `DELETE /plans/:planId` | Soft-deactivate | `super_admin` |

**Dashboard plans UI:** `apps/dashboard/app/(dashboard)/plans/page.tsx` — full CRUD; BFF at `apps/dashboard/app/api/plans/route.ts` and `[planId]/route.ts`. Consumed by tenant wizard and license dialogs.

---

### 1.2 License Assignment

**License schema** (`packages/db/src/schema.ts:346-417`):

| Field | Purpose |
|-------|---------|
| `licenseKey` | Format `STKX-XXXX-XXXX-XXXX` (`apps/api/src/license-utils.ts:223-229`) |
| `product` | Default `"platform"` |
| `modules` | JSON array: `accounting`, `pos`, `pms`, `chat` (`license-utils.ts:13-29`) |
| `planSlug` | Copied from plan at generate/assign |
| `tenantId` | Nullable until assigned |
| `status` | `unassigned` \| `active` \| `expired` \| `revoked` \| `suspended` |
| `expiresAt` / `isPerpetual` | Expiry control |
| `maxActivations` / `maxOrganizations` | Copied from plan; `-1` = unlimited orgs (`schema.ts:365`) |
| `activationCount` | Desktop/POS activation tracking |
| `gracePeriodDays` | Default `7` |
| Revoke fields | `revokedAt`, `revokedById`, `revokeReason` |

**License history:** Table `license_history` (`schema.ts:394-417`); inserted on generate, assign, revoke, extend, activate/deactivate, notes, sync, worker expiry (`license-utils.ts:131-142`, `198-218`).

| Question | Answer | Evidence |
|----------|--------|----------|
| **Auto-created on provision?** | **YES** — when no active license and no `assignExistingLicenseId` | `apps/api/src/index.ts:1432-1459` |
| **Modules on license?** | **YES** — JSON array; provision copies tenant modules | `index.ts:1417-1418`, `1447` |
| **Plan enforces maxOrganizations in Finance?** | **YES** — via sync to `tenant_licenses` + `License.service.ts:58-79` | `finance-license.client.ts:46-54` |
| **Plan enforces maxUsers in Finance?** | **Partial** — `maxUsers` not on Stockix plan; sync defaults to **999** | `finance-license.client.ts:29`, `48-50` |
| **License expires?** | Worker marks `expired` every 5 min; email + Finance sync | `infra/worker-service/src/worker.ts:34-58`, `license-expire-followup.ts` |
| **License revoked?** | Status `revoked`; activations deactivated; Finance sync | `license-http.ts:1471-1547` |
| **History tracked?** | **YES** | `license_history` table + `GET /licenses/:id/history` |

**Generate / assign API** (`apps/api/src/license-http.ts`):

- `POST /licenses/generate` — `363-469`
- `POST /licenses/:licenseId/assign` — `1368-1467`
- `POST /licenses/:licenseId/extend` — `1279-1361`
- `POST /licenses/:licenseId/revoke` — `1471-1547`
- `POST /licenses/activate` — `777-1011` (desktop/POS activation)

**Gap:** Dashboard generate dialog does not send `modules` → defaults to `["accounting"]` only (`apps/dashboard/components/license-generate-dialog.tsx:155-167`).

---

### 1.3 License Dashboard Functionality

| Capability | Owner | Super admin | Evidence |
|------------|:-----:|:-----------:|----------|
| Generate license | ❌ | ✅ | `licenses/page.tsx`, RBAC `license-http.ts` |
| Assign to tenant | ❌ | ✅ | `POST .../assign` |
| Extend expiry | Billing manager+ | ✅ | `POST .../extend` |
| Revoke | ❌ | ✅ | Tenant detail `page.tsx:1107-1178` |
| View license modules | ✅ | ✅ | License detail API |
| View plan limits | ✅ | ✅ | Plans page + license row fields |

**Pages:** `apps/dashboard/app/(dashboard)/licenses/page.tsx`, `licenses/[id]/page.tsx`, tenant detail license section (`tenants/[id]/page.tsx:1028-1184`).

**BFF routes:** `apps/dashboard/app/api/licenses/**` — proxy to control-plane API.

---

### 1.4 Plan Limits Enforcement

| Limit | Stored (control plane) | Stored (Finance) | Finance enforces | POS enforces |
|-------|------------------------|------------------|:----------------:|:------------:|
| `maxOrganizations` | `plans` → `licenses` | `tenant_licenses.max_organizations` | ✅ `License.service.ts:58-79`; org create blocked at API `index.ts:3639-3652` | N/A |
| `maxActivations` | `plans` → `licenses` | Synced (reference) | Control plane only at `/licenses/activate` | N/A |
| `maxUsers` | ❌ not on plans/licenses | `tenant_licenses.max_users` default 999 on sync | ✅ `InternalUsers.service.ts:363-382`, `InviteUser.service.ts:177-184` | Org entitlements `maxUsers: 25` default (`organizationModel.js:71-81`) — separate from Stockix license |

**Finance license guard:**

- `LicenseGuardMiddleware` — `services/stockix-finance/packages/server/src/modules/License/LicenseGuard.middleware.ts:25-114`
- Revoked/suspended/expired → HTTP 402-style JSON (`77-101`)
- Grace period → write-only block (`104-114`)
- `LicenseBanner` — webapp shows grace warning (`packages/webapp/src/components/License/LicenseBanner.tsx:9-11`)

**POS license enforcement (separate model):**

- Org-level `licenseStartsAt` / `licenseEndsAt` on Mongo `Organization` (`organizationModel.js:89-91`)
- `requireActiveOrganization` middleware (`middlewares/requireActiveOrganization.js:9-25`)
- `LICENSE_ENFORCEMENT_MODE`: `enforce` vs `shadow` (`config/config.js:132-138`)
- **Not wired** to Stockix `STKX-*` license keys in POS backend grep results

---

## 2. Accounting Provision

### 2.1 Auto-created on Provision

**Orchestrator:** `infra/worker-service/src/provision-runtime.ts` (`executeProvisionRuntime`)

| Step | Operation key | What is created | File:line |
|------|---------------|-----------------|-----------|
| Health check | `tenant.health_check` | Ping Finance stack | `774-792` |
| Bootstrap admin | `tenant.bootstrap_admin` | Finance user + tenant row | `794-844` → `fetch-stockix-finance-bootstrap.ts:55-152` |
| Fetch org settings | `tenant.fetch_org_settings` | Inherit from parent (sub-stack only) | `852-906` |
| Build organization | `tenant.build_organization` | COA seed, org metadata | `909-1028` → `fetch-stockix-finance-build-org.ts:144-250` |
| Activate warehouses | `tenant.activate_warehouses` | Primary warehouse code **10001** | `1031-1086` — **combined only** |
| Seed POS defaults | `tenant.seed_pos_defaults` | Walk-in customer, cash/card accounts | `1089-1159` — **combined only** |
| Edge publish | `edge.publish` | Traefik route `{slug}.{ROOT_DOMAIN}` | `1161+` |
| License sync | (non-journaled) | Finance `tenant_licenses` row | `1187-1193` → `sync-finance-license.ts:16-64` |

| Item | Created | Value / details |
|------|:-------:|-----------------|
| **Admin user** | ✅ | Email from job `adminEmail`; HMAC one-time password (`provision-runtime.ts:418-422`, `crypto-tenant-secret-generator.ts:22-29`); role `admin` → Finance **`owner`** (`ProvisionUser.service.ts:147-157`); `mustChangePassword: true` (`68-71`) |
| **Admin notification** | ❌ email | Password returned to worker job completion; dashboard shows ~15 min cache (`tenants/[id]/page.tsx:775-825`) |
| **Organization** | ✅ | Name from job; settings: USD, Asia/Beirut, LB, en, MM/DD/yyyy defaults (`fetch-stockix-finance-org-settings.ts:15-23`) or inherited from parent |
| **COA** | ✅ | Seeded via `BuildOrganization.service.ts:41-72` → `SeedMigration` |
| **Primary warehouse** | ✅ combined | Code `10001` via `InternalActivateWarehouses.service.ts:75-109` |
| **Walk-in customer** | ✅ combined | `InternalSeedPosDefaults.service.ts:65-83` |
| **Cash/card deposit accounts** | ✅ combined | From seeded COA (`InternalSeedPosDefaults.service.ts:85-119`) |
| **Default items/customers/tax** | Partial | Walk-in + tax via COA seed; no product catalog |

---

### 2.2 Multi-organization

| Question | Answer | Evidence |
|----------|--------|----------|
| Owner create sub-orgs from dashboard? | **YES** — `OrgSwitcher` on tenant detail (`page.tsx:999-1006`); triggers `organization.provision` job | `org-provision-runtime.ts:219-367` |
| Sub-org inherits COA? | **YES** (parent-stack path) | `POST .../copy-from/:parentTenantId` (`org-provision-runtime.ts:335-347`, `CopyParentTenantSettings.service.ts:18-47`) |
| Sub-org inherits tax rates? | Via COA copy | Same copy-from flow |
| Sub-org has own warehouse? | **YES** — activate-warehouses on new tenant | `org-provision-runtime.ts:315-322` |
| User switches orgs? | Sidebar → `GET organization/all` + `POST auth/switch-tenant` + full reload | `SidebarHead.tsx:39-51`, `SwitchTenant.service.ts:21-48` |
| Limit per plan? | `maxOrganizations` on license | `License.service.ts:58-79` counts all Finance tenant rows |
| Tracked against maxOrganizations? | **YES** in Finance; **YES** at control-plane org create | `TenantsManager.ts:37-39`, `plan-limits.ts:65-86` |

**Two provisioning models:**

1. **Separate Docker stack** per slug — `provision-runtime.ts` with optional settings inherit from parent URL
2. **Same Finance stack** — `organization.provision` job on parent instance (`worker.ts:568`, `org-provision-runtime.ts`)

**Gap:** Separate-stack path does not run COA copy-from; only parent-stack `organization.provision` does.

**Gap:** Provision license sync sends only `{ status: "active", isPerpetual: true }` — `maxOrganizations` defaults to **1** unless control plane later syncs plan limits (`provision-runtime.ts:1188-1191`, `sync-finance-license.ts:35-37`).

---

### 2.3 User Management

**Finance roles** (provision DTO): `admin`, `accountant`, `viewer` (`ProvisionUser.dto.ts:13-17`). Internal user CRUD uses tenant `roles.id` table.

**Internal Users API** (`InternalUsers.controller.ts`, guard `InternalSecretGuard`):

| Operation | Route | Service |
|-----------|-------|---------|
| Invite by email | `POST :tenantId/users/invite` | `InternalUsers.service.ts:266-353` |
| Create with password | `POST :tenantId/users` | `InternalUsers.service.ts:60-121` |
| List / update / delete | GET/PATCH/DELETE | `123-236` |
| Reset password | `POST .../reset-password` | `238-253` |
| Suspend / activate | POST suspend/activate | `255-261` |

| Question | Answer |
|----------|--------|
| Roles exist? | Tenant-defined roles + provision mapping to `owner` |
| Owner invite by email from dashboard? | **YES** — `tenant-users-panel.tsx:443-446` → BFF → internal API |
| Create with direct password? | **YES** — break-glass path in same panel |
| Delete users? | **YES** |
| Change roles? | **YES** — PATCH |
| Dashboard shows users? | **YES** when accounting + deployment active (`page.tsx:1014-1026`) |

**User limit:** `validateUserLimit` vs `tenant_licenses.maxUsers` (`InternalUsers.service.ts:363-382`).

---

### 2.4 Finance Emails

| Email | Implemented | Uses Resend/SMTP | Trigger | File:line |
|-------|:-----------:|:----------------:|---------|-----------|
| Welcome / onboarding | ❌ | — | No bootstrap mail in Finance | — |
| User invitation | ✅ | Tenant SMTP (Nodemailer) | `sendInvite` → mail queue | `SendInviteUsersMailMessage.service.ts:26-56` |
| Password reset | ✅ | Tenant SMTP | `POST /auth/send_reset_password` | `Auth.controller.ts:165-170`, `AuthMail.subscriber.ts:78-90` |
| Signup verify | ✅ gated | Tenant SMTP | If `SIGNUP_EMAIL_CONFIRMATION` | `AuthMail.subscriber.ts:34-44` |
| License expiry warning | ❌ | — | Handled by **control plane** | — |
| License expired | ❌ | — | Handled by **control plane** | — |
| Org created | ❌ | — | — | — |

**SMTP config:** `services/stockix-finance/.env.example:16-22` — `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_PORT`, `MAIL_FROM_*`. Wired in `Mail.module.ts:15-20`.

**Not same Resend as control plane** — Finance uses per-tenant SMTP injected at provision; control plane uses Resend via `apps/api/src/mail/mailer.js`.

---

### 2.5 Session & Login

| Topic | Value | Evidence |
|-------|-------|----------|
| JWT expiry | **1 day** | `Auth.module.ts:62-63` — `expiresIn: '1d'` |
| Refresh token | **NO** | No refresh handlers in Auth module |
| Session expires behavior | Axios interceptor → clear cookies + redirect `/auth/login` | `axios.tsx:37-52`; `useRequest.tsx:60-77` sets global error (no redirect) — dual behavior |
| One-time password forces change | **YES** | `mustChangePassword: true` on provision; `EnsurePasswordChanged.tsx:14-18` |
| Infinite redirect bug | **FIXED** | `SAAS_AUDIT_EMAIL.md` §1 — `useRequest` no longer calls `setLogout()` on 401 |

---

## 3. POS Provision

### 3.1 Auto-created on Provision

**Flow:** Worker → `bootstrapPosOrganization` (`bootstrap-pos-org.ts`) → POS platform API → async `orgBootstrapService.js`

| Item | Created | Value |
|------|:-------:|-------|
| **Organization** | ✅ | Name/slug from platform create; 1-year license window; `stockixTenantId`, `ownerEmail` stored |
| **Location (Main)** | ✅ | `name: "Main"`, `code: "MAIN"` (`orgBootstrapService.js:73-76`; also pre-created in `platformOrgController.js:345-356`) |
| **Admin user** | ✅ | Role `admin`, username `admin`, 6-digit PIN |
| **Manager user** | ✅ | Role `manager` |
| **Waiter user** | ✅ | Role `waiter` |
| **Cashier user** | ✅ | Role `cashier` |
| **Kitchen user** | ✅ | Role `kitchen` |
| **Hostess user** | ✅ | Role `hostess` |
| **RbacConfig** | ✅ | Empty overrides (`orgBootstrapService.js:81-85`) |
| **AccountingConfig + COA** | ✅ | 20 GL accounts, USD FIFO (`accountingService.js:406-519`) |
| **Menu categories** | ✅ | "Main Course", "Beverages" (`orgBootstrapService.js:116-124`) |
| **PublicMenuBranding** | ✅ | Accent `#ca8a04` (`129-142`) |
| **Tables / menu items / stock** | ❌ | Not seeded |
| **Owner email user** | ❌ | `ownerEmail` metadata only; no User record |

**Credentials delivery:** Plaintext PINs in `organization.defaultCredentials` (`orgBootstrapService.js:99-101`); returned via worker job → control plane (`worker.ts:272-273`).

---

### 3.2 PIN System

| Topic | Detail | Evidence |
|-------|--------|----------|
| PIN length | **6 digits** at bootstrap (`100000-999999`); model allows **4-6** | `orgBootstrapService.js:30-37`; `userModel.js:216,234-237` |
| Random? | **YES** — globally unique allocation | `allocateUniqueSixDigitPin()` |
| Storage | **bcrypt** hash on user; **HMAC-SHA256** `pinLookup` for lookup | `userModel.js:254-255`; `pinLookup.js:4-14` |
| Plaintext copy | **YES** in `organization.defaultCredentials` | `organizationModel.js:36-47` |
| Owner sees PINs? | **Masked only** on tenant detail (`pinMasked`); full PINs on provision-status endpoint | `page.tsx:878`; `index.ts:3344-3463` |
| PIN emailed? | **NO** | No email on bootstrap |
| PIN changeable? | **YES** — platform `resetCredentialRolePin` | `platformOrgController.js:1035-1124` |
| PIN + password? | User schema: PIN **or** password required | `userModel.js:50-66`; login accepts either (`authController.js:266-276`) |
| Lockout | **3 failures → 5 min lock** | `authController.js:26-27`, `186-220` |
| Global vs per-org PIN | **Global** uniqueness within MongoDB instance | `userModel.js:58-65`, `242-251` |

---

### 3.3 Multi-location

| Question | Answer | Evidence |
|----------|--------|----------|
| Inventory per-location? | **YES** | `ingredientModel.js:19-25`; `stockBalanceModel.js:10-21` unique `{org, location, ingredient, bin}` |
| Staff per-location? | Optional — `location` + `locations[]` on user; bootstrap users have **no** location | `userModel.js:80-92`; `orgBootstrapService.js:95-97` |
| Menu per-location? | Org-scoped categories; location affects inventory not menu split | Category model org-scoped |
| Each location = terminal? | Location is branch; not 1:1 with terminal | — |
| Owner add location from dashboard? | **NO** Stockix dashboard UI found | POS tenant API / platform API |
| Printer settings per location? | Location model supports settings | `locationModel.js` |

**Default entitlements:** `maxLocations: 5`, `maxUsers: 25` on Organization (`organizationModel.js:71-81`).

---

### 3.4 Warehouse

| Question | Answer |
|----------|--------|
| POS has warehouses? | **Locations** with `locationType: "warehouse"` option — not Finance warehouses |
| POS uses Locations instead? | **YES** — primary concept is `Location` |
| POS location = Finance warehouse? | **Mapped via IntegrationConfig** — `defaultWarehouseId` + `locationMapping[]` (`integrationConfigModel.js:19-32`) |
| One warehouse per location or shared? | Configurable: `defaultWarehouseId` fallback or per-location mapping (`bigcapitalSyncProcessor.js:52-63`) |

POS internal `/api/warehouse` = zones/bins (`warehouseController.js:7-57`), distinct from Bigcapital warehouse IDs.

---

### 3.5 POS Multi-organization

| Question | Answer |
|----------|--------|
| One tenant, multiple POS orgs? | **YES** in platform multi-tenant MongoDB mode |
| Each brand = separate org? | Typical pattern — org-scoped data via `orgScopePlugin` |
| Orgs share inventory/menu? | **NO** — scoped by `organization` field |
| Owner add POS org from dashboard? | Via platform API provisioning; not full dashboard CRUD |

---

### 3.6 POS Emails

| Email | Implemented | Provider | Evidence |
|-------|:-----------:|----------|----------|
| Provision credentials | ❌ | — | PINs via control-plane job only |
| PIN delivery | ❌ | — | — |
| Org invitation | ✅ | Resend + Redis queue | `platformInvitationController.js:52-70`, `platformWorker.js:59-96` |
| Password reset | ❌ in grep | — | Invitation accept sets password (`authController.js:460-586`) |
| Low stock alert | ❌ | — | — |
| Shift report | ✅ scheduled | Resend | `reportScheduleService.js:42-63` |
| Suspension warning | Stub | — | `platformWorker.js:98-100` — `console.info` only |

**Config:** `config.js:22-23,104-106` — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Requires Redis for queue.

---

## 4. Combined: Accounting + POS

### 4.1 Extra Steps vs Single-product

**Gate:** `hasAccountingAndPos(modules)` — `module-stacks.ts:102-106`

| Step | Accounting only | POS only | Combined |
|------|:---------------:|:--------:|:--------:|
| Finance stack + bootstrap + build | ✅ | ❌* | ✅ |
| `tenant.activate_warehouses` | ❌ | ❌ | ✅ |
| `tenant.seed_pos_defaults` | ❌ | ❌ | ✅ |
| `syncFinanceLicense` | ✅ | ❌ | ✅ |
| POS stack + org bootstrap | ❌ | ✅ | ✅ |
| `tenant.wire_pos_integration` | ❌ | ❌ | ✅ |

\*With `PROVISION_MODULE_GATING=1`; local default `=0` still provisions Finance for POS-only.

**Wire step** (`provision-runtime.ts:1222-1276`, `wire-pos-bigcapital-integration.ts:67-78`): PUT POS integration with `financeTenantId`, `internalBaseUrl`, `internalSecret`, walk-in/cash/card IDs, optional `defaultWarehouseId`.

**Partial failure:** POS or wire failure → tenant `partial`, Finance deployment `active` (`provision-runtime.ts:1239-1304`).

---

### 4.2 Shared Resources

| Resource | Shared? | Detail |
|----------|---------|--------|
| Docker compose | **SEPARATE** | `stockix-tenant-{slug}` vs `stockix-pos-{slug}` |
| Redis | **SEPARATE** per stack | Each compose brings own Redis |
| Database | **SEPARATE** | Postgres (Finance) vs MongoDB (POS) |
| `INTERNAL_API_SECRET` | **SAME value** injected into both stacks | Finance internal API auth |
| `AUTH_TOKEN_SECRET` | Per-stack | Not shared |
| Network path POS → Finance | HTTP via `FINANCE_INTERNAL_BASE_URL` on POS container | `pos-tenant-stack/docker-compose.yml:23,46`; `build-finance-internal-url.ts:7-38` |

---

### 4.3 Multi-org in Combined Mode

| Mapping | Current behavior |
|---------|------------------|
| POS org → Finance org | **1:1** at integration config level — one `financeTenantId` per POS org |
| Many POS locations → one Finance org | **YES** — multiple locations map via `locationMapping[]` to same Finance tenant |
| Many Finance orgs → one POS org | **NO** — single `financeTenantId` on IntegrationConfig |

**Restaurant group (3 branches) setup:**

1. One Stockix tenant with accounting+pos modules
2. One Finance org (or sub-orgs per branch via `organization.provision`)
3. One POS org with 3 Locations (MAIN + branch2 + branch3)
4. `locationMapping` each POS location → Finance warehouse (activate-warehouses per Finance tenant if sub-orgs)
5. Wire integration with seeded walk-in/cash/card IDs

---

### 4.4 Warehouse in Combined Mode

| Question | Answer |
|----------|--------|
| One Finance warehouse for all POS locations? | **Possible** — `defaultWarehouseId` fallback |
| One warehouse per POS location? | **Possible** — explicit `locationMapping` |
| Configurable? | **YES** — PATCH integration route (`integrationRoute.js:37-105`) |
| Stock valuation multi-location? | Finance warehouse per mapping; POS inventory per location |

Primary warehouse code **10001** created at `activate_warehouses` (`InternalActivateWarehouses.service.ts:75-109`). Auto-map MAIN → warehouse if mapping empty (`platformIntegrationController.js:96-111`).

---

## 5. Owner Dashboard Functionality

### 5.1 What Owner Sees per Tenant

**File:** `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx`

| Section | Visible data |
|---------|--------------|
| Profile | Name, slug, status, admin email/names, owner ID, plan, created, **modules (read-only badges)** |
| Infrastructure | Deployment status, port, compose project, registration, `lastError` |
| Finance bootstrap | Admin email + one-time password (~15 min cache) |
| POS | URL, org link, **masked PINs** per role |
| Integration IDs | `financeTenantId`, `posOrganizationId`, walk-in/cash/card/warehouse IDs |
| Sub-orgs | `OrgSwitcher` |
| Finance users | List when accounting active |
| License | Key, status, dates, modules |
| Provisioning history | Event timeline (phase, level, message) |
| Partial state | Amber alert when Finance OK, POS failed |

---

### 5.2 What Owner Can Do

| Action | Available | API |
|--------|:---------:|-----|
| Edit profile (name, admin fields) | ✅ | `PATCH /api/tenants/:id` |
| Retry full provision (failed) | ✅ | `POST .../retry-provision` |
| Retry POS only (partial) | ✅ | `POST .../retry-provision` `{ retryPosOnly: true }` |
| Stop provisioning | ✅ | `POST .../provision-stop` |
| Suspend tenant | ✅ | `POST .../suspend` |
| Reactivate | ✅ | `POST .../reactivate` |
| Delete tenant | ✅ | `DELETE .../id?volumes=` |
| Repair Finance link | ✅ | `POST .../repair-finance-link` |
| Invite Finance user | ✅ | `POST .../users/invite` |
| Impersonate Finance | Super only | `POST .../impersonate` |
| Generate / assign / revoke license | Super only | License endpoints |
| Re-provision (change modules) | ❌ | No API |
| View/copy full POS PINs | ❌ on detail | Masked only |
| Extend license | Billing+ / super | License extend API |
| Change modules post-create | ❌ | PATCH excludes modules |

---

### 5.3 Missing from Dashboard

| Feature | Missing | Priority | Notes |
|---------|:-------:|:--------:|-------|
| Full POS PIN reveal on tenant detail | ✅ | P1 | Exists on provision-status; detail shows `pinMasked` only |
| Module change after provision | ✅ | P1 | Modules display-only |
| Re-wire integration after partial | ✅ | P2 | POS-only retry skips `wire_pos_integration` |
| Unified entitlements editor | ✅ | P2 | Per PLATFORM_REFERENCE §8 |
| Provision meta drill-down | ✅ | P3 | Timeline lacks meta JSON viewer |
| POS location management | ✅ | P2 | No dashboard UI |

---

### 5.4 Plans Management from Dashboard

| Capability | Status |
|------------|--------|
| List / create / edit / deactivate plans | ✅ `plans/page.tsx` |
| Assign plan to tenant | Via license assign (updates `tenants.planSlug`) |
| Upgrade/downgrade flow | Manual license extend + assign; no dedicated UX |

---

## 6. Email Complete Status

| Flow | Control Plane | Finance | POS | Chatwoot |
|------|:-------------:|:-------:|:---:|:--------:|
| Welcome (tenant admin) | ✅ `sendTenantWelcomeEmail` `index.ts:1617-1625` | ❌ | ❌ | — |
| Owner invite | ✅ `sendOwnerInviteEmail` `index.ts:1963` | N/A | N/A | N/A |
| User invitation | N/A | ✅ tenant SMTP | ✅ platform invite (Resend) | — |
| Password reset | N/A | ✅ | ❌ | — |
| License expiring (30d) | ✅ `sendLicenseExpiringEmail` | N/A | N/A | N/A |
| License expired | ✅ `sendLicenseExpiredEmail` | N/A | N/A | N/A |
| PIN credentials | N/A | N/A | ❌ | N/A |
| Low stock | N/A | N/A | ❌ | N/A |
| Scheduled reports | N/A | N/A | ✅ | — |

**Resend (control plane):** `apps/api/src/mail/mailer.js` — requires `RESEND_API_KEY` in root `.env`.

**Finance:** Per-tenant `MAIL_*` in provisioned `.env` via worker — not shared Resend key.

**POS:** `RESEND_API_KEY` on POS stack for platform invitations and report schedules.

---

## 7. Provision Events & Monitoring

### 7.1 Provision Event Log

**Schema:** `tenant_provision_events` — `packages/db/src/schema.ts:199-217`

Fields: `correlation_id`, `slug`, `tenant_id`, `parent_tenant_id`, `deployment_id`, `phase`, `level`, `message`, `meta` (jsonb), `created_at`.

**Writers:**

- Worker tracer: `infra/worker-service/domain/provision-trace.ts:28-53` — scrubs passwords/PINs from meta
- API: `appendProvisionEventSafe` — `apps/api/src/index.ts:476-495`

**Readers:**

- Dashboard timeline: `page.tsx:1372-1424` → `GET /api/tenants/:id/events` (`index.ts:4839-4872`)
- Includes child org events via `parent_tenant_id` filter

---

### 7.2 Partial Provision Recovery

| Mechanism | Detail |
|-----------|--------|
| Status | `tenants.status = 'partial'`, deployment `active` + `last_error` |
| Dashboard | Partial banner + "Retry POS only" |
| API | `POST /tenants/:id/retry-provision` with `retryPosOnly` |
| Worker | Early exit POS-only branch `provision-runtime.ts:447-524` |
| Resume journal | Skips completed ops e.g. `hasOp("tenant.wire_pos_integration")` |
| Gap | POS-only retry **does not** re-run wire step |
| Ops | Stuck `provisioning` in DB vs completed job — see SAAS_AUDIT_EMAIL §1 |

---

## 8. Snake_case Bug Status

Finance global serializer emits **snake_case**; workers must use `parseFinanceApiJsonText` (`packages/shared/src/finance-api.ts:34-50`) which normalizes to camelCase.

| Endpoint | Field | Snake fallback in adapter | Status |
|----------|-------|:-------------------------:|--------|
| activate-warehouses | `primaryWarehouseId` | ✅ `body.primary_warehouse_id` | **FIXED** — `activate-finance-warehouses.ts:41-42` |
| seed-pos-defaults | `walkInCustomerId` | ❌ (relies on normalizer only) | **FIXED** via normalizer — `seed-finance-pos-defaults.ts:31,41-43` |
| seed-pos-defaults | `cashAccountId` | ❌ | **FIXED** via normalizer |
| seed-pos-defaults | `cardAccountId` | ❌ | **FIXED** via normalizer |

**Note:** `seed-finance-pos-defaults.ts` reads camelCase keys only after `parseFinanceApiJsonText`; explicit snake fallbacks not needed if normalizer runs (unlike warehouses adapter which keeps dual fallback for defense in depth).

**Historical failure:** `activate_warehouses_failed:missing_primaryWarehouseId` when camelCase read without normalization — documented in PROVISIONING_REFERENCE §1.

---

## 9. Complete Gap List

| # | Gap | Area | Severity | Status |
|---|-----|------|:--------:|:------:|
| G1 | No Finance bootstrap welcome email | Accounting | Medium | OPEN — by design; control plane welcome only |
| G2 | `maxUsers` not on Stockix plans; sync defaults 999 | License | Medium | OPEN |
| G3 | Provision sync `maxOrganizations` defaults to 1 | License | High | OPEN — plan limits may not reach Finance until full sync |
| G4 | Full POS PINs not on tenant detail (masked only) | Dashboard | High | OPEN |
| G5 | Modules not editable post-provision | Dashboard | High | OPEN |
| G6 | POS-only retry skips integration wire | Combined | Medium | OPEN |
| G7 | Plaintext PINs in Mongo `defaultCredentials` | POS Security | Medium | OPEN |
| G8 | Global PIN namespace (not per-org) | POS Security | Medium | OPEN |
| G9 | POS license window decoupled from Stockix license | License | Medium | OPEN |
| G10 | Dashboard license generate defaults to accounting-only modules | License | Low | OPEN |
| G11 | Separate-stack sub-org lacks COA copy-from | Multi-org | Medium | OPEN |
| G12 | `PROVISION_MODULE_GATING=0` local default ignores module selection | Provision | Medium | Config — set `=1` in prod |
| G13 | Dual 401 handlers in Finance webapp | Session | Low | Partially fixed |
| G14 | No POS provisioning credential email | POS | Medium | OPEN |
| G15 | Suspension warning email stub in POS worker | POS | Low | OPEN |

---

## 10. What Needs To Be Built

### Priority 1 (blocks go-live)

- [ ] Set `PROVISION_MODULE_GATING=1` in production after matrix tests (`pnpm provision:modules`)
- [ ] Ensure provision license sync passes plan `maxOrganizations` / modules to Finance (`provision-runtime.ts:1188-1191`)
- [ ] Verify Resend domain + per-tenant `MAIL_*` after each provision (ops checklist)
- [ ] Full PIN reveal or secure one-time credential export on tenant detail

### Priority 2 (important but not blocking)

- [ ] Post-provision module add/remove (re-provision selected stacks)
- [ ] POS-only retry should re-run `wire_pos_integration` when integration IDs exist
- [ ] Add `maxUsers` to plans schema or document Finance cap policy
- [ ] COA copy-from for separate-stack sub-tenants
- [ ] Dashboard POS location management (or link to POS admin)

### Priority 3 (polish)

- [ ] Provision timeline meta JSON drill-down
- [ ] Unified entitlements UI (PLATFORM_REFERENCE §8)
- [ ] Explicit snake_case fallbacks in seed adapter (parity with warehouses)
- [ ] POS suspension warning email implementation
- [ ] Wire Stockix license expiry to POS org license window

---

## Appendix: Key File Index

| Topic | Path |
|-------|------|
| Plans / licenses schema | `packages/db/src/schema.ts` |
| License API | `apps/api/src/license-http.ts` |
| License utils | `apps/api/src/license-utils.ts` |
| Plan limits | `apps/api/src/plan-limits.ts` |
| Finance license sync | `apps/api/src/finance-license.client.ts` |
| Provision runtime | `infra/worker-service/src/provision-runtime.ts` |
| Org provision | `infra/worker-service/src/org-provision-runtime.ts` |
| POS bootstrap adapter | `infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts` |
| Finance API normalize | `packages/shared/src/finance-api.ts` |
| Warehouses / seed adapters | `infra/worker-service/domain/provisioning/adapters/activate-finance-warehouses.ts`, `seed-finance-pos-defaults.ts` |
| Wire integration | `infra/worker-service/domain/provisioning/adapters/wire-pos-bigcapital-integration.ts` |
| POS org bootstrap | `services/posnew/apps/pos-backend/services/orgBootstrapService.js` |
| POS integration model | `services/posnew/apps/pos-backend/models/integrationConfigModel.js` |
| Finance license guard | `services/stockix-finance/packages/server/src/modules/License/LicenseGuard.middleware.ts` |
| Tenant detail UI | `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` |
| Control plane mail | `apps/api/src/mail/send.ts` |
| Provision events | `packages/db/src/schema.ts:199-217`, `infra/worker-service/domain/provision-trace.ts` |

---

*End of audit. Generated read-only from codebase trace; cross-referenced with docs/SAAS_AUDIT_EMAIL.md, docs/PROVISIONING_REFERENCE.md, docs/PLATFORM_REFERENCE.md.*
