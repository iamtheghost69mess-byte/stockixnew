# POS ↔ Finance Integration — Implementation Plan

**Source Audit:** `missingposfinancerepairplan.md`  
**Date:** 2026-06-24  
**Branch:** `architecture2`  
**Scope:** 7 issues across 4 services — POS backend, POS frontend, control-plane API, Finance service

---

## Overview

This plan resolves all 7 issues identified in the deep audit. Issues are delivered in 3 phases ordered by dependency and blast-radius risk. No phase may begin before the previous phase's acceptance criteria are verified in a staging environment.

**Total estimated effort:** 8.5 engineer-days + 2 days QA  
**Services touched:** `apps/pos-backend`, `apps/pos-frontend2`, `apps/api`, `services/stockix-finance`

---

## Dependency Graph

```
ISSUE-001
  └─ ISSUE-002 (needs relay flag in session)
  └─ ISSUE-003 (independent of 001, but test plan needs 001 to verify 403 message)
  └─ ISSUE-004 (must ship 001 before 004 is verifiable end-to-end)
       └─ ISSUE-005 (financeUrl stored during add_module completion)
ISSUE-006  (standalone — no dependencies)
ISSUE-007  (Finance service only — no cross-service dependencies)
```

---

## Phase 1 — Critical Security Fixes (P0)

**Includes:** ISSUE-001, ISSUE-003  
**Goal:** Stop double-posting in relay mode and expose relay flag to the frontend.  
**Deploy sequence:** ISSUE-001 first, then ISSUE-003. Both must be deployed together in the same release; deploying ISSUE-003 alone (without 001) blocks all write routes for direct-mode orgs if the DB query fails.

---

### ISSUE-001 — Session endpoint does not return relay mode flag

**Severity:** Critical  
**Effort:** 0.5 day

#### Root cause

`getUserProfilePayload` in `apps/pos-backend/controllers/userController.js:18` populates the `organization` subdocument with only `"name slug"`. The `accountingRelayMode` boolean on `Organization` is never sent to the client.

#### Exact change

**File:** `apps/pos-backend/controllers/userController.js`

Line 15–18 currently reads:
```js
const user = await User.findById(userFromReq._id)
  .populate("location", "name code waiterCanPrintReceipt")
  .populate("locations", "name code waiterCanPrintReceipt")
  .populate("organization", "name slug");
```

Change the last `.populate` to:
```js
  .populate("organization", "name slug accountingRelayMode financeUrl");
```

`financeUrl` is added at the same time because ISSUE-005 will add that field and this populate string only needs changing once.

#### No other files change in this issue.

#### Acceptance criteria

1. `GET /api/session` response: `data.organization.accountingRelayMode` is `false` for a standard org.
2. Set `accountingRelayMode: true` directly in MongoDB for a test org. Re-call `GET /api/session` as a member of that org → `data.organization.accountingRelayMode` is `true`.
3. `data.organization` still contains `name` and `slug` (no regression).
4. `data.organization.financeUrl` is present (empty string until ISSUE-005 populates it).

#### Rollback

Revert `.populate("organization", ...)` back to `"name slug"`. No database changes.

---

### ISSUE-003 — `requireAccountingDirectMode` middleware covers only 9 of 30+ write routes

**Severity:** Critical  
**Effort:** 0.5 day

#### Root cause

In `apps/pos-backend/routes/accountingRoute.js:20`, `requireAccountingDirectMode` is injected only into the `glWr` middleware stack. All other write stacks (`wr`, `arWr`, `apWr`, `bankWr`, `periodWr`, `expensesWr`, `expensesApprove`, `approvalsWr`) do not include it. This allows 20+ GL-mutating routes to execute even when an org has `accountingRelayMode: true`, causing double-posting against Finance.

#### Exact change

**File:** `apps/pos-backend/routes/accountingRoute.js`

Lines 12–25 currently define stacks as:
```js
const rd        = [...authedTenantLocation, ac.requireAccountingRead];
const wr        = [...authedTenantLocation, ac.requireAccountingWrite];
const arRd      = [...authedTenantLocation, ac.requireArRead];
const arWr      = [...authedTenantLocation, ac.requireArWrite];
const apRd      = [...authedTenantLocation, ac.requireApRead];
const apWr      = [...authedTenantLocation, ac.requireApWrite];
const glRd      = [...authedTenantLocation, ac.requireGlRead];
const glWr      = [...authedTenantLocation, requireAccountingDirectMode, ac.requireGlWrite];
const bankRd    = [...authedTenantLocation, ac.requireBankRead];
const bankWr    = [...authedTenantLocation, ac.requireBankWrite];
const periodWr  = [...authedTenantLocation, ac.requirePeriodsWrite];
const expensesRd      = [...authedTenantLocation, ac.requireExpensesRead];
const expensesWr      = [...authedTenantLocation, ac.requireExpensesWrite];
const expensesApprove = [...authedTenantLocation, ac.requireExpensesApprove];
const approvalsRd     = [...authedTenantLocation, ac.requireApprovalsRead];
const approvalsWr     = [...authedTenantLocation, ac.requireApprovalsWrite];
const consolidatedRd  = [...authedTenantLocation, ac.requireConsolidatedRead];
```

Replace with:
```js
const rd             = [...authedTenantLocation, ac.requireAccountingRead];
const wr             = [...authedTenantLocation, requireAccountingDirectMode, ac.requireAccountingWrite];
const arRd           = [...authedTenantLocation, ac.requireArRead];
const arWr           = [...authedTenantLocation, requireAccountingDirectMode, ac.requireArWrite];
const apRd           = [...authedTenantLocation, ac.requireApRead];
const apWr           = [...authedTenantLocation, requireAccountingDirectMode, ac.requireApWrite];
const glRd           = [...authedTenantLocation, ac.requireGlRead];
const glWr           = [...authedTenantLocation, requireAccountingDirectMode, ac.requireGlWrite];
const bankRd         = [...authedTenantLocation, ac.requireBankRead];
const bankWr         = [...authedTenantLocation, requireAccountingDirectMode, ac.requireBankWrite];
const periodWr       = [...authedTenantLocation, requireAccountingDirectMode, ac.requirePeriodsWrite];
const expensesRd     = [...authedTenantLocation, ac.requireExpensesRead];
const expensesWr     = [...authedTenantLocation, requireAccountingDirectMode, ac.requireExpensesWrite];
const expensesApprove = [...authedTenantLocation, requireAccountingDirectMode, ac.requireExpensesApprove];
const approvalsRd    = [...authedTenantLocation, ac.requireApprovalsRead];
const approvalsWr    = [...authedTenantLocation, requireAccountingDirectMode, ac.requireApprovalsWrite];
const consolidatedRd = [...authedTenantLocation, ac.requireConsolidatedRead];
```

#### Three routes that must use the bare `wr` stack WITHOUT relay protection

These are idempotent acknowledgements — they should work in relay mode:

| Route | Why exempt |
|-------|-----------|
| `POST /accounting/sync/ack` | Acknowledges a Finance sync event. Needed in relay mode. |
| `POST /accounting/notifications/all/read` | Marks notifications read. No GL effect. |
| `POST /accounting/notifications/:id/read` | Same. |

These three routes already use the `wr` stack. After the change above, `wr` will include `requireAccountingDirectMode`. To preserve the exemptions, define a separate bare stack for them:

Add after the stack definitions (after line 27):
```js
// Stacks for non-GL operations that must remain accessible in relay mode:
const wrUnguarded = [...authedTenantLocation, ac.requireAccountingWrite];
```

Change the three route registrations:
```js
router.post("/sync/ack",                     ...wrUnguarded, ctrl.acknowledgeSync);
router.post("/notifications/all/read",       ...wrUnguarded, notificationsCtrl.markAllBackofficeNotificationsRead);
router.post("/notifications/:id/read",       ...wrUnguarded, notificationsCtrl.markBackofficeNotificationRead);
```

#### Performance note

Every write route now hits one additional MongoDB `Organization.findById(...).select("accountingRelayMode")` query. Mitigate by caching the relay flag on `req.tenantOrg` inside `attachTenantOrganization`:

**File:** `apps/pos-backend/middlewares/attachTenantOrganization.js`

After the existing `req.tenantOrganizationId = ...` assignment, add:
```js
req.tenantOrg = null; // populated lazily by requireAccountingDirectMode
```

**File:** `apps/pos-backend/middlewares/requireAccountingDirectMode.js`

Replace the `Organization.findById` call with a request-scoped cache:
```js
async function requireAccountingDirectMode(req, res, next) {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) return next(createHttpError(403, "Organization is required."));

    // Use request-scoped cache populated by attachTenantOrganization (if available).
    let relayMode;
    if (req.tenantOrg != null) {
      relayMode = req.tenantOrg.accountingRelayMode;
    } else {
      const org = await Organization.findById(orgId).select("accountingRelayMode").lean();
      if (!org) return next(createHttpError(403, "Organization not found."));
      relayMode = org.accountingRelayMode;
    }

    if (relayMode) {
      return next(
        createHttpError(
          403,
          "GL writes are disabled: this organization uses Finance relay mode. Use the Finance module to post accounting entries.",
        ),
      );
    }
    next();
  } catch (e) {
    next(e);
  }
}
```

This means the additional DB query is paid at most once per request, not once per middleware invocation.

#### Acceptance criteria

1. Enable `accountingRelayMode: true` on a test org.
2. Each of the following returns HTTP 403 with message containing `"Finance relay mode"`:
   - `POST /api/accounting/journal-entries`
   - `POST /api/accounting/invoices/from-order/:orderId`
   - `POST /api/accounting/vendor-bills/from-po`
   - `POST /api/accounting/credit-notes`
   - `POST /api/accounting/sessions/open`
   - `POST /api/accounting/bank/match`
   - `POST /api/accounting/periods/close`
   - `POST /api/accounting/budgets`
   - `POST /api/accounting/expense-reports`
3. Each of the following returns HTTP 2xx (not blocked):
   - `GET /api/accounting/accounts`
   - `GET /api/accounting/invoices`
   - `POST /api/accounting/sync/ack`
   - `POST /api/accounting/notifications/all/read`
4. Disable relay mode on the same org → all write routes return 2xx.
5. Direct-mode orgs (relay off): no observable latency change beyond the single org lookup (< 5ms on warm MongoDB connection).

#### Rollback

Revert `accountingRoute.js` to use original stacks. Revert `requireAccountingDirectMode.js` to original. Revert `attachTenantOrganization.js` if caching was added.

---

## Phase 2 — UX & Provisioning Automation (P1)

**Includes:** ISSUE-002, ISSUE-004  
**Prerequisite:** Phase 1 deployed and verified.

---

### ISSUE-002 — Sidebar does not hide accounting items in relay mode

**Severity:** Critical (UX)  
**Effort:** 1.5 days

#### Root cause

`filterSidebarGroupsByPermissions` (`apps/pos-frontend2/src/lib/filter-sidebar-groups.ts`) only inspects RBAC permission strings. It has no knowledge of `accountingRelayMode`. The sidebar definition (`sidebar-items.ts`) does not tag items as relay-sensitive. The session profile payload (fixed in ISSUE-001) now carries the flag, but no code reads it.

#### Change 1 — Add `requiresDirectMode` property to the nav item type

**File:** `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts`

The file currently exports `NavGroup` from `@restaurant-pos/ui/shell`. Locate the `export type { NavGroup, NavMainItem, NavSubItem }` re-export line and add:

```ts
export type { NavGroup, NavMainItem, NavSubItem } from "@restaurant-pos/ui/shell";
```

The `NavMainItem` type lives in the shell package. Rather than modifying the shared package, declare a local augmentation. Add at the top of `sidebar-items.ts`, before the first `export`:

```ts
declare module "@restaurant-pos/ui/shell" {
  interface NavMainItem {
    requiresDirectMode?: boolean;
  }
}
```

This is a TypeScript declaration merge — it extends the upstream type without forking the package.

#### Change 2 — Tag relay-sensitive items in `sidebarItems`

The following items in the `sidebarItems` array in `sidebar-items.ts` must have `requiresDirectMode: true` added. These are the items whose underlying routes are now blocked in relay mode (per ISSUE-003) or whose presence in relay mode serves no purpose:

**Group id 8 — Accounting Core:**
- `Chart of accounts` → `requiresDirectMode: true`
- `Entries` (journal ledger) → `requiresDirectMode: true`
- `GL settings` → `requiresDirectMode: true`
- `Register sessions` → `requiresDirectMode: true`
- `Finance bridge` → leave visible (it is the setup page for relay mode itself)
- `Overview`, `Trial balance`, `Profit & Loss`, `Fiscal periods` → keep visible (read-only; useful in both modes)

**Group id 17 — Accounting Extended:**
- `Balance sheet` → keep visible (read)
- `Cash flow` → keep visible (read)
- `Budget vs actual` → keep visible (read)
- `Budgets` → `requiresDirectMode: true`
- `Exchange rates` → keep visible (FX rate view — no GL writes)
- `Recurring journals` → `requiresDirectMode: true`
- `Invoices (AR)` → `requiresDirectMode: true`
- `Recurring invoices` → `requiresDirectMode: true`
- `AR aging` → keep visible (read)
- `Customer statement` → keep visible (read)
- `Supplier statement` → keep visible (read)
- `Credit notes` → `requiresDirectMode: true`
- `Vendor bills (AP)` → `requiresDirectMode: true`
- `Expense reports` → `requiresDirectMode: true`
- `Approvals inbox` → `requiresDirectMode: true`
- `Consolidated reports` → keep visible (read)
- `Audit log` → keep visible (read)
- `GL exports` → keep visible (read; useful for Finance import)
- `Gift cards` → `requiresDirectMode: true`
- `Order GL tools` → `requiresDirectMode: true`
- `Bank (beta)` → `requiresDirectMode: true`

**Group id 1 — Dashboards:**
- `Finance` → change from static `url: "/dashboard/finance"` to a dynamic item that links to the Finance application URL. Mark `requiresDirectMode: false` (always show in relay mode as it replaces the hidden items). Implementation: this item is made dynamic in the sidebar component (Change 4 below); leave it in the definition without `requiresDirectMode`.

#### Change 3 — Update filter function to accept and apply relay mode

**File:** `apps/pos-frontend2/src/lib/filter-sidebar-groups.ts`

Current signature:
```ts
export function filterSidebarGroupsByPermissions(
  groups: readonly NavGroup[],
  permissions: readonly string[],
): NavGroup[]
```

New signature:
```ts
export function filterSidebarGroupsByPermissions(
  groups: readonly NavGroup[],
  permissions: readonly string[],
  relayMode?: boolean,
): NavGroup[]
```

Add one additional filter predicate inside the `.map` on items:
```ts
.map((item) => {
  // Existing permission check:
  if (item.permission && !posCan([...permissions], item.permission)) return null;
  // New relay mode check:
  if (relayMode && (item as { requiresDirectMode?: boolean }).requiresDirectMode) return null;
  // Existing subItems handling:
  if (item.subItems?.length) { ... }
  return item;
})
```

#### Change 4 — Pass relay mode from the auth store into the sidebar

**File:** `apps/pos-frontend2/src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx`

Current code reads `user?.permissions`. Add:
```ts
const relayMode = user?.organization?.accountingRelayMode ?? false;
const financeUrl = (user?.organization as { financeUrl?: string })?.financeUrl ?? "";
```

Pass `relayMode` to the filter call:
```ts
const filteredGroups = filterSidebarGroupsByPermissions(navSource, permissions, relayMode);
```

#### Change 5 — Replace Finance dashboard link when relay mode is active

Still in `app-sidebar.tsx`, after computing `filteredGroups`, inject a dynamic Finance link when `relayMode` is true and `financeUrl` is set:

```ts
const groupsWithFinanceLink = relayMode && financeUrl
  ? filteredGroups.map((group) => {
      if (group.id !== 1) return group;
      return {
        ...group,
        items: group.items.map((item) =>
          item.title === "Finance"
            ? { ...item, url: financeUrl, external: true }
            : item
        ),
      };
    })
  : filteredGroups;
```

Pass `groupsWithFinanceLink` instead of `filteredGroups` to `<DashboardAppSidebar groups={...} />`.

#### Change 6 — Type-guard the `PosAuthUser` type for the new org fields

**File:** `apps/pos-frontend2/src/lib/pos-auth-user.ts` (locate the `PosAuthUser` type definition)

Add to the `organization` sub-type:
```ts
organization?: {
  name?: string;
  slug?: string;
  accountingRelayMode?: boolean;
  financeUrl?: string;
};
```

#### Acceptance criteria

1. Log in as a user whose org has `accountingRelayMode: true`:
   - Sidebar groups `Accounting — Core` and `Accounting — Extended` show only read-only items (Overview, Trial balance, P&L, Fiscal periods, Balance sheet, Cash flow, AR aging, Customer/Supplier statements, Consolidated reports, Audit log, GL exports, Finance bridge).
   - All `requiresDirectMode: true` items are absent.
   - The Finance dashboard link in group 1 points to the external Finance URL (not `/dashboard/finance`).
2. Log in as a user whose org has `accountingRelayMode: false`:
   - All items visible as before.
   - Finance link points to `/dashboard/finance`.
3. Toggling relay mode in the database and re-logging in reflects the change.
4. RBAC permission filtering still works correctly in both modes (e.g. hostess user still sees only floor/customers).
5. No TypeScript compilation errors on the `pos-frontend2` package.

#### Rollback

Remove `relayMode` parameter from `filterSidebarGroupsByPermissions` and revert `app-sidebar.tsx` to its previous state. The declaration merge in `sidebar-items.ts` is harmless if left in place.

---

### ISSUE-004 — Accounting relay mode is not auto-set when Finance module is provisioned

**Severity:** High  
**Effort:** 1 day

#### Root cause

The `add_module` job completion handler in `apps/api/src/routes/internal.ts` (~line 1243) sends a welcome email and updates tenant status, but does not call the POS backend to enable `accountingRelayMode`. The `remove_module` completion block is absent entirely, so deactivating Finance also fails to restore direct mode.

The control plane already has a standard mechanism for calling the POS platform API: `posProxyJson` in `apps/api/src/pos-proxy.ts`. It uses `posConfig.platformApiKey` as the `X-Api-Key` header against `POS_PLATFORM_BASE_URL/api/platform/v1{path}`. This requires no new authentication infrastructure.

#### Change 1 — Import `posProxyJson` in `internal.ts`

**File:** `apps/api/src/routes/internal.ts`

Add to existing imports (after line 67):
```ts
import { posProxyJson } from "../pos-proxy.js";
```

#### Change 2 — Enable relay mode after `add_module` accounting completion

**File:** `apps/api/src/routes/internal.ts`

Locate the block starting at line 1310:
```ts
const moduleFromPayload =
  currentJob.payload && ...
    ? String(...)
    : null;
```

Immediately after the `if (moduleFromPayload) { ... }` block that calls `notifyProvisionOutcome` / `notifyModuleAdded` (after line 1331), add:

```ts
// Auto-enable relay mode on the POS org when the accounting module is provisioned.
if (moduleFromPayload === "accounting") {
  const posOrgId = posOrganizationIdFromResult
    ?? (currentJob.tenantId
        ? (await db
            .select({ posOrganizationId: tenantDeployments.posOrganizationId })
            .from(tenantDeployments)
            .where(eq(tenantDeployments.tenantId, currentJob.tenantId))
            .limit(1))[0]?.posOrganizationId
        : undefined);

  const financeUrlForOrg = (() => {
    const root = rootDomainForOrganizationSubdomain();
    if (!root || !tenant?.slug) return null;
    return `${apiConfig.publicBaseUrlScheme ?? "https"}://${tenant.slug}.${root}`;
  })();

  if (posOrgId) {
    const { status: relayStatus } = await posProxyJson(
      `/organizations/${encodeURIComponent(posOrgId)}/accounting-mode`,
      "PUT",
      { relayMode: true },
    ).catch((err: unknown) => {
      logger.error("add_module: failed to enable relay mode on POS org", err, { posOrgId });
      return { status: 0 };
    });
    if (relayStatus >= 200 && relayStatus < 300) {
      logger.info("add_module: accounting relay mode enabled", { posOrgId });
    } else {
      logger.warn("add_module: relay mode call returned non-2xx", { posOrgId, relayStatus });
    }

    if (financeUrlForOrg) {
      await posProxyJson(
        `/organizations/${encodeURIComponent(posOrgId)}/finance-url`,
        "PUT",
        { financeUrl: financeUrlForOrg },
      ).catch((err: unknown) => {
        logger.error("add_module: failed to store financeUrl on POS org", err, { posOrgId });
      });
    }
  }
}
```

Note: `tenant` is already in scope at this point (declared earlier in the `add_module` block). `posOrganizationIdFromResult` may be `undefined` for `add_module` jobs (the worker returns it for provision jobs but not always for add_module), so the fallback queries `tenantDeployments` directly.

#### Change 3 — Add `remove_module` completion handler to disable relay mode

**File:** `apps/api/src/routes/internal.ts`

After the closing `}` of the `if (currentJob?.type === "add_module" && currentJob.tenantId) { ... }` block (after line 1331) and before the `if (currentJob?.type === "tenant.deprovision") {` block (line 1333), insert:

```ts
if (currentJob?.type === "remove_module" && currentJob.tenantId) {
  const removedModule =
    currentJob.payload
    && typeof currentJob.payload === "object"
    && "module" in currentJob.payload
    && typeof (currentJob.payload as { module?: unknown }).module === "string"
      ? String((currentJob.payload as { module: string }).module)
      : null;

  if (removedModule === "accounting") {
    const [deployRow] = await db
      .select({ posOrganizationId: tenantDeployments.posOrganizationId })
      .from(tenantDeployments)
      .where(eq(tenantDeployments.tenantId, currentJob.tenantId))
      .limit(1);

    const posOrgId = deployRow?.posOrganizationId;
    if (posOrgId) {
      await posProxyJson(
        `/organizations/${encodeURIComponent(posOrgId)}/accounting-mode`,
        "PUT",
        { relayMode: false },
      ).catch((err: unknown) => {
        logger.error("remove_module: failed to disable relay mode on POS org", err, { posOrgId });
      });
      logger.info("remove_module: accounting relay mode disabled", { posOrgId });
    }
  }
}
```

#### Change 4 — Add `/organizations/:id/finance-url` endpoint to POS backend

The `add_module` handler calls `PUT /api/platform/v1/organizations/:id/finance-url`. This endpoint does not yet exist.

**File:** `apps/pos-backend/controllers/platformOrgController.js`

Add after `patchOrgAccountingMode` (after line 1399):
```js
/**
 * PUT /api/platform/v1/organizations/:id/finance-url
 * Body: { financeUrl: string }
 * Stores the Finance application URL for display in POS sidebar.
 */
const patchOrgFinanceUrl = async (req, res, next) => {
  try {
    const { financeUrl } = req.body ?? {};
    if (typeof financeUrl !== "string") {
      return next(createHttpError(400, "financeUrl must be a string."));
    }
    const url = String(financeUrl).trim();
    const org = await Organization.findById(req.params.id).select("_id slug financeUrl");
    if (!org) return next(createHttpError(404, "Organization not found."));

    org.financeUrl = url;
    await org.save();

    res.json({
      success: true,
      data: { id: String(org._id), slug: org.slug, financeUrl: org.financeUrl },
    });
  } catch (e) {
    next(e);
  }
};
```

Add `patchOrgFinanceUrl` to `module.exports` at the bottom of the same file.

**File:** `apps/pos-backend/routes/platformV1Route.js`

Import `patchOrgFinanceUrl` alongside the existing `patchOrgAccountingMode` import (line 39 area):
```js
  patchOrgFinanceUrl,
```

Register the route after line 242 (after the `accounting-mode` route):
```js
router.put(
  "/organizations/:id/finance-url",
  requirePlatformPermission(P.ORG_WRITE),
  patchOrgFinanceUrl
);
```

**File:** `apps/pos-backend/models/organizationModel.js`

Add `financeUrl` field after `accountingRelayMode` (after line 132):
```js
financeUrl: { type: String, trim: true, default: "" },
```

#### Migration — set relay mode on existing tenants that already have Finance

Run the following one-time script after deploying this phase:

```sql
-- Identify tenants with accounting module
SELECT id, slug, modules FROM tenants
WHERE modules LIKE '%accounting%'
  AND status = 'active';
```

For each result, call:
```
PUT /api/platform/v1/organizations/{posOrganizationId}/accounting-mode
Body: { "relayMode": true }
Header: X-Api-Key: {POS_PLATFORM_API_KEY}
```

A Node.js script for this is the correct mechanism — do not use raw SQL to set `accountingRelayMode` directly, as the API validates input and ensures `slug` is returned for audit logging.

#### Acceptance criteria

1. Add `accounting` module to a test tenant via `POST /tenants/:id/add-module`.
2. Worker completes the `add_module` job.
3. POS `Organization.accountingRelayMode` is `true`.
4. POS `Organization.financeUrl` is set to the Finance URL (e.g. `https://slug.finance.example.com`).
5. Remove `accounting` module via `POST /tenants/:id/remove-module`.
6. Worker completes the `remove_module` job.
7. POS `Organization.accountingRelayMode` is `false`.
8. If `posOrganizationId` is absent from `tenantDeployments`, the relay mode calls fail silently with a `logger.error` log — no crash, job still marked complete.

#### Rollback

Remove the relay mode and finance-url calls from `internal.ts`. Revert `platformOrgController.js` and `platformV1Route.js` to remove the `finance-url` endpoint. Remove the `financeUrl` field from `organizationModel.js` (schema change is additive and safe to leave; field defaults to `""`).

---

## Phase 3 — Observability & Inventory Fidelity (P2 / P3)

**Includes:** ISSUE-005 (already largely covered by Phase 2), ISSUE-006, ISSUE-007  
**Prerequisite:** Phase 2 deployed and verified.

---

### ISSUE-005 — Finance URL not surfaced in POS session (covered in Phase 2)

ISSUE-005 is fully addressed by:
- `Organization.financeUrl` field added in ISSUE-004 Change 4
- `getUserProfilePayload` populate string updated in ISSUE-001
- `financeUrl` set during `add_module` completion in ISSUE-004 Change 2
- Frontend reads `user.organization.financeUrl` in ISSUE-002 Change 4

No additional work required beyond Phase 1 and Phase 2.

---

### ISSUE-006 — No alert for persistent Finance GL sync failures

**Severity:** High  
**Effort:** 0.5 day

#### Root cause

`onBigcapitalSyncFailed` in `apps/pos-backend/services/bigcapitalSyncProcessor.js` logs to `console.error` and sets `lastSyncError` on `IntegrationConfig`. The outbox drain in `bigcapitalSyncWorker.js` retries failed rows every 45 seconds but never escalates when rows have been stuck in `failed` status beyond a threshold. Finance GL silently diverges from POS stock state with no operator notification.

#### Change 1 — Add `ACCOUNTING_SYNC_STUCK` to notification event catalog

**File:** `apps/pos-backend/services/backofficeNotificationEvents.js`

The file currently has a `NOTIFICATION_EVENTS` object (line 3) and a `createBackofficeNotificationFromEvent` switch statement. The existing events include `ACCOUNTING_SALE_POST_FAILED` (line 54) and `ACCOUNTING_COGS_POST_FAILED` (line 67).

Add to the `NOTIFICATION_EVENTS` object:
```js
ACCOUNTING_SYNC_STUCK: "accounting_sync_stuck",
```

Add a `case` to the switch in `createBackofficeNotificationFromEvent`:
```js
case NOTIFICATION_EVENTS.ACCOUNTING_SYNC_STUCK: {
  const count = input.stuckCount ?? "multiple";
  return createBackofficeNotification({
    organizationId: input.organizationId,
    type: "warning",
    title: "Finance sync stalled",
    body: `${count} Finance sync event(s) have been failing for more than 30 minutes. Check the Finance integration configuration or Finance service availability.`,
    actionUrl: "/dashboard/accounting/finance-integration",
    actionLabel: "View integration",
  });
}
```

#### Change 2 — Add `checkForStuckOutboxRows` to the outbox service

**File:** `apps/pos-backend/services/accountingIntegrationOutbox.js`

Add at the end of the file, before `module.exports`:
```js
/**
 * Count outbox rows in `failed` status that have not progressed for longer than
 * `thresholdMinutes`. Used to trigger operator alerts.
 * @param {string|import('mongoose').Types.ObjectId} organizationId
 * @param {number} [thresholdMinutes=30]
 */
async function countStuckOutboxRows(organizationId, thresholdMinutes = 30) {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
  return AccountingIntegrationOutbox.countDocuments({
    organization: organizationId,
    status: "failed",
    updatedAt: { $lt: cutoff },
  });
}
```

Add `countStuckOutboxRows` to `module.exports`.

#### Change 3 — Add periodic stuck-row alert to the sync worker

**File:** `apps/pos-backend/workers/bigcapitalSyncWorker.js`

Import the new function and the notification utility:
```js
const { countStuckOutboxRows } = require("../services/accountingIntegrationOutbox");
const AccountingIntegrationOutbox = require("../models/accountingIntegrationOutboxModel");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("../services/backofficeNotificationEvents");
```

Add the alert function before `main()`:
```js
const STUCK_CHECK_INTERVAL_MS = Number(process.env.ACCOUNTING_STUCK_CHECK_MS || 15 * 60_000);

async function alertStuckOrgs() {
  try {
    const stuckOrgIds = await AccountingIntegrationOutbox.distinct("organization", {
      status: "failed",
      updatedAt: { $lt: new Date(Date.now() - 30 * 60_000) },
    });
    for (const orgId of stuckOrgIds) {
      const count = await countStuckOutboxRows(orgId);
      if (count <= 0) continue;
      await createBackofficeNotificationFromEvent(
        NOTIFICATION_EVENTS.ACCOUNTING_SYNC_STUCK,
        { organizationId: String(orgId), stuckCount: count },
      ).catch(() => {});
    }
  } catch (err) {
    console.error("[BigcapitalSync] Stuck check error:", err?.message || err);
  }
}
```

Inside `main()`, after the `setInterval(drainOutbox, OUTBOX_DRAIN_MS)` call:
```js
const stuckTimer = setInterval(alertStuckOrgs, STUCK_CHECK_INTERVAL_MS);
stuckTimer.unref?.();
void alertStuckOrgs();
```

#### Acceptance criteria

1. Set Finance integration `internalBaseUrl` to a non-existent URL on a test org.
2. Trigger a paid order → outbox row is created and immediately starts failing.
3. Wait 31 minutes (or simulate by directly setting `updatedAt` to `now - 31 minutes` on the row in MongoDB).
4. `alertStuckOrgs` fires → backoffice notification of type `warning` with title "Finance sync stalled" appears for the org.
5. Fix the `internalBaseUrl` → rows drain → no more stuck notifications on next run.

#### Rollback

Remove `alertStuckOrgs`, its `setInterval`, and its imports from `bigcapitalSyncWorker.js`. Remove the `ACCOUNTING_SYNC_STUCK` case from `backofficeNotificationEvents.js` (or leave it dead — it is harmless).

---

### ISSUE-007 — Finance variance journals collapse all lines to a single net entry

**Severity:** Medium  
**Effort:** 1 day  
**Service:** `services/stockix-finance` (Finance service deployment required — coordinate separately)

#### Root cause

`InternalPosInventoryService.postInventoryVariance` in `services/stockix-finance/packages/server/src/modules/Internal/commands/InternalPosInventory.service.ts` aggregates all line amounts into a single `netDebitInventory` value and produces one journal entry. Ten stock adjustments across different ingredients produce one journal in Finance, losing per-ingredient GL drill-down.

#### Change — Emit one journal entry per payload line

**File:** `services/stockix-finance/packages/server/src/modules/Internal/commands/InternalPosInventory.service.ts`

Replace the `postInventoryVariance` method body after the `lines` filtering. The new behaviour: iterate each line independently; call `this.manualJournalsApplication.createManualJournal` once per non-zero line; collect results; return a summary.

```typescript
async postInventoryVariance(
  tenantId: number,
  payload: InternalPosInventoryVariancePayloadDto,
) {
  await this.resolveTenantContext(tenantId);

  const referenceNo = String(payload.referenceNo || '').trim();
  if (!referenceNo) {
    throw new BadRequestException('referenceNo is required');
  }

  const lines = (payload.lines || []).filter(
    (l) => l.itemId && Number(l.quantity) !== 0 && Number(l.unitCost) >= 0,
  );
  if (!lines.length) {
    return { success: true, skipped: true, reason: 'no_variance_lines' };
  }

  const { inventoryAccountId, varianceAccountId } =
    await this.resolveInventoryAccounts(
      payload.inventoryAccountId,
      payload.varianceAccountId,
    );

  const journals: unknown[] = [];

  for (const [idx, line] of lines.entries()) {
    const qty = Number(line.quantity);
    const unitCost = Number(line.unitCost);
    const amount = Math.round(qty * unitCost * 100) / 100;
    if (Math.abs(amount) < 0.005) continue;

    const absAmt = Math.abs(amount);
    const lineRef = `${referenceNo}-${String(idx + 1).padStart(3, '0')}`;

    const journalDto = new CreateManualJournalDto();
    journalDto.date = payload.journalDate as unknown as Date;
    journalDto.publish = true;
    journalDto.reference = lineRef;
    journalDto.description =
      line.description || `POS inventory variance · ${lineRef}`;

    if (amount > 0) {
      // Stock increase: debit Inventory, credit Variance/Expense
      journalDto.entries = [
        { index: 1, debit: absAmt, accountId: inventoryAccountId,  note: line.description || 'POS stock increase' },
        { index: 2, credit: absAmt, accountId: varianceAccountId, note: line.description || 'POS stock increase offset' },
      ];
    } else {
      // Stock decrease / waste: debit Variance/Expense, credit Inventory
      journalDto.entries = [
        { index: 1, debit: absAmt, accountId: varianceAccountId,  note: line.description || 'POS stock decrease / waste' },
        { index: 2, credit: absAmt, accountId: inventoryAccountId, note: line.description || 'POS stock decrease offset' },
      ];
    }

    const journal =
      await this.manualJournalsApplication.createManualJournal(journalDto);
    journals.push(journal);
  }

  if (!journals.length) {
    return { success: true, skipped: true, reason: 'zero_net' };
  }

  return {
    success: true,
    data: journals,
    count: journals.length,
    idempotent: false,
  };
}
```

#### Performance consideration

For a stock take with 50 variance lines, this creates 50 journal entries instead of 1. Finance's `createManualJournal` hits the same MySQL transaction path each time. Benchmark before deploying to a tenant with large stock takes (> 100 lines). If performance is a concern, add a `perLine?: boolean` flag to `InternalPosInventoryVariancePayloadDto` and default it to `true`; the POS side passes it via the existing `payload` object in `processStockTakeVarianceJob`.

#### Idempotency consideration

The `referenceNo` for each line becomes `${sessionId}-001`, `${sessionId}-002`, etc. On retry, the same reference numbers are generated (deterministic). The Finance bill layer checks `referenceNo` uniqueness on GRN bills; the same check should be confirmed for manual journals. If `ManualJournalsApplication.createManualJournal` does not check reference uniqueness, add a pre-check:

```typescript
const existing = await this.manualJournalModel().query()
  .where('reference', lineRef)
  .first();
if (existing) {
  journals.push(existing);
  continue;
}
```

#### Acceptance criteria

1. Post a stock take session with 3 variance lines (ingredients A, B, C).
2. Finance GL contains 3 distinct journal entries, one per ingredient.
3. Each journal `reference` is `{stockTakeId}-001`, `-002`, `-003`.
4. Each journal's description identifies the ingredient by name.
5. A second POST of the same payload (retry scenario) produces no duplicate journals.
6. POS backend `bigcapitalSyncWorker` reports `success: true, count: 3`.

#### Rollback

Revert `postInventoryVariance` to the previous net-journal implementation. Finance service only — no POS or control-plane changes required.

---

## Deployment Checklist

### Pre-deployment (all phases)

- [ ] Confirm `POS_PLATFORM_API_KEY` env var is set in the Stockix worker environment (required for ISSUE-004 relay mode calls)
- [ ] Confirm `POS_PLATFORM_BASE_URL` env var is set in the Stockix worker environment
- [ ] Verify `ACCOUNTING_OUTBOX_DRAIN_MS` and new `ACCOUNTING_STUCK_CHECK_MS` are documented in `.env.example`

### Phase 1 deployment order

1. Deploy `apps/pos-backend` (ISSUE-001 + ISSUE-003 changes)
2. Smoke test: `GET /api/session` returns `organization.accountingRelayMode`
3. Smoke test: relay-mode org returns 403 on `POST /api/accounting/journal-entries`
4. Smoke test: direct-mode org returns 201 on `POST /api/accounting/journal-entries`

### Phase 2 deployment order

1. Deploy `apps/pos-backend` (ISSUE-004: `finance-url` endpoint + `organizationModel.js`)
2. Deploy `apps/api` (ISSUE-004: `internal.ts` import + add_module/remove_module blocks)
3. Run migration script to set relay mode on existing Finance-module tenants
4. Deploy `apps/pos-frontend2` (ISSUE-002: sidebar changes)
5. Smoke test: add accounting module to test tenant → relay mode enabled automatically
6. Smoke test: POS sidebar hides GL write items for relay tenant

### Phase 3 deployment order

1. Deploy `apps/pos-backend` (ISSUE-006: notification + worker changes)
2. Deploy `services/stockix-finance` (ISSUE-007: per-line journal change)
3. Test ISSUE-006 with simulated stuck outbox
4. Test ISSUE-007 with a stock take session

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `requireAccountingDirectMode` now hits DB on every write — latency spike | Medium | Request-scope cache in `attachTenantOrganization` (Phase 1 change) |
| `posProxyJson` call in `internal.ts` times out (POS backend unreachable) | Low | 15s timeout in `pos-proxy.ts`; failure is non-fatal with `logger.error` |
| Relay mode set for tenant without POS deployment | Low | Guard on `posOrgId` being truthy before calling proxy |
| `remove_module` worker job not yet handling relay deactivation (before Phase 2) | Certain | Manual deactivation via platform API; Phase 2 automates it |
| Finance variant journal per-line causes performance regression | Medium | Benchmark with large stock takes before deploying ISSUE-007 |
| Migration script misses tenants (slug pattern mismatch) | Low | Query by `modules LIKE '%accounting%'` covers all serialization formats; verify count matches dashboard |

---

## Definition of Done

- [ ] All 7 issues resolved with code changes matching this plan
- [ ] Each issue's acceptance criteria verified in staging
- [ ] No TypeScript or ESLint errors introduced
- [ ] Migration script executed; zero tenants with `accounting` module but `accountingRelayMode: false`
- [ ] Production readiness score re-assessed: target ≥ 8.5/10 overall
