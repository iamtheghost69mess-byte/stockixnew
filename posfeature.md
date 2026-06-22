# POS App — Feature & Architecture Audit

**Audited:** 2026-06-22  
**Branch:** architecture2  
**Scope:** `apps/pos-backend`, `apps/pos-frontend2`, `services/stockix-finance`  
**Method:** Direct file reads of models, controllers, middlewares, routes, and integration code — no assumptions.

---

## Section 1 — Multi-location support

| Item | Verdict |
|------|---------|
| Organization → multiple Locations schema | ✅ DONE |
| Sale/order carries `location_id` | ✅ DONE |
| Inventory (stock balance) per location | ✅ DONE |
| Reports filterable by location | ✅ DONE |

**Evidence:**

- `models/locationModel.js`: Location belongs to `organization` (indexed FK), types: storefront, warehouse, virtual, kitchen.
- `models/stockBalanceModel.js`: Compound unique index on `(location × ingredient)` — separate stock count per location.
- `models/stockMovementModel.js`: Every movement has `location` FK; transfers carry `counterLocation` + `transferGroupId`.
- `middlewares/locationScope.js`: Sets `req.locationScopeId` from user assignment or `X-Location-Id` header. Staff with an assigned location are always scoped to that branch (lines 39–57). Null = no scope restriction (admin).
- `controllers/reportController.js` lines 38–39: `getSalesReport(..., req.locationScopeId, req.tenantOrganizationId)` — location filter is passed through to every report query.
- `models/orderModel.js`: Orders have `location` FK (confirmed via locationScope usage in orderController).

**Gap:** No evidence that the `location_id` enforcement was end-to-end tested against a real API call from a scoped user — it depends on `req.locationScopeId` being set correctly by middleware ordering. Middleware ordering was not verified across all 47 route files.

---

## Section 2 — Multi-organization support

| Item | Verdict |
|------|---------|
| Single tenant can have multiple organizations | ✅ DONE |
| Complete data isolation between orgs at API level | ✅ DONE |

**Evidence:**

- `models/organizationModel.js`: Orgs have `stockixTenantId` (platform tenant FK), lifecycle states, parent org support for consolidated reporting.
- `middlewares/tenancyScope.js`: Sets `req.tenantOrganizationId` from the authenticated user's organization. Every model query uses this as a mandatory filter.
- `plugins/orgScopePlugin.js` (referenced in stockMovementModel, others): Auto-applies org scope to Mongoose queries.
- All 80+ models examined have an `organization` FK with `required: true` or `index: true`.

**Cross-org leakage test:** Not run live, but middleware pattern is consistent. A direct API call with another org's ID would need the JWT to carry that org's user — JWTs are org-scoped by construction.

---

## Section 3 — User → Organization + Location scoping

| Item | Verdict |
|------|---------|
| User assigned to org AND specific location(s) | ✅ DONE |
| Data visible only for user's org/location combo | ✅ DONE (backend) |
| Backend enforcement (not just UI hiding) | ✅ DONE |
| Admin/owner sees all locations within org | ✅ DONE |

**Evidence:**

- `models/userModel.js` lines 72–90: `organization` (required), primary `location` (null = super-admin/cross-location), `locations[]` array (multi-branch assignment).
- `middlewares/locationScope.js` lines 39–57: Staff with an assigned location get their scope pinned — they cannot override it with `X-Location-Id`.
- `middlewares/requirePermission.js`: RBAC checks before any backoffice operation. Role `admin` or `backoffice.*` grants cross-location visibility within the org.
- `middlewares/requireActiveOrganization.js`: Blocks suspended orgs entirely.

**Confirmed behavior:** A waiter with `location: branchA` will always see `branchA` data. An admin with `location: null` sees all locations within the org. Cross-org access requires a separate JWT — no code path allows it.

---

## Section 4 — POS ↔ Finance integration

| Item | Verdict |
|------|---------|
| Integration mechanism identified | ✅ DONE |
| POS accounting/sales data flows to Finance GL | ✅ DONE (when configured) |
| POS GL writes suppressed when Finance active | ✅ DONE |
| POS standalone accounting works without Finance | ✅ DONE |
| Branching logic in code (checks provisioning state) | 🟡 PARTIAL |

**Mechanism (confirmed in code):**
Idempotent outbox pattern → BullMQ worker → Bigcapital REST API.

1. `models/accountingIntegrationOutboxModel.js`: Event types: `sync_paid_order`, `void_receipt`, `partial_refund`, `grn_bill`, `inventory_adjustment`, `stock_take_variance`. Unique `idempotencyKey` prevents double-posting. `bullJobId` links to BullMQ.
2. `services/bigcapitalSyncEnqueue.js`: `enqueueBigcapitalSyncIfEnabled()` — queues paid orders if integration is enabled.
3. `workers/bigcapitalSyncWorker.js`: BullMQ worker drains the outbox and calls Bigcapital's internal API.
4. `models/integrationConfigModel.js`: Per-org config: `enabled` flag, `internalBaseUrl`, `financeTenantId`, location→Bigcapital branch mapping.
5. `middlewares/requireAccountingDirectMode.js` (full file, 31 lines): Checks `org.accountingRelayMode`. If true, blocks all GL write operations with HTTP 403: `"GL writes are disabled: this organization uses Finance relay mode."` This is set by the control plane when the Finance module is provisioned.

**Standalone mode:** When `accountingRelayMode: false` (no Finance), POS has its own full GL: chart of accounts, journal entries, periods, bank reconciliation, P&L, balance sheet, trial balance, AR aging, vendor bills, expense reports. All confirmed in `models/` (accountingAccountModel, journalEntryModel, accountingPeriodModel, etc.) and frontend pages under `dashboard/accounting/`.

**Partial gap:** The POS frontend accounting page (`src/app/(main)/dashboard/accounting/page.tsx`) does **not** read `accountingRelayMode` from the org. It always renders GL write buttons (Chart of Accounts, GL settings, journal entry links). The 403 block only fires when a user in relay mode actually clicks those buttons and hits the API. There is no proactive UI adaptation that says "accounting is managed in Finance — go there." This creates user confusion for tenants where both are provisioned.

---

## Section 5 — Shared Backblaze storage

| Item | Verdict |
|------|---------|
| POS uses same Backblaze B2 account as platform | ✅ DONE |
| Tenant-namespaced storage (no collision risk) | ✅ DONE |
| What is stored | ✅ DONE |

**Evidence (`services/storageService.js`):**

- S3-compatible SDK (`@aws-sdk/client-s3`) targeting `B2_ENDPOINT` (default `s3.us-east-005.backblazeb2.com`), same credentials format as the rest of the platform (`B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_NAME`).
- Upload key: `uploads/{tenantId}/{timestamp}-{filename}` (line 148) — per-tenant prefix enforced in code, not just convention.
- `isManagedUploadKey()` validates the `uploads/{tenantId}/` prefix before any delete operation (line 64–65) — prevents path-traversal deletions.
- Local disk fallback when B2 credentials are absent (dev mode).
- **What POS stores:** menu item images, ingredient images, receipt PDFs (via `accountingPdfService.js`), export files, branding assets.

---

## Section 6 — Inventory ownership: POS or Finance?

| Item | Verdict |
|------|---------|
| Single source of truth | 🟡 PARTIAL — RISK |
| POS owns live inventory | ✅ DONE |
| Finance has its own inventory module | ✅ DONE (separate store) |
| Sync mechanism exists | ✅ DONE |
| Drift risk between POS and Finance inventory | ⚠️ YES — real risk |

**Evidence:**

- **POS owns inventory:** `models/ingredientModel.js` (full inventory item record), `models/stockBalanceModel.js` (live qty per location), `models/stockLotModel.js` (FIFO/FEFO lot tracking), `models/inventoryCostLayerModel.js`, `models/stockMovementModel.js` (audit trail with `transfer_out/in` reasons).
- **Finance also has its own inventory:** `services/stockix-finance/packages/server/src/modules/` contains `InventoryAdjustments`, `InventoryCost` (FIFO/FEFO/LIFO/Weighted Average/Standard), and `WarehouseTransfer` modules. Finance holds its own item records, cost layers, and valuation sheets.
- **Sync mechanism:** When POS makes an inventory adjustment, `enqueueBigcapitalInventoryAdjustIfEnabled()` posts an `inventory_adjustment` outbox event that syncs to Finance. Similarly for GRN receipts (`grn_bill` event).

**The risk:** This is a dual-store pattern, not a single source of truth. If the outbox worker is down, fails, or is misconfigured, POS and Finance inventory counts will diverge silently. A sale deducts from POS stock immediately; Finance only sees it when the outbox drains. There is no reconciliation check that flags divergence. For the omnichannel use case (Section 15), this is the critical blocker.

---

## Section 7 — Daily operational reporting & alerts

| Item | Verdict |
|------|---------|
| Daily report schedule exists | ✅ DONE |
| Delivery mechanism | ✅ DONE (email + webhook) |
| Actually scheduled and fires | 🟡 PARTIAL |

**Evidence:**

- `models/reportScheduleModel.js`: Frequencies: daily, weekly, monthly. Report types: `daily-sales-summary`, `sales-by-category`, `void-report`, `stock-levels`, `wastage-report`, `profit-loss`, `expense-breakdown`, `vat-report`, `branch-comparison`. Recipients (email) and webhooks configured per schedule. `nextRunAt` field (indexed).
- `controllers/reportScheduleController.js`: Full CRUD, `nextRunAt` computed from frequency, webhook test-send.
- `services/inventoryAlertService.js`: `runInventoryAlertsOnce()` iterates org configs, compares `(quantity - reserved)` against `reorderThreshold`, fires webhook alerts. 3-minute concurrency lock.

**Gap:** `workers/platformWorker.js` handles email and event jobs. Report schedule execution is expected to be driven by a cron-like call to `runInventoryAlertsOnce()`, but this cron trigger is not visible in the worker file examined (first 80 lines read). Workers depend on Redis/BullMQ being available — if Redis is absent, `platformWorker.js` logs `"No workers started (bullmq/redis unavailable)"`. No production delivery logs were verified.

---

## Section 8 — Stock alerts

| Item | Verdict |
|------|---------|
| Low-stock thresholds per product/location | ✅ DONE |
| Threshold crossing triggers notification | ✅ DONE |
| Expiry alerts | ✅ DONE |

**Evidence (`services/inventoryAlertService.js`):**

- `collectLowStockRows()` (lines 12–38): Queries stock balances, compares `(quantity - reserved)` against `reorderThreshold`. Location-aware.
- `collectExpiringLots()` (lines 40–68): Checks `StockLot.expiryDate` within configurable days-ahead window.
- `runInventoryAlertsOnce()` (lines 70+): Iterates org configs, sends webhooks per endpoint configured. 3-minute TTL distributed lock prevents concurrent runs.
- `models/ingredientModel.js`: `reorderLevel` / `reorderThreshold` fields per ingredient.

---

## Section 9 — Real-time inventory management

| Feature | Verdict | Evidence |
|---------|---------|---------|
| Multi-location stock (separate counts per location) | ✅ DONE | `stockBalanceModel.js` compound index `location × ingredient` |
| Stock transfers between locations | ✅ DONE | `stockMovementModel.js` reasons `transfer_out`/`transfer_in`, `counterLocation`, `transferGroupId` |
| Low-stock alerts | ✅ DONE | See Section 8 |
| Purchase order tracking (PO → receiving → stock) | ✅ DONE | `purchaseOrderController.js`, `goodsReceiptNoteController.js` with QC workflow |
| Variants (variant-level stock tracking) | ✅ DONE | `menuItemVariantModel.js`: SKU, barcode, price/cost overrides per variant; unique index `org + sku` |
| Barcode support (scan-to-sell, scan-to-add) | ✅ DONE | `ingredientModel.js` barcode field; `inventory-api.ts` `scanInventoryBarcode()` → `GET /api/inventory/scan/:barcode` |
| Inventory valuation (FIFO/other) | ✅ DONE | `stockLotModel.js` FIFO/FEFO lot consumption by `receivedAt`; `accountingConfigModel.js` `defaultCostMethod` enum: `fifo`, `fefo`, `lifo`, `weighted_average`, `standard`; `inventoryCostLayerModel.js` |

---

## Section 10 — Customer CRM

| Feature | Verdict | Evidence |
|---------|---------|---------|
| Purchase history | ✅ DONE | `customerController.js` lines 131–150: order history lookup by customer |
| Spending analytics (totals, averages, trends) | 🟡 PARTIAL | CRM dashboard queries aggregate sales/top-items data (`use-crm-dashboard-queries.ts`). No per-customer spending breakdown endpoint or model field found. |
| Loyalty points (earn + redeem) | ✅ DONE | `loyaltyController.js` lines 99–168: point earn config (`pointsPerRupee`), redemption logic, `loyaltyAccountModel.js` with history |
| Notes (staff-added per customer) | ✅ DONE | `customerModel.js` line 18: `notes` field |
| Saved cards (tokenized) | ❌ NOT DONE | `customerModel.js` has no saved card, payment token, or processor reference. Payment method stored as a plain string label only. |
| Marketing segments (filter/group customers) | ❌ NOT DONE | No segment model, no computed criteria. Customers can be searched by name/phone/loyalty card; no campaign grouping. |
| VIP / high-value / lost / frequent-buyer segments | ❌ NOT DONE | No computed segment model or criteria found anywhere in pos-backend. These are not manual tags either — the customer record has no tier or segment field. |

---

## Section 11 — Employee management

| Feature | Verdict | Evidence |
|---------|---------|---------|
| Roles & permissions | ✅ DONE | `userModel.js` roles: admin, manager, waiter, cashier, kitchen, hostess. Full RBAC via `rbacController.js` + `rbacService.js` |
| Clock-in / clock-out | ❌ NOT DONE | Searched for `clock_in`, `clock_out`, `clockIn`, `clockOut`, `timesheet` across all of pos-backend — **zero results**. No model, no controller, no route. |
| Shift tracking (start/end times) | 🟡 PARTIAL | `accountingSessionModel.js` tracks session open/close timestamps per location with staff attribution (`openedBy`, `closedBy`). This is an accounting session, not a proper employee shift record. No break tracking. |
| Sales per employee | ✅ DONE | `reportController.js` line 8: `getStaffReport` in reportService. CRM dashboard shows staff performers ranked by revenue. |
| Cash drawer accountability | ✅ DONE | `accountingSessionModel.js`: `openingFloat`, `closingCountedCash`, `expectedCash`, `discrepancy`, `discrepancyNote`, `cashReconciliationLog[]` (immutable variance audit trail per close). |
| Performance reporting (metrics computed) | ✅ DONE | `reportService.getStaffReport()`: sales count, revenue, tips, averageOrderValue per employee. CRM dashboard renders top-8 staff by revenue. |

---

## Section 12 — Reporting & analytics

| Report | Verdict | Evidence |
|--------|---------|---------|
| Revenue | ✅ DONE | `getSalesReport()` — totalRevenue, orderCount, averageOrderValue, bucketed by hour/day/week/month |
| Profit | 🟡 PARTIAL | `getFoodCostReport()` gives food cost % per dish (revenue vs. ingredient cost). Full P&L page exists (`accounting/pnl/page.tsx`) but uses journal entries — only accurate when Finance integration is active or manual GL entries are posted. No standalone `profit = revenue − full COGS` report in direct mode. |
| Best sellers / worst sellers | ✅ DONE | `getTopItemsReport()` — top items by quantity and revenue with CSV export |
| Category performance | ✅ DONE | `getSalesByCategoryReport()` |
| Hourly sales | ✅ DONE | `getSalesReport({groupBy: 'hour'})` — CRM dashboard hourly chart uses this |
| Daily sales | ✅ DONE | `getSalesReport({groupBy: 'day'})` |
| Employee sales | ✅ DONE | `getStaffReport()` |
| Customer spending | 🟡 PARTIAL | Aggregate top-items and revenue reports exist. No per-customer spending breakdown (total spend, average order value per customer). |

---

## Section 13 — Offline mode

| Item | Verdict | Evidence |
|------|---------|---------|
| Sales creatable offline | ✅ DONE | `src/lib/offline-queue.ts`: IndexedDB-backed mutation queue, 4 types: `create_order`, `patch_order_items`, `pay_order`, `inventory_adjust` |
| Dedup / idempotency on sync | ✅ DONE | `dedupeKey` index in IndexedDB, `makeOfflineSyncKey()` for Order.offlineSyncKey (prevents duplicate creates) |
| Service worker for app shell | ✅ DONE | `public/sw.js`: stale-while-revalidate for `/_next/static/`, `/api/*`, app shell pages `/`, `/pos`, `/dashboard/default` |
| Stock snapshot while offline | ✅ DONE | `offline-stock-mirror.ts`: location-scoped stock snapshot in IndexedDB with fetch timestamp |
| Sync after reconnect | ✅ DONE | `offline-status-banner.tsx`: queue drain on reconnect |
| Actually tested with real connectivity drop | ❌ NOT CONFIRMED | No offline integration test found in `apps/pos-frontend2/`. No test file simulating network loss and queue replay. |

---

## Section 14 — Hardware integration

| Hardware | Verdict | Evidence |
|----------|---------|---------|
| Receipt printers | ✅ DONE | `models/printerModel.js`: types network/usb/bluetooth/epson-epos; drivers: epson, star, tanca, daruma, brother, custom. `controllers/printerController.js` uses `node-escpos` + USB adapter. |
| Barcode scanners | 🟡 PARTIAL | Backend: `GET /api/inventory/scan/:barcode` endpoint exists. Frontend: `inventory-api.ts` `scanInventoryBarcode()` calls it. No frontend barcode event listener (keyboard wedge / camera scan) found in pos-frontend2 source. The API end is wired; the client-side trigger is not confirmed. |
| Cash drawers | ❌ NOT DONE | No ESC/POS drawer-kick command (ASCII 27 112 0), no cash drawer model or controller found in pos-backend. |
| Kitchen printers | 🟡 PARTIAL | `printerModel.js` has kitchen ticket type; `printJobModel.js` + `printJobController.js` + `printWorker.js` exist. Whether kitchen print jobs are automatically triggered on order submission was not confirmed — route wiring not fully traced. |
| Customer displays | ❌ NOT DONE | No customer-facing display protocol (pole display, VFD) found. |
| Self-checkout terminals | ❌ NOT DONE | `controllers/selfOrderController.js` exists (QR self-order / kiosk flow), but this is a web-based self-ordering menu, not an integrated self-checkout terminal with hardware control. |

---

## Section 15 — Omnichannel — single inventory source

| Item | Verdict |
|------|---------|
| All sales channels deduct from same inventory | ❌ NOT DONE |
| Online store channel | ❌ NOT DONE |
| Social commerce channel | ❌ NOT DONE |
| Invoice channel | 🟡 PARTIAL (accounting invoices exist in POS; not an external channel) |
| Mobile app channel | ❌ NOT DONE |

**Evidence:** No omnichannel integration code exists. `controllers/selfOrderController.js` is a QR-based in-store guest ordering flow that routes through the same POS order pipeline (same inventory). There is no webhook, API integration, or event bus connecting to an external ecommerce platform, marketplace, or social commerce channel. The POS is a single-channel system. Any marketing description of "omnichannel" is not reflected in the codebase.

---

## Section 16 — Security & compliance

| Item | Verdict | Evidence |
|------|---------|---------|
| Audit logs (actually populated) | ✅ DONE | `PosAuditLog.create()` called in: `authController.js` (login/logout, lines 299/391), `orderController.js` (order events, lines 112/128), `inventoryController.js` (adjustments, line 65), `accountingController.js` (GL writes, line 752), `staffController.js` (staff create, line 131), `splitBillController.js` (line 115). Schema: org, location, user, action, metadata, IP. |
| User activity tracking | ✅ DONE | Auth events logged with IP address via `posAuditLogModel.js`. |
| Secure payments | 🟡 PARTIAL | Razorpay integration in `controllers/paymentController.js`: order creation, HMAC-SHA256 signature verification. No raw card data touches POS servers. **Note: Razorpay is India-specific** — not suitable for all markets. |
| PCI compliance | 🟡 PARTIAL | Razorpay offloads card capture (PCI DSS scope reduction). No raw card numbers, CVVs, or track data stored. **No saved card tokenization** (see CRM Section 10). |
| Refund tracking | ✅ DONE | `creditNoteModel.js`, `models/creditNoteModel.js`. `void_receipt` and `partial_refund` outbox events. Refunds linked to original order. |
| Cash reconciliation | ✅ DONE | `accountingSessionModel.js`: `cashReconciliationLog[]` immutable audit trail, `discrepancy`, `discrepancyNote`. Accounting session close generates a journal entry (`closeJournalEntry`). |

---

## Section 17 — AI features

| Feature | Verdict |
|---------|---------|
| AI inventory forecasting | ❌ NOT DONE — no model, no code |
| AI purchasing recommendations | ❌ NOT DONE — no model, no code |
| AI fraud analysis | ❌ NOT DONE — `fraudReviewCaseModel.js` exists (manual severity flag with `signal` string), no ML detection |
| AI finance assistant | ❌ NOT DONE — no model, no code |
| AI operations assistant | ❌ NOT DONE — no model, no code |
| AI employee performance coaching | ❌ NOT DONE — no model, no code |

**Search result:** Grepping all of `apps/pos-backend` for `openai`, `anthropic`, `llm`, `forecast`, `machine.learn`, `neural` returns zero relevant matches. The `fraudReviewCaseModel.js` is a plain Mongoose document for manually flagged cases — it has `signal`, `severity`, and `status` fields but no detection logic whatsoever.

---

## Section 18 — Final verdict

### POS as standalone product

POS is **functionally near-production-ready for core retail operations**: sales, multi-location inventory with FIFO lot tracking, variants, barcodes, purchase orders, customer management with loyalty, full double-entry accounting (chart of accounts, GL, P&L, AR, AP, bank reconciliation), scheduled reports, stock alerts, cash drawer reconciliation, receipt printing, role-based access, and offline queuing.

**What makes it not fully production-ready standalone:**

- No employee clock-in/clock-out or shift management (labor compliance impossible)
- No saved card tokenization for customer CRM
- No customer spending analytics or marketing segments
- Offline mode untested against real connectivity drops
- Barcode scanner and kitchen printer automation not fully verified end-to-end
- Razorpay is the only payment gateway — India-only; no multi-processor support

### POS↔Finance integration

The integration **mechanism is architecturally sound**: idempotent outbox pattern, relay-mode flag to suppress double-posting, Finance bridge UI for mapping. The outbox covers all critical event types. However, it is **not production-safe in current form** because:

1. The POS accounting UI does not adapt to relay mode — users see GL write buttons that 403 at the API level, with no guidance to use Finance instead.
2. Both POS and Finance maintain separate inventory stores — sync drift is a real and unsuppressed risk with no reconciliation alert.

---

### Top 5 highest-risk gaps

| Rank | Risk | Section | Why it matters |
|------|------|---------|----------------|
| 1 | **Dual inventory stores with drift risk** | §4, §6 | POS and Finance each hold stock counts. If the outbox worker is down or misconfigured, counts diverge silently. No reconciliation check exists. Financial statements will be wrong. |
| 2 | **POS UI does not adapt to relay mode** | §4 | When Finance is provisioned, the POS accounting UI still shows GL write buttons. Users will hit 403 errors without understanding why. In relay mode, `requireAccountingDirectMode` blocks at the API level only — no proactive UI guidance exists. This is a UX defect that will generate support tickets on every dual-provisioned tenant. |
| 3 | **No employee clock-in/clock-out** | §11 | Zero implementation. If labor hour tracking, overtime compliance, or payroll integration is in scope, this is a complete gap. Accounting sessions approximate a shift open/close but are not per-employee and have no break tracking. |
| 4 | **Razorpay only (India-specific) / no saved card tokenization** | §16, §10 | The payment processor is hard-coded to Razorpay, making POS non-deployable in markets outside India without significant work. There is no framework for saving card tokens for customer-on-file charging. |
| 5 | **No omnichannel — single-channel inventory** | §15 | If POS is marketed as omnichannel, the codebase does not support it. There is no ecommerce, social, or invoice-channel integration. All sales go through the POS order pipeline only. Any channel that bypasses POS does not deduct from POS inventory. |
