# Bigcapital Organization & Tenant Audit
**Purpose:** Audit of organization setup, sub-org inheritance, auth controls, licensing, and admin management for our white-label SaaS deployment.
**Date:** Tuesday, May 19, 2026
**Auditor:** AI Code Audit

**Codebase root:** `services/stockix-finance/` (Bigcapital v0.22.0 fork). Stockix control plane: `apps/api/`, `packages/db/`, `infra/worker-service/`.
---

## 1. ORGANIZATION SETUP WIZARD (MAIN ORG)

### What We Need
When a tenant (main organization) logs in for the first time after provisioning, they MUST be redirected to a setup wizard that collects:
- Organization name
- Base currency
- Fiscal year start month
- Industry / business type
- Country
- Address
- Tax number / VAT number
- Organization logo
- Date format preference
- Language preference

The wizard must be MANDATORY — it cannot be skipped or bypassed.

### Audit Findings

**Does the setup wizard exist?** Yes — a multi-step wizard under `/setup`.

| Question | Answer |
|----------|--------|
| File path | `packages/webapp/src/containers/Setup/WizardSetupPage.tsx` (lines 9–17) |
| Route | `/setup` registered in `packages/webapp/src/components/Dashboard/PrivatePages.tsx` (line 26) |
| Trigger | `EnsureOrganizationIsReady` redirects unready orgs to `/setup` (`packages/webapp/src/components/Guards/EnsureOrganizationIsReady.tsx`, lines 13–21). Ready = `tenant.initialized_at` + `tenant.seeded_at` (`packages/server/src/modules/System/models/TenantModel.ts`, lines 34–36). |
| Guard on dashboard | `EnsureOrganizationIsReady` wraps dashboard at `PrivatePages.tsx` lines 28–30 |
| Bypass possible? | **Yes — multiple paths** (see below) |
| DB completion flag | **No server-side flag.** Client-only Redux `is_congrats` (`organizations.reducers.tsx` lines 31–35; `organizations.selectors.tsx` lines 32–35). Not persisted to MySQL. |

**Wizard steps** (`packages/webapp/src/containers/Setup/SetupWizardContent.tsx`, lines 36–50):
1. **Subscription** — LemonSqueezy plan picker (`SetupSubscription.tsx`)
2. **Organization** — form (`SetupOrganizationForm.tsx`)
3. **Initializing** — polls build job (`SetupInitializingForm.tsx`)
4. **Congrats** — dismisses wizard (`SetupCongratsPage.tsx`)

**Step selection logic** (`packages/webapp/src/store/organizations/withSetupWizard.tsx`, lines 19–24):
- Subscription step when `!isSubscriptionActive`
- Organization step when `!isOrganizationReady && !isOrganizationBuildRunning`
- Initializing when build running
- Congrats when `isOrganizationSetupCompleted` (Redux `is_congrats`)

**Bypass paths:**
1. **Provisioning builds org before first login** — Worker calls `POST /api/organization/build` (`infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts`, lines 180–185; `infra/worker-service/src/provision-runtime.ts`, lines 540–555). Sets `initialized_at` / `seeded_at` → `isOrganizationReady` is true → user never sees organization step.
2. **`EnsureOrganizationIsNotReady` ejects users from `/setup` once ready** — If `isOrganizationReady && !isOrganizationSetupCompleted`, redirects to `/` (`EnsureOrganizationIsNotReady.tsx`, lines 19–21). Provisioned tenants skip congrats/subscription UI on `/setup`.
3. **No dashboard guard for wizard completion** — Only `EnsureOrganizationIsReady` on `/`; nothing checks `is_congrats` before showing dashboard.
4. **Subscription step skippable** — If subscription already active (e.g. seeded plan), wizard jumps past subscription (`withSetupWizard.tsx` line 20).

**Fields collected in setup form** (`SetupOrganizationForm.tsx`):
| Field | In wizard? | Server `BuildOrganizationDto` |
|-------|------------|-------------------------------|
| Organization name | ✅ lines 46–51 | ✅ required (`Organization.dto.ts` lines 35–40) |
| Base currency | ✅ lines 74–90 | ✅ required (lines 57–62) |
| Fiscal year | ✅ lines 110–126 | ✅ required (lines 71–76) |
| Country (`location`) | ✅ lines 54–70 | ✅ required (lines 50–55) |
| Language | ✅ lines 93–107 | ✅ required (lines 78–83) |
| Timezone | ✅ lines 128–142 | ✅ required (lines 64–69) |
| Industry | ❌ | ⚠️ optional on API only (lines 42–48) — not in wizard |
| Address | ❌ | ❌ not in `BuildOrganizationDto`; only in `UpdateOrganizationDto` (lines 179–198) |
| Tax/VAT number | ❌ | ❌ not in `BuildOrganizationDto`; column exists on `tenants_metadata` (migration `20231012112401_add_tax_number_column_to_tenants_metadata_table.js`) and `UpdateOrganizationDto.taxNumber` (line 222) |
| Logo | ❌ | ❌ not in build; `logoKey` on update only (lines 208–214) |
| Date format | ❌ | ⚠️ optional on API (lines 85–91); defaulted in `Organization.utils.ts` line 47 to `'DD MMM YYYY'` |

Validation schema (`SetupOrganization.schema.tsx`, lines 6–18) matches wizard fields only (no industry, address, tax, logo, date format).

### Status
| Item | Status | File | Notes |
|------|--------|------|-------|
| Setup wizard exists | ✅ | `packages/webapp/src/containers/Setup/WizardSetupPage.tsx` | 4 steps incl. subscription |
| Wizard is mandatory (cannot bypass) | ❌ | `EnsureOrganizationIsNotReady.tsx`, `PrivatePages.tsx` | Provisioned + ready org bypasses; no server flag |
| Redirected on first login | ⚠️ | `EnsureOrganizationIsReady.tsx` | Only if `!is_ready`; provisioned tenants go straight to dashboard |
| Collects org name | ✅ | `SetupOrganizationForm.tsx` L46–51 | |
| Collects base currency | ✅ | `SetupOrganizationForm.tsx` L74–90 | |
| Collects fiscal year | ✅ | `SetupOrganizationForm.tsx` L110–126 | |
| Collects country | ✅ | `SetupOrganizationForm.tsx` L54–70 | |
| Collects address | ❌ | — | Preferences → General only |
| Collects tax/VAT number | ❌ | — | Preferences → General only |
| Collects logo | ❌ | — | Preferences → General only |
| Collects date format | ❌ | — | API default only |
| Collects language | ✅ | `SetupOrganizationForm.tsx` L93–107 | |
| DB completion flag | ❌ | `organizations.reducers.tsx` L31–35 | Redux `is_congrats` only; lost on refresh |

### What Needs To Be Built / Fixed
1. **Persist setup completion in DB** — Add e.g. `setup_completed_at` on `tenants` or `tenants_metadata`; expose via `GET /organization/current`; stop using Redux-only `is_congrats`.
2. **Enforce wizard on dashboard** — Guard in `PrivatePages.tsx` or `Dashboard` that redirects to `/setup` until DB flag set (even when `is_ready`).
3. **Align provision vs wizard** — Either skip wizard entirely for provisioned tenants (documented product choice) OR run wizard for missing fields only; today is inconsistent.
4. **Extend `BuildOrganizationDto` + wizard** — Add industry, address, taxNumber, logoKey, dateFormat to `packages/server/src/modules/Organization/dtos/Organization.dto.ts` and `SetupOrganizationForm.tsx` / `SetupOrganization.schema.tsx`.
5. **Fix `EnsureOrganizationIsNotReady`** — Should not redirect ready orgs away from `/setup` until setup completion flag is true (`EnsureOrganizationIsNotReady.tsx` L19–21).
6. **Decide subscription step** — For white-label SaaS, LemonSqueezy step (`SetupSubscription.tsx`) likely should be removed or auto-skipped when license is managed by Stockix owner dashboard.

---

## 2. SUB-ORGANIZATION CREATION & SETTINGS INHERITANCE

### What We Need
When a sub-organization is created under a parent organization:
- Inherit: base currency, fiscal year, tax rates, chart of accounts template, default accounts, date format, language, country
- Sub-org can override after creation
- Parent views all sub-orgs
- Sub-org creation from SaaS owner dashboard (not Bigcapital UI)

### Audit Findings

**Multi-org in Bigcapital (finance stack):**
- Each `POST /api/auth/register` creates a **new tenant** (`AuthSignup.service.ts` L65–66).
- `user_tenants` table links users to multiple tenants (`packages/server/src/modules/System/models/UserTenant.ts`; migration `20260516000000_create_user_tenants_table.js`).
- `POST /api/auth/switch-tenant` switches active org (`packages/server/src/modules/Auth/Authed.controller.ts` L66–70).
- **No `parent_organization_id` or `parent_tenant_id` on Bigcapital `tenants` table** (`20200420134631_create_tenants_table.js` — only `organization_id`, timestamps).

**Multi-org in Stockix control plane:**
- `organizations` table: multiple rows per `tenant_id`, no parent FK (`packages/db/src/schema.ts` L71–90).
- Sub-org provisioning: `apps/api/src/org-provision.ts` enqueues `organization.provision` with `parentTenantSlug` + `mainTenantInternalBaseUrl`.
- Runtime: `infra/worker-service/src/org-provision-runtime.ts` registers new finance org on **parent stack** (L231–238), switches tenant (L242–248), inherits settings (L250–271), builds DB (L274–285).

**Settings inheritance (worker → finance build):**
- Implemented in `fetch-stockix-finance-org-settings.ts` — copies: `name`, `baseCurrency`, `timezone`, `location`, `fiscalYear`, `language`, `dateFormat` from parent `GET /api/organization/current` metadata.
- Fallback: `MENA_DEFAULTS` (same file L14–23).
- **NOT inherited:** tax rates, chart of accounts template, default AR/AP/inventory accounts — sub-org gets **standard seed** via `BuildOrganization.service.ts` (`migrateTenant` + `seedTenant`, L51–52) same as any new org.
- Tax rates / COA are tenant DB seed data, not copied from parent tenant DB.

**Sub-org override:** After build, tenant admin can change settings via `PUT /organization` (`Organization.controller.ts` L130–145) and Preferences UI.

**Parent view sub-orgs:**
- Stockix owner dashboard: `GET` tenant organizations via `apps/api` (e.g. `apps/dashboard/app/(dashboard)/tenants/[id]/...`).
- Bigcapital UI: `useOrganizations` calls `GET organization/all` (`packages/webapp/src/hooks/query/organization.tsx` L21) — **endpoint does not exist on server** (no handler in `Organization.controller.ts`). Multi-org switch in finance UI is broken/incomplete.

**Creation from owner dashboard:** ✅ `apps/api/src/org-provision.ts` + worker `executeOrgProvisionRuntime` — not from Bigcapital UI.

### Status
| Item | Status | File | Notes |
|------|--------|------|-------|
| Multi-org support exists | ⚠️ | `UserTenant.ts`, `org-provision-runtime.ts` | Same finance stack; switch-tenant; no parent-child in finance DB |
| Sub-org creation via API | ✅ | `apps/api/src/org-provision.ts`, `org-provision-runtime.ts` | Control plane + worker |
| Inherits base currency | ✅ | `fetch-stockix-finance-org-settings.ts` L72–87 | |
| Inherits fiscal year | ✅ | same | |
| Inherits tax rates | ❌ | — | Not copied; seed defaults |
| Inherits chart of accounts | ❌ | — | New tenant seed only |
| Inherits default accounts | ❌ | — | New tenant seed only |
| Inherits date format | ✅ | `fetch-stockix-finance-org-settings.ts` L77–77 | |
| Inherits country | ✅ | L74 | |
| Inherits language | ✅ | L76 | |
| Sub-org can override settings | ✅ | `Organization.controller.ts` PUT | |
| Parent-child relationship in DB | ❌ | `tenants` migration | No parent FK in finance or `organizations` |
| Parent can view sub-orgs | ⚠️ | Stockix dashboard | Finance UI `organization/all` missing |

### What Needs To Be Built / Fixed
1. **Implement `GET /organization/all`** (or remove dead client call) — List tenants for current user from `user_tenants` + metadata; wire `organizations.actions.tsx` L16.
2. **COA / tax / default accounts inheritance** — Post-build job to copy from parent tenant DB or shared template id; files: new command under `packages/server/src/modules/Organization/` + worker hook after `fetchBuildOrganization`.
3. **Optional: `parent_tenant_id` on system `tenants`** — For reporting; migration in `packages/server/src/database/system/migrations/`.
4. **Finance org switcher** — Fix sidebar org list (`useOrganizations`) to use working API or Stockix public org list (`planfork.md` references `useStockixOrgs.tsx`).

---

## 3. SIGNUP DISABLED FOR ALL TENANTS

### What We Need
Public signup completely disabled; only provisioning API and admin invites; `SIGNUP_DISABLED` enforced API + frontend; 403 on attempts; global per deployment; no OAuth bypass; invitations still work.

### Audit Findings

**Env var:** ✅ `SIGNUP_DISABLED` — `packages/server/src/common/config/signup-restrictions.ts` L5–6 (`parseBoolean(process.env.SIGNUP_DISABLED, false)`). Per-tenant `.env` written by `infra/worker-service/domain/provisioning/tenant-env.ts` L42–44.

**API enforcement:** ⚠️ `AuthSignup.service.ts` L153–183:
- If `disabled` and **no** `SIGNUP_ALLOWED_EMAILS` / `SIGNUP_ALLOWED_DOMAINS` → throws `SIGNUP_RESTRICTED`.
- If disabled **with** allowlists → only listed emails/domains can register.
- Provisioning sets `SIGNUP_ALLOWED_EMAILS` to bootstrap admin email (`tenant-env.ts` L35–44) — **`/api/auth/register` still works for that email** (used by `FetchStockixFinanceBootstrap` and `org-provision-runtime.ts` L62–76).

**HTTP status:** ⚠️ `ServiceError` defaults to **`400 Bad Request`**, not 403 (`packages/server/src/modules/Items/ServiceError.ts` L15).

**Frontend:**
- Login / reset-password footers hide “Sign up” when `signupDisabled` (`Login.tsx` L62–66; `AuthMetaBoot.tsx` L17).
- **`/auth/register` route always registered** (`packages/webapp/src/routes/authentication.tsx` L31–33) — **no route guard**; `Register.tsx` does not check `signupDisabled`.
- Direct navigation to `/auth/register` still renders the form.

**Global vs per-tenant:** Per-tenant stack `.env` (each Docker Compose tenant). Policy is consistent via worker template, not a single cluster flag.

**OAuth user signup:** No Google/social **login** strategy under `packages/server/src/modules/Auth/` (only Local, JWT, API key). `passport-google-oauth20` in `package.json` is unused for auth signup. Stripe OAuth is payment integration only.

**Invitation flow:** ✅ Separate from signup — `UsersInviteController` + `AcceptInviteUser.service.ts` (updates invited user password, L62–68). Does not call `AuthSignupService.validateSignupRestrictions`.

**Register alias:** `POST /api/auth/register` → same as signup (`Auth.controller.ts` L115–129).

### Status
| Item | Status | File | Notes |
|------|--------|------|-------|
| SIGNUP_DISABLED env var exists | ✅ | `signup-restrictions.ts` L5–6 | Also `tenant-env.ts` |
| API enforces signup disabled | ⚠️ | `AuthSignup.service.ts` L153–183 | Allowlist bypass for provision email |
| Frontend hides signup page | ❌ | `authentication.tsx` L31–33 | Route always mounted |
| Returns 403 on disabled signup attempt | ❌ | `ServiceError.ts` L15 | Returns 400 |
| Applied globally (all tenants) | ⚠️ | `tenant-env.ts` | Per-tenant env; same policy when provisioned |
| No bypass via OAuth | ✅ | Auth module | No social signup |
| Invitation flow still works when signup disabled | ✅ | `AcceptInviteUser.service.ts` | |

### What Needs To Be Built / Fixed
1. **Register route guard** — Redirect or 404 on `Register.tsx` when `signupDisabled` from `useAuthMetaBoot`.
2. **Separate provisioning endpoint** — e.g. `POST /api/internal/provision-tenant` with `InternalSecretGuard` instead of reusing signup allowlist (`Auth.controller.ts` L119–129).
3. **Return 403** for `SIGNUP_RESTRICTED` — Pass `HttpStatus.FORBIDDEN` in `AuthSignup.service.ts` throws.
4. **Remove allowlist for production** — If true “no signup”, do not add bootstrap email to `SIGNUP_ALLOWED_EMAILS` for public register; use internal provision only.
5. **Document:** Invite acceptance creates users without signup — acceptable if invites are admin-controlled.

---

## 4. LICENSE MANAGEMENT

### What We Need
License per tenant: org number, start/end dates, plan type, module flags, max users/orgs, active/suspended; expiry → read-only or lockout; suspension → lockout; connection to owner dashboard via Platform API / webhook / JWT.

### Audit Findings

**Bigcapital (finance) subscription model:**
- `subscription_plan_subscriptions` / `PlanSubscription` model (`packages/server/src/modules/Subscription/models/PlanSubscription.ts`): `startsAt`, `endsAt`, `trialEndsAt`, `canceledAt`, `planId`, `paymentStatus`, LemonSqueezy id.
- Plans: `subscription_plans` — price, slug, intervals (`Plan.ts`); seeded for LemonSqueezy (`20240714101229_seed_monthly_subscription_plans.js`).
- **No** `organization_number`, **no** Stockix license key, **no** max users/orgs on plan tables.
- Feature gating: `FeaturesManager` reads tenant **settings** group `features` (`FeaturesSettingsDriver.ts`) — not tied to Stockix `licenses` table.
- Inactive subscription: frontend `isSubscriptionInactive` → sidebar filtering + `GlobalErrors.tsx` message; `EnsureSubscriptionsIsInactive` redirects some routes to `/billing` — **not full read-only lockout** of API.

**Stockix control plane license model:** ✅ `packages/db/src/schema.ts` `licenses` (L317–360): `licenseKey`, `planSlug`, `tenantId`, `status`, `validFrom`, `expiresAt`, `maxActivations`, `maxOrganizations`, `isPerpetual`, `gracePeriodDays`. Plans table L300–314: `maxOrganizations`, `maxActivations`.
- Auto-assign on tenant provision: `apps/api/src/index.ts` ~L1221–1279.
- **No code found** pushing license state into Bigcapital tenant DB or finance API on expiry/suspend.

**Organization number:** ❌ No field in `tenants`, `tenants_metadata`, Stockix `tenants`, or `organizations` schemas.

**Platform API for license:** ❌ No Bigcapital endpoint to set license. Stockix `apps/api` has `/licenses/*` routes; finance stack not notified.

**Read-only on expiry / lockout on suspend:** ❌ in finance. Stockix can set `tenants.status = 'suspended'` (`apps/api/src/index.ts`) — worker/Traefik may block access; finance app has no license middleware.

**JWT license validation:** ❌ Not implemented in finance JWT (`Jwt.strategy.ts` — standard user/tenant claims only).

### Status
| Item | Status | File | Notes |
|------|--------|------|-------|
| License/subscription model exists | ⚠️ | Finance: `PlanSubscription.ts`; Stockix: `schema.ts` licenses | Two disconnected systems |
| Organization number field | ❌ | — | Not found repo-wide |
| License start date field | ⚠️ | Finance: `startsAt`; Stockix: `validFrom` | Not synced |
| License end date field | ⚠️ | Finance: `endsAt`; Stockix: `expiresAt` | Not synced |
| Plan type field | ⚠️ | Stockix: `planSlug`; Finance: `planId`/slug | Not synced |
| Module flags (feature gating) | ⚠️ | `FeaturesSettingsDriver.ts` | Manual settings; not license-driven |
| Max users limit | ❌ | — | Not in finance |
| Max orgs limit | ⚠️ | Stockix `licenses.maxOrganizations` | Not enforced in finance |
| Active / suspended status | ⚠️ | Stockix `tenants.status`; Finance subscription status | Not linked |
| Read-only mode on expiry | ❌ | — | UI hints only for Lemon subscription |
| Lockout on suspension | ❌ | Finance | Stockix-level only |
| Platform API for external management | ❌ | Finance | Stockix API only |
| External system connection point | ⚠️ | `provision-runtime.ts`, `apps/api` | Provision + license insert; no ongoing sync |
| Signed JWT license validation | ❌ | — | |

### What Needs To Be Built / Fixed
1. **Bridge Stockix license → finance** — Webhook or cron: push `validFrom`/`expiresAt`/`planSlug`/feature flags into finance system DB or call internal API.
2. **Enforce limits** — Middleware on finance: max users (count `users`), block writes when license expired (Stockix is source of truth).
3. **Add `organization_number`** — Stockix tenant slug or dedicated field → finance `tenants_metadata` (see section 6).
4. **Read-only mode** — Global guard on POST/PUT/PATCH/DELETE when license inactive; configurable per entity.
5. **Retire or gate LemonSqueezy** — `SetupSubscription.tsx` + `Subscriptions.controller.ts` if billing is owner-dashboard-only.

---

## 5. ADMIN USER MANAGEMENT VIA SAAS OWNER DASHBOARD

### What We Need
Owner dashboard can create first admin, add/remove users, change roles, reset passwords, suspend users — via Platform API with master key.

### Audit Findings

**Bigcapital “Platform” / internal API:**
- `packages/server/src/modules/Internal/Internal.controller.ts` — **one endpoint:**
  - `POST /api/internal/attach-user-to-tenant` — body: `email`, `organizationId`; auth: `x-internal-secret` (`InternalSecret.guard.ts` L15–24).
  - Does **not** create users — only links existing system user by email (`AttachUserToTenant.service.ts` L25–28).
- Provisioning creates first user via `POST /api/auth/register` (`fetch-stockix-finance-bootstrap.ts` L64–97) — not a dedicated admin API.

**Tenant-scoped user API (JWT, inside tenant):**
- `packages/server/src/modules/UsersModule/Users.controller.ts`:
  - `PUT /users/:id` — edit name, email, roleId (`EditUser.dto.ts`)
  - `DELETE /users/:id` — soft delete
  - `GET /users`, `GET /users/:id`
  - `PUT /users/:id/activate`, `PUT /users/:id/inactivate`
- Invite: `UsersInviteController` — `PATCH /invite`, `POST /invite/users/:id/resend`
- Password reset: `POST /auth/send_reset_password`, `POST /auth/reset_password/:token` (public, `Auth.controller.ts` L140–157) — email-based, not owner-dashboard bulk API.

**Stockix owner dashboard (`apps/api`):**
- Tenant CRUD, provision, suspend, licenses, owners — **no routes found** to create finance users remotely (grep: no `finance.*user` / `createUser` in `apps/api/src`).
- Worker attaches admin after provision (`provision-runtime.ts` ~L3672–3696) if `INTERNAL_API_SECRET` set.

**Auth for internal calls:** `INTERNAL_API_SECRET` header — not a master Platform API key on a separate router. Same secret as Stockix worker.

### Status
| Item | Status | File | Notes |
|------|--------|------|-------|
| Platform API exists | ⚠️ | `Internal.controller.ts` | Single attach-user endpoint only |
| Create tenant via Platform API | ⚠️ | `AuthSignup` + worker | Via register, not Platform |
| Create first admin user via API | ⚠️ | `Auth.controller.ts` register | Signup flow + allowlist |
| Add additional admins via API | ⚠️ | `UsersInviteController` | Invite email; needs tenant JWT or new internal API |
| Remove user via API | ⚠️ | `Users.controller.ts` DELETE | Tenant JWT only |
| Change user role via API | ⚠️ | `Users.controller.ts` PUT | Tenant JWT only |
| Reset password via API | ⚠️ | `Auth.controller.ts` | Self-service email flow |
| Suspend user via API | ⚠️ | `Users.controller.ts` inactivate | Tenant JWT only |
| Platform API uses master API key | ⚠️ | `InternalSecret.guard.ts` | `x-internal-secret` |
| Platform API is separate from tenant API | ⚠️ | `/api/internal/*` vs `/api/users` | Not a full super-admin surface |

### What Needs To Be Built / Fixed
1. **`POST /api/internal/users`** — Create system user + `user_tenants` row + optional invite (owner dashboard worker calls with `INTERNAL_API_SECRET`).
2. **`PATCH /api/internal/users/:id`** — Role, active, password reset (generate token or set temp password).
3. **`DELETE /api/internal/users/:id`** — Remove membership or soft-delete.
4. **Stockix API wrappers** — `apps/api/src` routes that call finance internal URL per tenant deployment `internalPort`.
5. **Do not rely on `/auth/register` for ongoing admin creation** — Split from signup restrictions (section 3).

---

## 6. ORGANIZATION NUMBER SUPPORT

### What We Need
Unique organization number from owner dashboard; stored in finance; visible read-only in settings; settable on create via Platform API.

### Audit Findings
- **Grep** `organization_number`, `organizationNumber`, `external_id` across repo: **no matches**.
- Bigcapital `tenants.organization_id` is UUID string (`20200420134631_create_tenants_table.js` L5) — internal, not business org number.
- Stockix `tenants.slug` and `organizations.slug` exist (`packages/db/src/schema.ts`) — could serve as identifier but **not synced to finance** as `organization_number`.
- `financeOrganizationId` on Stockix `organizations` (L82) maps control-plane org → finance UUID.

### Status
| Item | Status | File | Notes |
|------|--------|------|-------|
| Organization number field in DB | ❌ | — | |
| Settable via Platform API | ❌ | — | |
| Exposed in org settings API | ❌ | — | |
| Visible in frontend (read-only) | ❌ | — | |

### What Needs To Be Built / Fixed
1. Migration: `organization_number` VARCHAR UNIQUE on `tenants_metadata` (or system `tenants`).
2. `BuildOrganizationDto` / internal provision DTO + Stockix tenant create payload.
3. `GetCurrentOrganizationResponse.dto.ts` + Preferences General read-only field.
4. Owner dashboard: generate/store number; pass to worker on provision.

---

## 7. SUMMARY — OVERALL STATUS

| Area | Overall Status | Priority |
|------|---------------|----------|
| Org setup wizard (main org) | ⚠️ | P1 |
| Sub-org settings inheritance | ⚠️ | P1 |
| Signup disabled globally | ⚠️ | P1 CRITICAL |
| License model (start/end date, plan) | ⚠️ | P1 |
| Platform API for user management | ❌ | P1 |
| Organization number field | ❌ | P2 |
| License connected to owner dashboard | ⚠️ | P1 |
| Read-only mode on license expiry | ❌ | P2 |
| Lockout on suspension | ❌ | P1 |

---

## 8. RECOMMENDED BUILD ORDER

| # | Task | Complexity | Files to create or modify | Dependencies |
|---|------|------------|---------------------------|--------------|
| 1 | Split internal provision from public signup; 403 on signup; guard `/auth/register` UI | Medium | `AuthSignup.service.ts`, `Auth.controller.ts`, `Register.tsx`, `authentication.tsx`, new `InternalProvision.controller.ts` | None |
| 2 | Persist setup wizard completion + dashboard guard | Medium | New migration `tenants_metadata.setup_completed_at`, `GetCurrentOrganization.service.ts`, `EnsureOrganizationIsReady.tsx`, `organizations.reducers.tsx` | None |
| 3 | Extend setup wizard fields (industry, address, tax, logo, date format) | Medium | `SetupOrganizationForm.tsx`, `Organization.dto.ts`, `Organization.utils.ts` | Task 2 |
| 4 | Stockix license → finance sync job + write middleware | High | New `packages/server/src/modules/License/` or middleware; `apps/api` webhook; config | Task 1 |
| 5 | Internal Platform user CRUD API | High | `Internal.controller.ts`, new commands, `apps/api` client | Task 1 |
| 6 | `organization_number` field + API + UI | Low | Migration, DTOs, Preferences General, worker provision payload | Task 5 |
| 7 | `GET /organization/all` + org switcher | Medium | New query service + controller method; `organization.tsx` | None |
| 8 | Sub-org COA/tax inheritance job | High | Worker + new `CopyParentTenantSettings.service.ts` | Task 7 |
| 9 | Read-only mode on license expiry | Medium | Global write guard | Task 4 |
| 10 | Remove/disable LemonSqueezy setup step for SaaS | Low | `withSetupWizard.tsx`, `SetupWizardContent.tsx` | Task 4 |

---

## 9. OPEN QUESTIONS

1. **License sync direction:** Should Stockix push license updates to each tenant finance stack via internal URL, or should finance pull Stockix API periodically?
2. **License expiry behavior:** Read-only (which modules?) vs full HTTP 402 lockout vs Traefik-only block?
3. **Provisioned tenants:** Should first login skip the wizard entirely (current de facto behavior) or force collection of missing fields (tax, logo, etc.)?
4. **Sub-org COA inheritance:** Full duplicate of parent tenant DB accounts vs shared template id vs industry template only?
5. **Organization number format:** Human-readable (`ORG-00042`) vs UUID vs tenant slug?
6. **Signup allowlist:** Is bootstrap `SIGNUP_ALLOWED_EMAILS` acceptable as “closed signup with provision exception,” or must **all** user creation go through internal API with zero public register?
7. **Multi-org UX:** Single finance deployment per Stockix customer with switch-tenant, or separate finance stack per sub-org? (Current: same stack, multiple tenants — `org-provision-runtime.ts` L231–238.)
8. **LemonSqueezy:** Keep Bigcapital native billing for self-serve, or fully replace with Stockix `licenses` table only?

---

End of file.
