# License System Audit

**Date:** 2026-05-25  
**Scope:** Plans schema, licenses schema, API, Finance/POS enforcement, expiry worker, dashboard UI, provision auto-license  
**References:** `docs/PROVISIONING_REFERENCE.md`, `docs/FUNCTIONAL_AUDIT.md`, `plan&license.md`

---

## Executive Summary

The plans & license stack is **largely implemented and production-viable for accounting tenants**. Schema, API, Finance sync, dashboard CRUD, and provision auto-license are in place. Several gaps from earlier audits (**G2, G3, G10**, UI toggles) are **already fixed in code** before this pass.

This pass **fixed three remaining behavioral gaps**: API validation for dated licenses without expiry, 30-day warning window (was incorrectly using grace period), and POS suspend timing (now deferred until after grace).

**Production ready:** **YES** — Phases 0–11 complete: single active license per tenant, POS window sync, Finance LicenseGuard, suspend/reactivate API, module validation, maxUsers snapshot, grace constants unified, dashboard extend UX, tenant license column, email history audit.

---

## Schema Status (post-repair)

### Licenses Table — updates

| Field | Exists | Notes |
|-------|--------|-------|
| `maxUsers` | ✅ | Migration `0039_licenses_max_users.sql`; snapshot on generate/assign |
| `status` check | ✅ | Migration `0040_licenses_status_check.sql` includes `suspended` |
| One active per tenant | ✅ | Partial unique index `0038_one_active_license_per_tenant.sql` |

---

## Gaps Fixed In Repair Pass (Phases 0–11)

| Gap | Status |
|-----|--------|
| POS window sync on extend/revoke/assign | **FIXED** |
| Single active license per tenant (409) | **FIXED** |
| Finance LicenseGuard default-deny + cache invalidation | **FIXED** |
| Extend UX (shared dialog on tenant + license detail) | **FIXED** |
| `DEFAULT_GRACE_PERIOD_DAYS=7` unified | **FIXED** |
| `maxUsers` on license row + Finance sync preference | **FIXED** |
| Module ⊆ tenant validation on assign/generate | **FIXED** |
| POST `/licenses/:id/suspend` + `/reactivate` | **FIXED** |
| Tenant list license status column | **FIXED** |
| Email sends recorded in `license_history` | **FIXED** |

---

## Still Outstanding

- [ ] Staging E2E checklist (manual): extend → Finance + POS; expire → grace → POS suspend; suspend/reactivate round-trip

---

## Production Ready: **YES**

| Layer | Verdict |
|-------|---------|
| Schema + migrations | **YES** |
| License API + RBAC | **YES** |
| Finance enforcement | **YES** |
| Expiry worker + email + history | **YES** |
| Dashboard ops UI | **YES** |
| POS ↔ Stockix license coupling | **YES** |
| Multi-license policy | **YES** — one active license per tenant (409 on duplicate) |

---

## Files Touched Repair Pass

- `apps/api/src/pos-license-sync.ts`, `license-http.ts`, `license-utils.ts`, `license-constants.ts`
- `apps/api/src/finance-license.client.ts`, `license-expire-followup.ts`, `mail/send.ts`
- `services/stockix-finance/.../LicenseGuard.*`, `SyncLicense.service.ts`
- `packages/db/drizzle/0038_*.sql`, `0039_*.sql`, `0040_*.sql`
- `apps/dashboard/components/license-extend-dialog.tsx`, `tenant-list.tsx`
- `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx`, `licenses/[id]/page.tsx`
- `apps/api/tests/license-*.test.ts` (extend, single-active, suspend, modules)

---

## Original Audit (pre-repair) — retained for reference

**Production ready (original):** **PARTIAL YES**

---

## Schema Status

### Plans Table (`packages/db/src/schema.ts`)

| Field | Exists | Default | Notes |
|-------|--------|---------|-------|
| `name` | ✅ | — | Required text |
| `slug` | ✅ | — | Unique index |
| `description` | ✅ | null | Optional |
| `maxOrganizations` | ✅ | `1` | `-1` = unlimited (dashboard + API) |
| `maxActivations` | ✅ | `1` | Copied to license on generate/assign |
| `maxUsers` | ✅ | `999` | Migration `0035_plans_max_users.sql` |
| `priceMonthly` | ✅ | null | Cents |
| `priceAnnually` | ✅ | null | Cents |
| `currency` | ✅ | `USD` | |
| `billingInterval` | ✅ | null | monthly / annually / one_time / custom |
| `isActive` | ✅ | `true` | Deactivate blocked if active licenses |
| `isPublic` | ✅ | `false` | |
| `sortOrder` | ✅ | `0` | |
| `features` | ✅ | null | JSON string array |

**Not on plans:** module list (modules live on license + tenant rows only).

### Licenses Table

| Field | Exists | Notes |
|-------|--------|-------|
| `licenseKey` | ✅ | `STKX-XXXX-XXXX-XXXX` (`license-utils.ts`) |
| `product` | ✅ | `platform` \| `pos_desktop` \| `bundle` |
| `modules` | ✅ | JSON array, default `["accounting"]` |
| `planSlug` | ✅ | default `starter` |
| `tenantId` | ✅ | Nullable FK, `onDelete: set null` |
| `status` | ✅ | Text: `unassigned`, `active`, `expired`, `revoked` (no DB enum) |
| `isPerpetual` | ✅ | default `false`; generate default `true` |
| `expiresAt` | ✅ | Nullable; null when perpetual |
| `validFrom` | ✅ | Nullable |
| `gracePeriodDays` | ✅ | default `7` |
| `maxOrganizations` | ✅ | Copied from plan on generate |
| `maxActivations` | ✅ | Copied from plan (override allowed on generate) |
| `maxUsers` | ❌ | **Not on license row** — sourced from plan at Finance sync |
| `activationCount` | ✅ | Decremented on revoke |
| `revokedAt` / `revokedById` / `revokeReason` | ✅ | |
| `suspendedAt` | ❌ | Suspension via **tenant** status → Finance `suspended` |
| `license_history` | ✅ | Full audit trail |

### Migrations

| File | Purpose |
|------|---------|
| `0017_plans_org_activation_defaults.sql` | Plan limit defaults |
| `0025_plans_billing_fields.sql` | Pricing fields |
| `0026_license_history.sql` | History table |
| `0028_license_modules.sql` | `licenses.modules` |
| `0035_plans_max_users.sql` | `plans.max_users` |

---

## Unlimited vs Dated License

| Scenario | Behavior | Correct? |
|----------|----------|----------|
| `isPerpetual=true` | Expiry worker skips (`eq(isPerpetual, false)` in worker) | ✅ |
| `isPerpetual=false` + `expiresAt=null` | **Was allowed at API** — **fixed** with Zod refine on generate | ✅ (after fix) |
| `expiresAt` reached, status → `expired` | Worker flips at expiry (not after grace) | ✅ (status label; grace computed from dates) |
| Expired + grace period | Finance: reads OK, writes blocked (`402`); `LicenseBanner` on grace | ✅ |
| After grace period | Finance: full block; POS suspend after grace (this pass) | ✅ (after fix) |
| Perpetual provision auto-license | `isPerpetual: true`, `expiresAt: null` | ✅ |

**Grace period default:** 7 days on license row; Finance sync fallback `30` when license missing (`finance-license.client.ts:214`) — minor inconsistency only when no license row.

---

## License API

### Generate (`POST /licenses/generate`)

| Default | Value |
|---------|-------|
| `modules` | `["accounting"]` |
| `isPerpetual` | `true` |
| `expiresAt` | `null` when perpetual |
| `gracePeriodDays` | `7` |
| `maxOrganizations` | From plan via `getPlanLimits()` |
| `maxActivations` | From plan unless overridden in body |
| Plan | **Required**, must be `isActive` |

**RBAC:** `super_admin` (`middleware/rbac.ts`)

### Assign (`POST /licenses/:id/assign`)

- Copies `maxOrganizations` / `maxActivations` from plan when license row still has sentinel `1`
- Does **not** copy modules (set at generate)
- Does **not** block if tenant already has another active license (**H2 — still open**)
- Triggers Finance sync

### Extend / Revoke

| Action | Finance sync | POS | Activations |
|--------|-------------|-----|-------------|
| Extend | ✅ async | ❌ does not update org license window | — |
| Revoke | ✅ → `revoked` | ✅ suspend org | ✅ deactivate all active |

**Extend RBAC:** `billing_manager`+

### `getPlanLimits()`

Returns `{ maxOrganizations, maxActivations, maxUsers }`; on miss: `{1, 1, 999}`. Does **not** return `features`.

### Finance sync payload (`finance-license.client.ts`)

| Stockix | Finance `tenant_licenses` |
|---------|---------------------------|
| `plan.maxUsers` | `maxUsers` |
| `license/plan maxOrganizations` | `maxOrganizations` |
| `license/plan maxActivations` | `maxActivations` (reference) |
| Status + dates + grace | `status`, `expiresAt`, `gracePeriodDays`, `isPerpetual` |
| Modules | Not synced (tenant modules separate) |

Sentinel rule: license `maxOrganizations === 1` upgraded from plan when plan allows more.

---

## Enforcement

| System | Status blocks access | maxOrg enforced | maxUsers enforced |
|--------|---------------------|-----------------|-------------------|
| Finance LicenseGuard | ✅ revoked/suspended/expired/grace-writes | ✅ `License.service.assertCanCreateOrganization` | ✅ invite + internal users |
| Finance HTTP codes | ✅ `402 PAYMENT_REQUIRED` | ✅ | ✅ `USER_LIMIT_REACHED` |
| Control plane org create | ✅ `LICENSE_EXPIRED` / `NO_ACTIVE_LICENSE` / `PLAN_LIMIT_REACHED` | ✅ `plan-limits.ts` | N/A |
| POS org window | ✅ `requireActiveOrganization` | N/A (entitlements separate) | Org entitlements default 25 |
| POS vs Stockix license | ❌ Decoupled — org `licenseEndsAt` set at bootstrap, not on extend | — | — |

**Finance UI:** `LicenseBanner` (grace), `SuspendedOverlay` (suspended/revoked/expired).

**POS `LICENSE_ENFORCEMENT_MODE`:** default `enforce`; `shadow` logs only.

**LicenseGuard gap:** Requests without `organization-id` or without license row pass through (documented tech debt).

---

## Expiry System

| Item | Detail |
|------|--------|
| Scan interval | Every **5 minutes** when worker idle (`LICENSE_EXPIRE_SCAN_INTERVAL_MS`) |
| Perpetual skip | ✅ |
| Finance sync on expiry | ✅ `triggerFinanceLicenseSync` |
| Expired email | ✅ tenant `adminEmail`; idempotency key `license-expired/{tenantId}/{date}` |
| 30-day warning | ✅ **Fixed** — window now 30 days (was `gracePeriodDays`) |
| Warning idempotency | ✅ `license-expiring/{tenantId}/{expiryDay}` |
| POS suspend | ✅ **Fixed** — only after grace ends (or grace=0 at expiry) |

Worker sets `status=expired` at `expiresAt` (not after grace). Finance and control-plane eligibility treat expired+within-grace as still usable for reads / org limits via date math.

---

## Dashboard UI

| Feature | Exists | Complete |
|---------|--------|----------|
| Plans CRUD + maxUsers | ✅ | ✅ |
| Modules selector in generate | ✅ | ✅ |
| Perpetual vs fixed term toggle | ✅ | ✅ |
| Grace period in generate | ✅ | ✅ (labeled offline grace) |
| maxUsers in plans form | ✅ | ✅ |
| Tenant detail expiry warning | ✅ | ✅ (this pass) |
| Tenant detail license modules | ✅ | ✅ (this pass) |
| Extend from tenant detail | ❌ | On `/licenses/[id]` only |
| Upgrade/downgrade UX | ❌ | Manual extend + assign |

---

## Provision Auto-License

When provision completes (`apps/api/src/index.ts` ~1470–1498):

- Skipped if active license exists or `assignExistingLicenseId` used
- `isPerpetual: true`, `gracePeriodDays: 7`
- `modules` = tenant modules JSON
- `maxOrganizations` / `maxActivations` from `getPlanLimits(planSlug)`
- Finance sync on complete via `syncFinanceLicenseForStockixTenant`
- Worker provision also syncs plan limits (`provision-runtime.ts:1331–1342`)

**Default plan slug:** from provision payload; fallback `starter` in schema, `owner-managed` in Finance sync when missing.

---

## Gaps Fixed In This Pass

| Gap | Status |
|-----|--------|
| G2 `maxUsers` on plans | **ALREADY FIXED** (schema + UI + sync) |
| G3 `maxOrg` sync on provision | **ALREADY FIXED** (`provision-runtime.ts`) |
| G10 generate accounting-only | **ALREADY FIXED** (modules UI) |
| Unlimited toggle in UI | **ALREADY FIXED** (perpetual/fixed term) |
| Plan limits on auto-license | **ALREADY FIXED** |
| Dated license without expiry | **FIXED** — Zod refine on generate |
| 30-day warning window | **FIXED** — `processExpiringSoonWarnings` |
| POS suspend during grace | **FIXED** — defer until grace ends |

---

## Still Outstanding

- [ ] **H2** — Multiple active licenses per tenant; `getActiveLicenseForTenant` priority pick only
- [ ] **G9** — POS org `licenseEndsAt` not updated on Stockix extend/revoke lifecycle
- [ ] **Extend → POS window** — extend does not push new expiry to POS org
- [ ] **Assign duplicate** — no guard when tenant already licensed
- [ ] **Suspend license API** — no dedicated endpoint; suspension via tenant status
- [ ] **maxUsers on license row** — optional future: snapshot plan maxUsers on license for drift detection
- [ ] **License history for emails** — idempotency via mail keys only, not `license_history` (acceptable)
- [ ] **GET /plans** requires auth (not public) — RBAC `read_only`; PROVISIONING_REFERENCE H3 may be stale

---

## Production Ready: **PARTIAL YES**

| Layer | Verdict |
|-------|---------|
| Schema + migrations | **YES** |
| License API + RBAC | **YES** |
| Finance enforcement | **YES** (with org-id guard caveat) |
| Expiry worker + email | **YES** (after this pass) |
| Dashboard ops UI | **YES** |
| POS ↔ Stockix license coupling | **NO** — separate org window |
| Multi-license policy | **NO** — needs product decision |

---

## Files Touched This Pass

- `plan&license.md` — audit runbook
- `LICENSE_SYSTEM_AUDIT.md` — this document
- `apps/api/src/license-http.ts` — validate `expiresAt` when not perpetual
- `apps/api/src/license-expire-followup.ts` — 30-day warning + post-grace POS suspend
- `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` — expiry warning + license modules
