# Plan & License System — Architecture Audit

> Analysis date: 2026-06-17  
> Scope: control-plane API (`apps/api`), Finance NestJS service (`services/stockix-finance`), dashboard (`apps/dashboard`), infra worker, provisioner

---

## 1. Architecture Overview

The system has **two physically separate license stores** kept in sync via HTTP push:
``
┌─────────────────────────────────────────────────────────────────────┐
│  Control Plane (PostgreSQL)  —  apps/api                            │
│                                                                     │
│  plans ──────────────────────┐                                      │
│  (master plan definitions)   │ limits snapshotted at               │
│                              ↓ license generation                   │
│  licenses ───────────────────────────────────────────               │
│  licenseActivations          │ status push (HTTP POST)              │
│  licenseHistory              ↓                                      │
│  tenants.planSlug (mirror)   │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │  POST /api/internal/license/sync
                               │  x-internal-secret header
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Per-Tenant Finance Stack (MySQL per tenant)                        │
│                                                                     │
│  tenant_licenses ── enforced by LicenseGuardMiddleware              │
│  subscription_plans / subscription_plan_subscriptions               │
│     (legacy Lemon Squeezy billing; dormant — BILLING_ENABLED=false) │
└─────────────────────────────────────────────────────────────────────┘
```

The control plane is the **single source of truth**. Finance only stores a read/enforce copy.

---

## 2. Data Models

### 2.1 Control Plane — `plans` table (PostgreSQL)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | Display name |
| `slug` | text UNIQUE | e.g. `starter`, `growth`, `pro`, `enterprise` |
| `description` | text | |
| `maxOrganizations` | integer | -1 = unlimited |
| `maxActivations` | integer | POS device limit |
| `maxUsers` | integer | Finance staff user cap |
| `isActive` | boolean | Soft delete |
| `sortOrder` | integer | Display ordering |
| `priceMonthly` / `priceAnnually` | integer | Cents; null = custom |
| `currency` | text | Default `USD` |
| `billingInterval` | text | `monthly`/`annually`/`one_time`/`custom` |
| `isPublic` | boolean | Visible in public plan listing |
| `features` | text | JSON array of feature strings |

Default seeded plans: `starter`, `growth`, `pro`, `enterprise` (via `ensure-default-plans.ts`, ON CONFLICT DO NOTHING).

### 2.2 Control Plane — `licenses` table (PostgreSQL)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `licenseKey` | text UNIQUE | `STKX-XXXX-XXXX-XXXX` or `STXI-...` (location-scoped) |
| `keyFormat` | text | `stkx` (random) or `stxi` (tenant+location+checksum) |
| `scopedLocationId` | text | POS location ObjectId when `stxi` format |
| `product` | text | `platform` / `pos_desktop` / `bundle` |
| `modules` | text | JSON array: `["accounting","pos","pms","chat"]` |
| `planSlug` | text | References `plans.slug` (no FK — soft reference) |
| `tenantId` | uuid nullable | FK → tenants (SET NULL on delete) |
| `status` | text | `unassigned` / `active` / `expired` / `revoked` / `suspended` |
| `activatedAt` | timestamp | When first assigned/activated |
| `validFrom` | timestamp | Earliest date the license may be used |
| `expiresAt` | timestamp | null if perpetual |
| `isPerpetual` | boolean | Skips expiry checks |
| `maxActivations` | integer | Snapshotted from plan at generation |
| `maxOrganizations` | integer | Snapshotted from plan at generation |
| `maxUsers` | integer nullable | Snapshotted from plan at generation |
| `activationCount` | integer | Running count of active device activations |
| `gracePeriodDays` | integer | Post-expiry grace window (default: 7) |
| `notes` | text | Internal operator notes |
| `createdById` / `revokedById` | uuid | FK → owners |
| `revokedAt` / `revokeReason` | | Permanent revocation record |

### 2.3 Control Plane — Supporting Tables

- **`licenseHistory`** — append-only audit log; action types: `generated`, `assigned`, `revoked`, `extended`, `activated`, `deactivated`, `plan_changed`, `limits_changed`, `synced_to_finance`, `expired_by_worker`, `expiry_warning_sent`, etc.
- **`licenseActivations`** — per hardware fingerprint; statuses: `active`, `deactivated`, `blacklisted`; includes offline JWT tokens (30-day window, HS256 signed with `LICENSE_SIGNING_SECRET`)
- **`blacklistedFingerprints`** — device-level ban list

### 2.4 Finance Side — `tenant_licenses` table (MySQL, per tenant)

| Column | Notes |
|--------|-------|
| `id`, `tenantId` | PK; numeric Finance tenant id |
| `planSlug` | Synced from control plane |
| `status` | `active` / `expired` / `grace` / `suspended` / `revoked` |
| `validFrom`, `expiresAt` | MySQL datetime (ISO converted in `SyncLicenseService.toMysqlDatetime`) |
| `gracePeriodDays` | Days of read-only grace after expiry |
| `maxUsers` | Finance staff user cap |
| `maxActivations` | POS device limit (reference only — not enforced here) |
| `maxOrganizations` | Sub-org creation cap (enforced by `LicenseService.assertCanCreateOrganization`) |
| `isPerpetual` | Skips expiry checks in Finance |
| `featureFlags` | JSON feature toggle map |

Note: **the license key itself** (`STKX-XXXX-XXXX-XXXX`) is **not stored in Finance**. Finance only holds the computed enforcement copy.

### 2.5 Finance Side — Legacy Billing Models (Dormant)

`subscription_plans` and `subscription_plan_subscriptions` tables live in the Finance MySQL system database. They are seeded with an `owner-managed` plan row on every new organization build (`SeedTenantLicenseOnBuilt`). The Lemon Squeezy webhook handler (`LemonSqueezyWebhooks.ts`) exists but `BILLING_ENABLED=false` in production, making the entire subscription flow inert.

---

## 3. License Creation → Assignment → Validation → Expiry Flow

### 3.1 Generation

```
POST /licenses/generate
  → validate planSlug exists and is active
  → if tenantId: validate modules ⊆ tenant.modules, tenant has no active license
  → for each count:
      generate STKX-XXXX-XXXX-XXXX key (collision retry × 3)
      or STXI-... for location-scoped POS (tenantId + locationId + HMAC)
  → INSERT licenses row
  → if tenantId: UPDATE tenants.planSlug, status = "active"
  → tx commit
  → (fire-and-forget) syncPosOrgLicenseFromLicense
  → INSERT licenseHistory(generated)
```

### 3.2 Assignment (Pre-Generated Key to Tenant)

```
POST /licenses/:id/assign
  → license.status must be "unassigned"
  → tenant must have no active license (409 if duplicate)
  → pull planLimits from plans table
  → UPDATE licenses: status=active, tenantId, activatedAt, validFrom, limits refreshed
  → UPDATE tenants.planSlug
  → INSERT licenseHistory(assigned)
  → (fire-and-forget) triggerFinanceLicenseSync → POST /api/internal/license/sync
  → (fire-and-forget) syncPosOrgLicenseFromLicense
  → (fire-and-forget) sendLicenseActivatedEmailForTenant
```

### 3.3 Finance Sync (Push)

`triggerFinanceLicenseSync(db, tenantId)` in `license-finance-sync.ts`:
1. Looks up `tenantDeployments.financeTenantId` (numeric MySQL tenant id)
2. Looks up active license + tenant status
3. Computes `mapStockixLicenseStatus()` → converts to Finance status enum (adds `grace` computed state)
4. Calls `syncFinanceLicenseForStockixTenant()` → HTTP POST to `http://{host}:{port}/api/internal/license/sync` with `x-internal-secret`
5. Finance `SyncLicenseService.sync()` does upsert on `tenant_licenses` WHERE `tenantId = dto.tenantId`
6. Clears Finance in-memory license cache for that tenantId

This sync is triggered on: assign, revoke, suspend, reactivate, extend, and worker expiry cron.

### 3.4 Validation at Runtime

**Control Plane** (`plan-limits.ts`):
- `getTenantLicenseEligibility()` → `"ok"` | `"no_active_license"` | `"license_expired"`
- `canCreateOrganization()` → checks eligibility + compares org count vs `license.maxOrganizations`
- Used in tenant provisioning flow to gate org creation

**Finance App** (`LicenseGuardMiddleware`):
- Runs on every request (bypasses `/api/internal`, `/api/auth`, `/api/ping`, `/api/health`, `/swagger`)
- Resolves tenant from `organization-id` header → looks up `TenantLicense` → calls `resolveEffectiveStatus()`
- Caches result in process-local Map with TTL (`getLicenseCacheTtlMs()`)
- Write methods (POST/PUT/PATCH/DELETE) blocked with HTTP 402 on: `expired`, `grace`, `revoked`, `suspended`
- Read methods: allowed through `expired` and `grace`; blocked only on `revoked` and `suspended`

### 3.5 Expiry Worker Flow

The infra worker runs a cron that:
1. Queries active non-perpetual licenses where `expiresAt < now`
2. Marks them `status = "expired"`
3. Calls `processLicenseExpiryFollowUp()` which:
   - Inserts `licenseHistory(expired_by_worker)`
   - Triggers Finance sync (Finance receives `"grace"` status if within grace window, `"expired"` after)
   - If past grace end: suspends tenant + deployment + POS org
   - Sends expired email to tenant admin
   - Sends in-app notification

Pre-expiry milestone warnings fire at: 90, 60, 30, 15, 7, 3, 2, 1 days before expiry (via BullMQ if Redis configured, inline otherwise).

### 3.6 Upgrade / Downgrade

There is no single atomic "change plan" operation. The documented process is:
1. **Revoke** the current license (`POST /licenses/:id/revoke`) — permanent; cannot be un-revoked
2. **Generate** a new license with the new `planSlug`
3. **Assign** it to the tenant

Or use **extend** (`POST /licenses/:id/extend`) to change `expiresAt` or flip `isPerpetual`.

---

## 4. UI Reflection

### 4.1 Control Plane Dashboard (Next.js — admin-only)

| Route | Content |
|-------|---------|
| `/licenses` | Paginated license list; filter by status/product/plan/tenant |
| `/licenses/[id]` | License detail: key, status, limits, activations, history tab |
| `/plans` | Plan CRUD (create/edit/deactivate) |
| `/tenants/[id]` | Tenant detail includes active license info |

All admin dashboard routes are gated by platform owner authentication.

### 4.2 Finance App (React SPA — tenant users)

License state is surfaced via the boot meta response (`GET /api/dashboard/boot-meta`):

```ts
interface IDashboardBootMeta {
  licenseStatus: 'active' | 'expired' | 'grace' | 'suspended' | 'revoked' | null;
  licenseExpiresAt: string | null;
  licenseGracePeriodEndsAt: string | null;
  billingEnabled: boolean;   // always false in production
}
```

This is fetched once at login and stored in the SPA's boot context (`useDashboardMeta`). The Finance app uses `licenseStatus` to show banners (e.g., "License in grace period. Upgrade to continue editing.") but **there is no dedicated License or Plan page visible to Finance users**. There is currently no Preferences section showing license details.

---

## 5. Identified Bugs, Inconsistencies, and Risks

### BUG-01 — Grace Period Default Inconsistency

| Location | Default |
|----------|---------|
| `license-constants.ts` `DEFAULT_GRACE_PERIOD_DAYS` | **7** |
| `SeedTenantLicenseOnBuilt.subscriber.ts` seed insert | **30** |
| `InternalLicenseController` DTO fallback | **30** |
| `LicenseService.getGracePeriodEndsAt` fallback | **30** |

**Impact:** When a new Finance org is built, the local `tenant_licenses` row is seeded with `gracePeriodDays: 30`. If the follow-up sync is delayed or fails, tenants get 30 days of post-expiry grace instead of 7. The worker and control plane calculate grace at 7 days. The Finance display calculates at 30 days via `license.gracePeriodDays ?? 30`. After a successful sync, the synced value (7) overrides the seed, but the seed state is observable during provisioning.

**Recommendation:** Align all fallback defaults to one constant, or seed with 0 and rely on sync to populate the real value before the org is usable.

---

### BUG-02 — Plan Update Does Not Propagate to Existing Licenses

When an operator edits `plans.maxUsers`, `plans.maxActivations`, or `plans.maxOrganizations`, the change **only affects licenses generated after the update**. Existing license rows retain the snapshotted values from when they were generated.

There is a diagnostic endpoint (`GET /licenses/sync-audit/:tenantId`) and a backfill script (`scripts/backfill-license-limits.ts`), but no automatic propagation.

**Risk:** Operator upgrades a plan definition to increase limits. Existing tenants on that plan do not benefit until their license is manually re-synced or a new license is generated.

---

### BUG-03 — `assertCanCreateOrganization()` Uses Wrong License Row

`LicenseService.assertCanCreateOrganization()` in Finance:

```ts
const license = await this.tenantLicenseModel
  .query()
  .orderBy('tenantId', 'asc')
  .first();
```

It takes the **first** `tenant_licenses` row by ascending `tenantId` — not the row for the **current org**. In single-tenant Finance stacks this is fine (only one row). But if a Finance instance ever hosts multiple tenants (sub-orgs), all orgs would be measured against the first one's limit.

---

### BUG-04 — Provisioning Window: Seed-Before-Sync Grants Perpetual Access

`SeedTenantLicenseOnBuilt` fires on `organization.built` event and inserts:
```
status: 'active', isPerpetual: true, expiresAt: null
```
This is immediately overwritten by `syncFinanceLicenseForStockixTenant`. But if that sync fails (network hiccup, Finance container not yet healthy, `financeTenantId` not yet populated), the Finance tenant retains **perpetual, uncapped access** until the next successful sync.

---

### BUG-05 — No Atomic Upgrade/Downgrade

Upgrading a tenant requires: revoke → generate → assign. Between revoke and the new license becoming active, the tenant's Finance app receives `status: "suspended"` (since `mapStockixLicenseStatus(null)` returns `"suspended"`). This causes a brief access denial to the tenant's users during what is a routine plan change.

---

### RISK-01 — Finance License Cache Not Cluster-Aware

`LicenseGuardMiddleware` uses a process-local `Map<tenantId, { effectiveStatus, cachedAt }>`. When the control plane pushes a sync, only the Finance instance that handled the internal sync call clears its cache. Other Finance container replicas (rolling deploy, multiple instances) retain stale cached status until TTL expires.

---

### RISK-02 — `getActiveLicenseForTenant` Returns Revoked Row

The function returns a revoked license as a fallback when no active/expired row exists. This is intentional for propagating `revoked` status to Finance. But the function is named `getActiveLicenseForTenant`, which is misleading — callers must check the `.status` field and not assume the returned row represents active access.

---

### RISK-03 — License Key Not Stored in Finance

The `STKX-XXXX-XXXX-XXXX` key lives only in the control plane. Finance receives everything except the key in the sync payload. Displaying the license key to Finance users (e.g., for support reference) currently requires a cross-service call or a schema change to include it in the sync.

---

### RISK-04 — Offline Token Does Not Reflect Suspension in Real Time

POS desktops receive a 30-day offline JWT at activation. A tenant that is suspended or revoked after that point will continue to operate offline until the token expires. This is an architectural trade-off (offline-first POS), but there is no documented mechanism to force token invalidation before expiry.

---

### RISK-05 — LicenseGuardMiddleware `path.includes()` Bypass

```ts
const PUBLIC_PATH_PREFIXES = ['/api/internal', '/api/auth', ...];
if (PUBLIC_PATH_PREFIXES.some((prefix) => path.includes(prefix))) {
  return next();
}
```

`path.includes('/api/auth')` is a substring match. A crafted query string like `GET /api/data?redirect=/api/auth/callback` would match and bypass the guard. `path.startsWith(prefix)` is safer.

---

### RISK-06 — Lemon Squeezy Webhooks Have No Tenant Context

`LemonSqueezyWebhooks.processWebhookEvent()` reads `userId` and `tenantId` from `eventBody.meta.custom_data`, but these are only used for logging. The actual subscription operations (`createNewSubscription`, `cancelSubscription`, etc.) are called without a tenant scope, operating on whatever the current NestJS DI context tenant is. Since `BILLING_ENABLED=false`, this is dormant risk — but if billing is re-enabled, the webhook handler needs tenant scoping.

---

## 6. Recommendations

| Priority | Recommendation |
|----------|---------------|
| High | Align grace period defaults: standardize on `DEFAULT_GRACE_PERIOD_DAYS = 7` across `license-constants.ts`, `SeedTenantLicenseOnBuilt`, `InternalLicenseController` fallback, and `LicenseService` fallback. |
| High | Fix `LicenseGuardMiddleware` path bypass: change `path.includes(prefix)` to `path.startsWith(prefix)`. |
| High | Fix `assertCanCreateOrganization()`: query by current tenant id, not first row globally. |
| Medium | Add `licenseKey` to the Finance sync payload and `tenant_licenses` table so Finance can display the key in UI without a cross-service call. |
| Medium | Implement an atomic plan change operation: generate new license → assign → expire (not revoke) old one in a single transaction, eliminating the suspended-between window (BUG-05). |
| Medium | Auto-propagate plan limit changes to active licenses: when `plans.maxUsers/maxActivations/maxOrganizations` is updated, enqueue a backfill job to update all `licenses` rows where `planSlug = updated.slug`. |
| Medium | Replace seed-before-sync with seed-after-sync: `SeedTenantLicenseOnBuilt` should insert with `status: "suspended"` and wait for the control plane sync to set the real status. |
| Low | Change `getActiveLicenseForTenant` to `resolveTenantLicense` (rename for clarity) and add JSDoc noting it can return non-active rows. |
| Low | Investigate cluster-aware cache invalidation for Finance: use Redis pub/sub or simply reduce the cache TTL to acceptable staleness (currently checking `getLicenseCacheTtlMs()` — verify the value). |
| Low | Remove or scope the Lemon Squeezy webhook tenant context before re-enabling billing. |

---

## 7. Read-Only License Section in Finance Preferences

### Feasibility Assessment

Adding a read-only License section to the Finance Preferences area is straightforward. Most required data is already available.

### Data Available Without Schema Changes

From `DashboardService.getBootMeta()` (already in every page load):
- `licenseStatus` — `active` / `expired` / `grace` / `suspended` / `revoked`
- `licenseExpiresAt` — ISO timestamp or null
- `licenseGracePeriodEndsAt` — computed end of grace period

From `LicenseService.findByTenantId()` (one additional DB query):
- `planSlug` — the plan identifier (e.g., `starter`, `growth`)
- `isPerpetual` — whether the license is perpetual
- `maxUsers`, `maxOrganizations`, `maxActivations` — plan limits
- `validFrom` — license start date
- `featureFlags` — any feature overrides

### Data Requiring Schema Change

- **License key** (`STKX-XXXX-XXXX-XXXX`) — not currently synced to Finance. Requires adding `licenseKey varchar(64)` to `tenant_licenses` and including it in `FinanceLicenseSyncPayload`.

### Proposed API Endpoint (Finance)

```
GET /api/preferences/license
→ returns from tenant_licenses WHERE tenantId = current tenant
→ no authentication elevation required — read-only, tenant-scoped
```

Response shape:
```json
{
  "planSlug": "growth",
  "planDisplayName": "Growth",
  "status": "active",
  "isPerpetual": false,
  "validFrom": "2025-01-01T00:00:00Z",
  "expiresAt": "2026-01-01T00:00:00Z",
  "gracePeriodDays": 7,
  "gracePeriodEndsAt": "2026-01-08T00:00:00Z",
  "maxUsers": 25,
  "maxOrganizations": 3,
  "maxActivations": 5,
  "licenseKey": "STKX-XXXX-XXXX-XXXX"
}
```

### RBAC Design

This section must be **strictly read-only for all roles** (admin, manager, accountant, cashier — every role). Implementation options:

1. **No guard needed** — since it is a GET endpoint returning tenant-scoped data that is already accessible to authenticated users (the same data is in boot meta). The `LicenseGuardMiddleware` will still apply (a suspended tenant won't see this), but no additional RBAC check is needed.
2. **Explicitly exclude from `PermissionGuard`** — since `PermissionGuard` is opt-in per controller, simply do not add `@RequirePermission` to this route.
3. **No mutations exposed** — the section displays data only; no edit fields, no save buttons.

### UX Placement

- Location: `Preferences → License` (new tab/section, beneath existing preferences)
- Visible to all authenticated users in the organization
- No edit controls
- Display a status badge (color-coded: green=active, amber=grace, red=expired/revoked/suspended)
- Show days remaining if non-perpetual and active/grace
- If `licenseKey` is available, show masked key (e.g., `STKX-****-****-ABCD`) with a copy button
- If perpetual: show "Perpetual License" with no expiry date

This requires:
1. Adding `licenseKey` to the Finance sync payload (control plane change)
2. Adding `licenseKey` column to `tenant_licenses` (Finance MySQL migration)
3. A new `GET /api/preferences/license` endpoint in Finance (or reuse boot meta + one extra field)
4. A new React component in the Finance SPA Preferences section
