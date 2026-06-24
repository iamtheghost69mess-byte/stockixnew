# POS ↔ Finance Integration — Deep Audit & Repair Plan

**Audit Date:** 2026-06-24  
**Branch:** `architecture2`  
**Auditor:** Principal Architecture Audit (automated deep codebase scan)

---

## 1. Executive Summary

Two architecture risks were investigated. Both are real and require remediation, but at different severity levels.

**Risk #1 — Inventory Drift** is **partially real** with nuance:

- POS is the sole source of truth for *physical* inventory quantities. Finance never writes back to POS, so physical stock counts cannot drift between systems.
- What CAN drift is the **GL representation** in Finance. If the outbox processor fails (Redis down, Finance API 500, worker offline), Finance's ledger never receives stock adjustment journals, GRN bills, or stock-take variance entries. Finance's inventory valuation and COGS are then silently wrong.
- There is **no automated reconciliation**, no alert when outbox items have been stuck > N minutes, and no drift-detection job. Failure is silent beyond a backoffice notification for unmapped items.

**Risk #2 — Accounting UI Visible in Relay Mode** is **confirmed and critical**:

- `accountingRelayMode` exists in the org model and the middleware, but is **never surfaced to the frontend**.
- The sidebar shows all 30+ accounting screens for ALL users regardless of relay mode.
- The `requireAccountingDirectMode` middleware **only blocks GL writes** — a narrow subset of 9 routes. 20+ other accounting write routes (AR, AP, bank reconciliation, sessions, credit notes, period close) are **not blocked** and will double-post if used alongside Finance.
- There is **no automatic relay mode activation** when the `accounting` module is provisioned. It must be manually set via an internal platform API.
- Users hit opaque `403 Forbidden` errors with no explanation, no redirect to Finance, and no UI indicator that relay mode is active.

---

## 2. Findings

### Finding 1 — POS Owns Physical Inventory; Finance Owns GL Representation

**Evidence:**
- `apps/pos-backend/models/stockBalanceModel.js` — authoritative physical quantity by `location × ingredient`
- `apps/pos-backend/models/stockMovementModel.js` — movement audit trail
- Finance receives only derived journal values via `postInventoryVariance` and `createGrnBill`

Finance's `InternalPosInventoryService` (`services/stockix-finance/packages/server/src/modules/Internal/commands/InternalPosInventory.service.ts`) creates a **net manual journal** across all variance lines, not a per-ingredient quantity record. Finance does not track physical quantities; it tracks accounting valuations.

**Implication:** Physical inventory cannot drift. GL valuation can drift silently.

---

### Finding 2 — No Reconciliation, No Drift Detection, No Alerts for GL Sync Failures

**Evidence:**
- `apps/pos-backend/services/accountingIntegrationOutbox.js` — outbox rows reach `failed` status with no escalation
- `apps/pos-backend/workers/bigcapitalSyncWorker.js:53` — drain runs every 45s but only attempts rows with `status: failed` and `nextAttemptAt <= now`. Items can stay failed indefinitely.
- `onBigcapitalSyncFailed` in `bigcapitalSyncProcessor.js` logs to console and sets `lastSyncError` on `IntegrationConfig`. No alert is sent if the failure persists for hours.
- Searching `apps/pos-backend/services/` for `reconcil`, `drift`, `consistency`, `health.*inventory`, `inventory.*check` — **zero results** matching inventory-to-Finance GL reconciliation.

**Gap:** No automated mechanism detects or repairs a situation where Finance GL does not reflect POS stock state.

---

### Finding 3 — Inventory Sync Uses Net Variance Journals (Loss of Per-Ingredient Granularity)

**Evidence — `InternalPosInventory.service.ts:postInventoryVariance`:**
```typescript
for (const line of lines) {
  netDebitInventory += amount;
}
// → single journal entry with net debit/credit
```

Ten individual stock adjustments on different ingredients produce **one aggregate journal** in Finance. Finance cannot distinguish which ingredients moved. The `referenceNo` uses POS session ID but line-level detail is collapsed.

**Implication:** Finance inventory valuation reports (InventoryValuationSheet, InventoryItemDetails) cannot reconcile to POS ingredient-level StockBalance data because Finance never receives per-ingredient inventory balances.

---

### Finding 4 — Relay Mode: UI Never Receives the Flag

**Evidence:**
```js
// apps/pos-backend/controllers/userController.js:14-18
async function getUserProfilePayload(userFromReq) {
  const user = await User.findById(userFromReq._id)
    .populate("organization", "name slug");  // ← accountingRelayMode NOT populated
```

The session endpoint (`GET /api/session`) calls `getUserProfilePayload`. The frontend receives `organization.name` and `organization.slug` only. `accountingRelayMode` is never sent.

The sidebar filter (`apps/pos-frontend2/src/lib/filter-sidebar-groups.ts`) checks only RBAC permissions — no relay mode check exists anywhere in the frontend codebase.

---

### Finding 5 — requireAccountingDirectMode Only Covers 9 of 30+ Accounting Write Routes

**Evidence — `apps/pos-backend/routes/accountingRoute.js:20`:**
```js
const glWr = [...authedTenantLocation, requireAccountingDirectMode, ac.requireGlWrite];
```

`requireAccountingDirectMode` is applied **only** to the `glWr` middleware stack. Routes that use other stacks (`wr`, `arWr`, `apWr`, `bankWr`, `periodWr`, `expensesWr`, `approvalsWr`) are NOT protected.

**Routes blocked in relay mode** (9):
| Route | Method |
|-------|--------|
| `/accounting/journal-entries` | POST |
| `/accounting/recurring-templates` | POST, PATCH, DELETE |
| `/accounting/recurring-templates/:id/run` | POST |
| `/accounting/budgets` | POST, PATCH, DELETE |
| `/accounting/expense-reports/:id/post-gl` | POST |

**Routes NOT blocked in relay mode** (active double-posting risk — 20+):
| Route | Method | Stack |
|-------|--------|-------|
| `/accounting/accounts` | POST | `wr` |
| `/accounting/config` | PUT | `wr` |
| `/accounting/sessions/open` | POST | `wr` |
| `/accounting/sessions/:id/close` | POST | `wr` |
| `/accounting/post-order/:orderId` | POST | `wr` |
| `/accounting/reverse-order/:orderId` | POST | `wr` |
| `/accounting/refunds/:orderId` | POST | `wr` |
| `/accounting/ar/payments` | POST | `arWr` |
| `/accounting/invoices/from-order/:orderId` | POST | `arWr` |
| `/accounting/invoices/:id/void` | PATCH | `arWr` |
| `/accounting/vendor-bills/from-po` | POST | `apWr` |
| `/accounting/vendor-bills/:id/post` | POST | `apWr` |
| `/accounting/vendor-bills/:id/payments` | POST | `apWr` |
| `/accounting/vendor-bills/:id/void` | POST | `apWr` |
| `/accounting/credit-notes` | POST | `arWr` |
| `/accounting/bank/match` | POST | `bankWr` |
| `/accounting/bank/statements/import` | POST | `wr` |
| `/accounting/periods/close` | POST | `periodWr` |
| `/accounting/closing/retained-earnings` | POST | `periodWr` |
| `/accounting/expense-reports` | POST | `expensesWr` |
| `/accounting/gift-cards/issue` | POST | `wr` |
| `/accounting/gift-cards/redeem` | POST | `wr` |

---

### Finding 6 — Relay Mode Is Not Auto-Set During Accounting Module Provisioning

**Evidence:**
- `apps/api/src/routes/tenant-modules.ts` — `add_module` job dispatched when `accounting` module is added
- `apps/api/src/routes/internal.ts:1243-1316` — `add_module` completion handler: sets tenant status, records events, sends welcome email — **no call to POS backend to set `accountingRelayMode = true`**
- `apps/pos-backend/workers/platformWorker.js` — no relay mode trigger
- `apps/pos-backend/services/orgBootstrapService.js` — bootstraps accounting defaults only (chart of accounts, config), no relay mode flag

**Gap:** Finance module provisioning does not enable relay mode on the POS org. A super-admin must manually call `PUT /api/platform/v1/organizations/:id/accounting-mode` with `{ relayMode: true }`. This is undocumented and easy to miss.

---

### Finding 7 — Accounting Sidebar Is Always Visible; No Finance Dashboard Deep Link

**Evidence — `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts`:**
```ts
{
  id: 1,
  label: "Dashboards",
  items: [
    { title: "Finance", url: "/dashboard/finance", icon: Banknote },  // ← internal route, no external Finance URL
    ...
  ]
}
// id:8 "Accounting — Core" and id:17 "Accounting — Extended" always visible
```

In relay mode the Finance dashboard link goes to `/dashboard/finance` (POS internal route), NOT to the Finance application. The "Finance bridge" link (`/dashboard/accounting/finance-integration`) is permission-gated (`backoffice.accounting.write`) but still rendered in relay mode.

---

## 3. Evidence Summary

| Finding | File | Line | Severity |
|---------|------|------|----------|
| Session never returns relayMode | `apps/pos-backend/controllers/userController.js` | 14-18 | Critical |
| Sidebar has no relay mode filter | `apps/pos-frontend2/src/lib/filter-sidebar-groups.ts` | 9-28 | Critical |
| requireAccountingDirectMode only on glWr | `apps/pos-backend/routes/accountingRoute.js` | 20 | Critical |
| No relay mode auto-set on provisioning | `apps/api/src/routes/internal.ts` | 1243-1316 | High |
| No GL reconciliation job | `apps/pos-backend/services/` (entire dir) | — | High |
| Net journal loses per-ingredient detail | `services/stockix-finance/.../InternalPosInventory.service.ts` | 119-161 | Medium |
| Finance dashboard link is internal route | `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts` | 14-17 | Medium |

---

## 4. Architecture Diagrams

### 4.1 Current Inventory Architecture

```
POS Backend (MongoDB)
├── StockBalance           ← authoritative physical qty (per location × ingredient)
├── StockMovement          ← movement ledger
├── StockLot               ← FEFO batch tracking
├── InventoryCostLayer     ← FIFO cost layers
├── GoodsReceiptNote       ← PO receive documents
└── StockTakeSession       ← physical count sessions

        ↓  Events via AccountingIntegrationOutbox + BullMQ

Finance Service (Bigcapital, MySQL per tenant)
├── Items                  ← item master (mapped from POS ingredients via IntegrationIngredientMapping)
├── Bills                  ← AP bills created from confirmed GRNs
├── ManualJournals         ← variance journals (net aggregated per event, not per ingredient)
└── SaleReceipts           ← revenue recognition from paid POS orders
```

No data ever flows Finance → POS. Finance holds GL representations only.

### 4.2 Outbox Event Pipeline

```
POS Action
  ↓
dispatchAccountingIntegrationEvent()
  ↓
AccountingIntegrationOutbox (MongoDB)
  status: pending → queued → processing → completed | failed
  ↓ (if Redis available)
BullMQ queue: bigcapital_sync
  5 retries, exponential backoff (10s base)
  ↓
bigcapitalSyncWorker.js
  ↓
Finance API /api/internal/pos/*
  ↓
Finance GL (journal / bill / receipt)

Drain fallback:
  Every 45s: drainPendingAccountingOutbox() picks up pending/failed rows
  ← no escalation if items stay failed > threshold
```

### 4.3 Relay Mode Flow (Current vs Ideal)

**Current (broken):**
```
User opens POS
  ↓
All accounting menus visible (no relay check)
  ↓
User clicks "Post Journal"
  ↓
POST /api/accounting/journal-entries
  ↓
requireAccountingDirectMode → 403 Forbidden
  ↓
User sees generic error, no guidance
```

**Ideal:**
```
User opens POS
  ↓
Session includes { organization: { accountingRelayMode: true, financeUrl: "..." } }
  ↓
Sidebar hides POS-native GL write items
  ↓
"Finance" link shows real Finance URL
  ↓
User redirected to Finance for all GL operations
```

### 4.4 Relay Mode Coverage (Current vs Required)

```
In relay mode today:
  BLOCKED: POST journal-entries, POST/PATCH/DELETE recurring-templates,
           POST/PATCH/DELETE budgets, POST expense-reports/:id/post-gl

  NOT BLOCKED (double-posting risk):
    - Session open/close       (cash tracking)
    - Repost/reverse order     (COGS journals)
    - AR invoice creation      (revenue recognition)
    - AP bill creation         (procurement)
    - Credit notes             (refunds)
    - Bank reconciliation      (cash matching)
    - Period close             (fiscal management)
    - Retained earnings close  (year-end)
```

---

## 5. Risk Analysis

### Risk Matrix

| Issue | Likelihood | Impact | Risk Level |
|-------|-----------|--------|-----------|
| User hits 403 in relay mode (UX) | High — any relay tenant | Medium — confusion | High |
| Double-posting in relay mode (AR/AP/sessions) | High if relay deployed | Critical — bad financials | Critical |
| Finance GL drift from stuck outbox | Medium — Redis/Finance downtime | High — wrong P&L | High |
| Missing relay mode auto-set at provisioning | Certain — no code does it | High — wrong mode active | High |
| No alert for persistent sync failures | Certain — no code | Medium — silent corruption | High |
| Net journal loses per-ingredient detail | Certain — by design | Low — valuation rounding | Medium |

### Scenario Analysis

| Scenario | Physical Qty Drift? | GL Drift? | Detected? | Recoverable? |
|----------|--------------------|-----------|-----------|----|
| Worker offline 1h | No | Yes | No | Yes (drain on restart) |
| Redis down 1h | No | Yes | No | Yes (drain) |
| Finance API 500 for 1 order | No | Yes | Partial (backoffice notif) | Yes (manual retry) |
| Finance API 500 for all events | No | Yes | No (no threshold alert) | Yes (drain) |
| Duplicate event | No | No (idempotency key) | N/A | N/A |
| Out-of-order event | No | Possible (wrong GL date) | No | Manual correction |
| Relay mode active, user posts AR invoice | No | Yes (double AR) | No | Manual void in Finance |

---

## 6. Repair Plan

---

### ISSUE-001: Session Does Not Return Relay Mode Flag

**Severity:** Critical  
**Root Cause:** `getUserProfilePayload` only populates `organization: "name slug"`. `accountingRelayMode` is never sent to the frontend.

**Files to Modify:**
- `apps/pos-backend/controllers/userController.js`

**Backend Changes:**

```js
// Line 15 — change populate to include accountingRelayMode and financeUrl
const user = await User.findById(userFromReq._id)
  .populate("location", "name code waiterCanPrintReceipt")
  .populate("locations", "name code waiterCanPrintReceipt")
  .populate("organization", "name slug accountingRelayMode");
```

Also add `financeUrl` to the Organization model and populate it here once the field exists (see ISSUE-006).

**Testing Plan:**
1. Create an org with `accountingRelayMode: true`
2. Log in as a user of that org
3. `GET /api/session` → `data.organization.accountingRelayMode` must be `true`
4. Repeat with `accountingRelayMode: false` → must be `false`

**Rollback:** Revert populate string to `"name slug"`.

---

### ISSUE-002: Sidebar Ignores Relay Mode

**Severity:** Critical  
**Root Cause:** `filterSidebarGroupsByPermissions` only checks RBAC permissions. No relay mode flag exists in the session payload (see ISSUE-001).

**Files to Modify:**
- `apps/pos-frontend2/src/lib/filter-sidebar-groups.ts`
- `apps/pos-frontend2/src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx`
- `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts`

**Frontend Changes:**

1. Add `requiresDirectMode?: boolean` to `NavMainItem` type in `sidebar-items.ts`.

2. Mark all GL write items in `sidebarItems` as `requiresDirectMode: true`:
   - Chart of accounts (create/edit is write)
   - Entries / Ledger (journal write)
   - GL settings
   - Trial balance, P&L, Balance sheet, Fiscal periods, Cash flow — these are reads; keep visible but may need data-source indicator
   - Recurring journals
   - Budget vs actual / Budgets
   - Register sessions (open/close → double-post risk)
   - Order GL tools
   - Bank (match/import → double-post risk)
   - Invoices (AR create → double-post risk)
   - Vendor bills (AP create → double-post risk)
   - Credit notes (double-post risk)
   - Expense reports (GL post → double-post risk)

3. Update `filterSidebarGroupsByPermissions` to accept a `relayMode` boolean and filter out `requiresDirectMode` items when `relayMode === true`.

4. In `app-sidebar.tsx`, read `user.organization.accountingRelayMode` and pass it to the filter.

5. Add a `FinanceExternalLink` item at the top of Accounting section that links to the tenant's Finance URL (requires ISSUE-005 to supply the URL).

**Backend Changes:** None beyond ISSUE-001.

**Database Changes:** None.

**Testing Plan:**
1. Log in as user of relay mode org → accounting write items hidden
2. Log in as user of direct mode org → all items visible
3. Switching relay mode updates on next login

**Rollback:** Remove `requiresDirectMode` field handling; revert filter function.

---

### ISSUE-003: requireAccountingDirectMode Covers Too Few Routes

**Severity:** Critical  
**Root Cause:** Middleware applied only to `glWr` stack. 20+ accounting write routes bypass it.

**Files to Modify:**
- `apps/pos-backend/routes/accountingRoute.js`

**Backend Changes:**

Expand `requireAccountingDirectMode` to cover ALL accounting write operations that would conflict with Finance when relay mode is active. Create route stacks:

```js
// After line 20, replace individual stacks with:
const wr         = [...authedTenantLocation, requireAccountingDirectMode, ac.requireAccountingWrite];
const arWr       = [...authedTenantLocation, requireAccountingDirectMode, ac.requireArWrite];
const apWr       = [...authedTenantLocation, requireAccountingDirectMode, ac.requireApWrite];
const glWr       = [...authedTenantLocation, requireAccountingDirectMode, ac.requireGlWrite];
const bankWr     = [...authedTenantLocation, requireAccountingDirectMode, ac.requireBankWrite];
const periodWr   = [...authedTenantLocation, requireAccountingDirectMode, ac.requirePeriodsWrite];
const expensesWr = [...authedTenantLocation, requireAccountingDirectMode, ac.requireExpensesWrite];
const expensesApprove = [...authedTenantLocation, requireAccountingDirectMode, ac.requireExpensesApprove];
const approvalsWr     = [...authedTenantLocation, requireAccountingDirectMode, ac.requireApprovalsWrite];
```

**Exceptions** — leave these as read-only passthroughs (NOT blocked, as they are informational or idempotent):
- All `GET` routes — never blocked
- `POST /accounting/sync/ack` — outbox acknowledgement
- `POST /accounting/notifications/*/read` — marking notifications read

**Testing Plan:**
1. Enable relay mode on org
2. Attempt `POST /api/accounting/invoices/from-order/xxx` → expect 403 with relay message
3. Attempt `POST /api/accounting/vendor-bills/from-po` → expect 403
4. Attempt `GET /api/accounting/invoices` → expect 200 (reads pass through)
5. Disable relay mode → all writes succeed

**Risks:**
- **Breaking change for direct-mode orgs**: All `wr` routes now hit one extra DB query. Mitigate by caching org relay mode on `req.org` in `attachTenantOrganization` middleware (it already loads the org).
- If a customer has both POS direct mode AND Finance open simultaneously (migration period), blocking writes could disrupt them. Confirm relay mode auto-set during migration.

**Rollback:** Revert `glWr` to only include `requireAccountingDirectMode`.

---

### ISSUE-004: Relay Mode Not Auto-Set When Accounting Module Is Provisioned

**Severity:** High  
**Root Cause:** `add_module` completion handler in `apps/api/src/routes/internal.ts` does not call `PUT /api/platform/v1/organizations/:id/accounting-mode`.

**Files to Modify:**
- `apps/api/src/routes/internal.ts` (add_module completion block, ~line 1243)

**Backend Changes:**

After the tenant status update on `add_module` completion:
```typescript
// If accounting module was added, auto-enable relay mode on the POS org
if (moduleFromPayload === "accounting" && posOrganizationIdFromResult) {
  try {
    await fetch(
      `${posApiBase}/api/platform/v1/organizations/${posOrganizationIdFromResult}/accounting-mode`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${platformToken}` },
        body: JSON.stringify({ relayMode: true }),
      }
    );
    logger.info("Accounting relay mode enabled for org", { posOrganizationIdFromResult });
  } catch (err) {
    logger.error("Failed to set accounting relay mode", err);
    // Non-fatal: relay mode can be set manually
  }
}
```

Similarly, when the `accounting` module is **removed**, auto-disable relay mode (`relayMode: false`).

**Database Changes:**
- No schema changes; `accountingRelayMode` already exists in `organizationModel.js:132`.

**Migration Steps:**
- Identify all existing tenants with the `accounting` module currently active.
- For each, manually call `PUT .../accounting-mode` with `{ relayMode: true }` if not already set.
- Script: `SELECT id FROM tenants WHERE modules LIKE '%accounting%'` → loop and set.

**Testing Plan:**
1. Add `accounting` module to a test tenant via the API
2. Wait for `add_module` completion
3. Verify `Organization.accountingRelayMode === true` in POS MongoDB
4. Remove `accounting` module → verify `accountingRelayMode === false`

**Rollback:** Remove the relay mode calls; set relay mode manually post-provision.

---

### ISSUE-005: Finance External URL Not Available to POS Frontend

**Severity:** High  
**Root Cause:** The POS sidebar's Finance link goes to `/dashboard/finance` (internal POS route), not the actual Finance application URL.

**Files to Modify:**
- `apps/pos-backend/models/organizationModel.js` (add `financeUrl` field)
- `apps/pos-backend/controllers/userController.js` (populate field)
- `apps/api/src/routes/internal.ts` (store financeUrl in POS org on provisioning)
- `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts` (update Finance link)

**Backend Changes:**

1. Add to `organizationModel.js`:
```js
financeUrl: { type: String, trim: true, default: "" },
```

2. In `internal.ts` `add_module` completion, store `financeUrl` on the POS org:
```typescript
await fetch(
  `${posApiBase}/api/platform/v1/organizations/${posOrganizationIdFromResult}/finance-url`,
  { method: "PUT", body: JSON.stringify({ financeUrl: financeUrlFromResult }) }
);
```

3. In `getUserProfilePayload`, populate `"name slug accountingRelayMode financeUrl"`.

**Frontend Changes:**

In `sidebar-items.ts`, change the Finance dashboard link to be dynamic (read from `user.organization.financeUrl`). When `relayMode` is true and `financeUrl` is set, replace the Finance sidebar item with an external link:
```ts
{
  title: "Open Finance",
  url: user.organization.financeUrl,  // external href
  icon: ExternalLink,
  external: true,
}
```

**Testing Plan:**
1. Provision tenant with accounting module
2. POS session includes `organization.financeUrl = "https://<tenant>.stockix.finance/..."`
3. Finance sidebar item links externally to that URL

---

### ISSUE-006: No Alert for Persistent Outbox Sync Failures (GL Drift)

**Severity:** High  
**Root Cause:** Failed outbox rows are retried indefinitely but no escalation fires when items have been in `failed` status beyond a threshold.

**Files to Modify:**
- `apps/pos-backend/services/accountingIntegrationOutbox.js` (add alert function)
- `apps/pos-backend/workers/bigcapitalSyncWorker.js` (add periodic stuck-check)
- `apps/pos-backend/services/backofficeNotificationEvents.js` (add new notification event)

**Backend Changes:**

1. Add a `NOTIFICATION_EVENTS.ACCOUNTING_SYNC_STUCK` event to `backofficeNotificationEvents.js`.

2. Add a `checkForStuckOutboxRows(organizationId, thresholdMinutes = 30)` function to `accountingIntegrationOutbox.js`:
```js
async function checkForStuckOutboxRows(organizationId, thresholdMinutes = 30) {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
  const stuckRows = await AccountingIntegrationOutbox.countDocuments({
    organization: organizationId,
    status: "failed",
    updatedAt: { $lt: cutoff },
  });
  return stuckRows;
}
```

3. In `bigcapitalSyncWorker.js`, add a periodic alert check after each drain cycle:
```js
const alertOrgs = async () => {
  const orgsWithStuck = await AccountingIntegrationOutbox.distinct("organization", {
    status: "failed",
    updatedAt: { $lt: new Date(Date.now() - 30 * 60_000) },
  });
  for (const orgId of orgsWithStuck) {
    const count = await checkForStuckOutboxRows(orgId);
    if (count > 0) {
      await createBackofficeNotificationFromEvent(
        NOTIFICATION_EVENTS.ACCOUNTING_SYNC_STUCK,
        { organizationId: String(orgId), stuckCount: count }
      ).catch(() => {});
    }
  }
};
setInterval(alertOrgs, 15 * 60_000); // every 15 min
```

**Testing Plan:**
1. Simulate Finance API unavailable (wrong URL in integration config)
2. Trigger a sale → observe outbox row going to `failed`
3. Wait 31 minutes (or advance clock in test)
4. Drain runs → `alertOrgs` fires → backoffice notification appears

**Rollback:** Remove `alertOrgs` call; behaviour reverts to silent failure.

---

### ISSUE-007: Finance Inventory Variance Journals Lose Per-Ingredient Granularity

**Severity:** Medium  
**Root Cause:** `InternalPosInventory.service.ts:postInventoryVariance` collapses all lines into a single net debit/credit journal entry.

**Files to Modify:**
- `services/stockix-finance/packages/server/src/modules/Internal/commands/InternalPosInventory.service.ts`

**Backend Changes (Finance service):**

Change `postInventoryVariance` to create one journal entry per line (or at minimum one entry per item) rather than collapsing to a net:

```typescript
// Instead of computing netDebitInventory across all lines:
// Create a journal entry per line (or batch by ingredient)
for (const line of lines) {
  const qty = Number(line.quantity);
  const unitCost = Number(line.unitCost);
  const amount = Math.abs(Math.round(qty * unitCost * 100) / 100);
  if (amount < 0.005) continue;

  const journalDto = new CreateManualJournalDto();
  journalDto.reference = `${referenceNo}-item-${line.itemId}`;
  // ... per-line journal entry
}
```

Alternatively, add a `memo` or `description` field per journal line that records the ingredient ID and name for Finance-side drill-down.

**Risks:** Generates more journal entries in Finance (N entries per stock take instead of 1). Finance performance may degrade for large stock takes. Consider a configurable `perLine` flag.

**Testing Plan:**
1. Post a stock take with 5 variance lines
2. Finance GL shows 5 distinct reference entries
3. Each entry references its ingredient

---

## 7. Recommended Future Architecture

### 7.1 Inventory Source of Truth Recommendation

**Recommended: Option A — POS Owns Inventory (current, reinforce)**

| | Option A: POS Owns | Option B: Finance Owns | Option C: Shared Service |
|-|--------------------|-----------------------|--------------------------|
| Complexity | Low | High | Very High |
| Latency to Finance | Async (outbox) | Real-time | Real-time |
| Failure isolation | Good (POS unaffected by Finance down) | Bad | Medium |
| Data consistency | Eventually consistent (GL) | Strongly consistent | Eventually consistent |
| Migration effort | None | Major refactor | Major build |

**Recommendation:** Keep POS as physical inventory owner. Improve the async GL relay with:
1. Stuck-event alerting (ISSUE-006)
2. A reconciliation endpoint that compares total POS `StockMovement.extendedValue` (summed by organization) vs Finance journal balances for inventory accounts (future work, not in this plan)

### 7.2 Relay Mode UX Recommendation

When `accountingRelayMode = true`:

1. **Hide** all POS-native GL write screens (Chart of Accounts edit, Manual Journals, Budgets, Recurring Journals, Register Sessions, AR/AP creates, Bank matching, Period close)
2. **Show** read-only POS accounting screens with a banner: *"GL data is managed in Finance. Some figures may differ from Finance until synced."*
3. **Show** a prominent "Open Finance" link pointing to the tenant's Finance URL
4. **Show** the Finance Bridge integration setup page (already permission-gated)
5. **Do NOT** show: Finance bridge item under Accounting if Finance is not yet provisioned

---

## 8. Estimated Development Effort

| Issue | Effort | Dependencies |
|-------|--------|--------------|
| ISSUE-001: Session relay mode | 0.5 day | None |
| ISSUE-002: Sidebar relay filter | 1.5 days | ISSUE-001 |
| ISSUE-003: Middleware coverage | 0.5 day | ISSUE-001 (for read safety) |
| ISSUE-004: Auto-set on provision | 1 day | ISSUE-001 |
| ISSUE-005: Finance URL in session | 1 day | ISSUE-004 |
| ISSUE-006: Stuck-outbox alert | 0.5 day | None |
| ISSUE-007: Per-line inventory journals | 1 day | Finance service deployment |
| Migration: set relay on existing tenants | 0.5 day | ISSUE-004 |
| QA & regression | 2 days | All above |
| **Total** | **~8.5 days** | |

---

## 9. Priority Matrix

| Priority | Issue | Action |
|----------|-------|--------|
| P0 — Ship first | ISSUE-001 | Expose relay mode to frontend |
| P0 — Ship first | ISSUE-003 | Block all accounting writes in relay mode |
| P1 — Ship this sprint | ISSUE-002 | Hide accounting items in sidebar |
| P1 — Ship this sprint | ISSUE-004 | Auto-set relay mode during provisioning |
| P2 — Next sprint | ISSUE-005 | Finance external URL in session |
| P2 — Next sprint | ISSUE-006 | Stuck outbox alert |
| P3 — Backlog | ISSUE-007 | Per-line inventory journals in Finance |

---

## 10. Production Readiness Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Physical inventory accuracy | 9/10 | POS is sole owner; FIFO/FEFO correct |
| GL accuracy (sync reliability) | 5/10 | Outbox fails silently; no reconciliation |
| Relay mode backend guard | 4/10 | Only 9 of 30+ write routes blocked |
| Relay mode frontend UX | 1/10 | All menus visible; opaque 403 errors |
| Provisioning automation | 3/10 | Relay mode not auto-set |
| Observability / alerting | 3/10 | No persistent-failure alerts |
| Idempotency | 8/10 | Outbox + Finance referenceNo checks |
| **Overall** | **4.7/10** | Not production-ready for relay-mode tenants |

The system is production-ready for **direct-mode POS tenants** (Finance not provisioned). It is **not production-ready** for tenants that have both POS and Finance active simultaneously until ISSUE-001 through ISSUE-004 are resolved.
