# POS + Bigcapital Integration Audit

**Date:** 2026-05-23  
**Scope:** Read-only mapping of `services/posnew` (POS) and `services/stockix-finance` (Bigcapital). No integration bridge code was found in-repo.

---

## Executive Summary

**POS** has a mature restaurant inventory stack (ingredients, recipes/BOM, location balances, stock movements, PO → GRN receiving, FIFO/LIFO/WA costing) and a **native general ledger** that posts revenue and COGS when an order becomes `paid`. Stock deduction is **always on payment** (synchronous, often inside the same MongoDB transaction as GL posting).

**Bigcapital (stockix-finance)** has full ERP primitives: inventory items with `costPrice` / `sellPrice`, warehouse quantities, sale receipts with required `customerId`, inventory transactions on closed receipts, and COGS GL via `InventoryCost` (FIFO / LIFO / AVG).

**What is missing for POS ↔ Bigcapital integration:**

| Area | Status |
|------|--------|
| POS → Bigcapital sale push on paid order | ❌ Not implemented |
| POS native GL disable / external accounting flag | ❌ No `bigcapital*` flags in code |
| `IntegrationConfig`, item/customer mapping models | ❌ Not in `pos-backend/models` |
| `bigcapitalSyncWorker`, `integrationRoute` | ❌ Not present |
| `InternalPos.controller` / `POST /api/internal/pos/receipts` | ❌ Not present |
| Shared product master (POS ingredient ↔ BC item) | ❌ Separate domains |
| Drizzle integration tables in `packages/db` | ❌ Not found |

**Verdict:** Inventory and accounting work **independently** in each system today. End-to-end “burger scenario” works inside POS only; automatic Bigcapital sale + COGS + inventory requires **new bridge work**.

---

## POS Inventory System

### 1.1 Ingredient / stock models

All inventory models below use **`orgScopePlugin`** → field `organization` (ObjectId → `Organization`), indexed. API handlers typically filter via `assertTenantOrganization(req)` and `req.tenantOrganizationId`.

#### `Ingredient` (`ingredientModel.js`)

| Field | Notes |
|-------|--------|
| `name`, `sku`, `description`, `category` | Catalog |
| `location` | Required; primary location ref |
| `status` | `active` \| `archived` |
| `unit` | `g`, `kg`, `ml`, `l`, `piece` |
| `purchaseUnit`, `purchaseToStockFactor` | Purchase UOM conversion |
| `currentStock` | Denormalized total on hand |
| `reorderThreshold`, `reorderQuantity`, `safetyStockLevel`, `maximumStockLevel` | Planning / alerts |
| `unitCost`, `averageUnitCost`, `lastPurchaseUnitCost` | Costing |
| `isSerialTracked`, `serialNumberFormat`, `barcode` | Traceability |
| `isAutoReorder`, `isDropshipOnly`, `leadTimeDays`, `minimumOrderQuantity` | Ops |
| `tags`, `shelfLifeDays`, `packagingType` | Metadata |
| `supplier` | Deprecated string; prefer `IngredientSupplier` |

**Relationships:** `IngredientCategory`, `Location`, suppliers via `ingredientSupplierModel`.

#### `StockBalance` (`stockBalanceModel.js`)

Per **location × ingredient** (optional `bin`):

| Field | Notes |
|-------|--------|
| `location`, `ingredient` | Required |
| `quantity` | On hand in ingredient stock unit |
| `reservedQty` | Open checks / pending orders |
| `incomingQty` | From open POs |
| `maxStockLevel`, `bin`, `lastInventoriedAt`, `lastMovedAt` | Planning / audit |

Unique index: `{ organization, location, ingredient, bin }`.

#### `Recipe` (`recipeModel.js`)

| Field | Notes |
|-------|--------|
| `menuItem` | Required |
| `menuItemVariant` | Optional; unique per menu item + variant |
| `ingredients[]` | Lines: `ingredient` **or** `subMenuItem`, `quantity`, `optional` |

**Relationships:** `MenuItem`, `MenuItemVariant`, nested recipes via `subMenuItem`.

#### `StockMovement` (`stockMovementModel.js`)

| Field | Notes |
|-------|--------|
| `ingredient`, `delta` (+ in / − out), `balanceAfter` | Ledger row |
| `movementType` | `sale`, `wastage`, `refund`, `adjustment`, `receive`, `transfer` |
| `reason` | e.g. `order_deduction`, `sale`, `receive`, `manual_adjust`, … |
| `order`, `orderLineId`, `wastageEntry`, `reversesMovement` | Links |
| `costAmount`, `extendedValue` | COGS at movement time |
| `location`, `counterLocation`, lot/serial fields | Location + traceability |

#### `PurchaseOrder` (`purchaseOrderModel.js`)

| Field | Notes |
|-------|--------|
| `reference`, `supplier`, `location`, `status` | `draft` → `confirmed` → `partial` → `received` → `cancelled` |
| `lines[]` | `ingredient`, `quantityOrdered`, `quantityReceived`, `quantityBilled`, `unitCost` |
| `vendorBill`, `threeWayMatchStatus`, `isDropship`, `customerOrder` | AP / dropship |

#### `GoodsReceiptNote` (`goodsReceiptNoteModel.js`)

| Field | Notes |
|-------|--------|
| `organization`, `purchaseOrder`, `supplier`, `location`, `receivedBy` | Header |
| `status` | `draft`, `confirmed`, `qc_pending`, `qc_failed`, `cancelled` |
| `lines[]` | `ingredient`, `purchaseOrderLineId`, `quantityExpected`, `quantityReceived`, `unitCost`, lot/QC fields |
| `journalEntry` | Optional GRNI accrual link |

**Other related models:** `inventoryCostLayerModel`, `stockLotModel`, `orderStockReservationModel`, `supplierModel`, `wastageEntryModel`, `stockTakeSessionModel`.

---

### 1.2 Recipe → ingredient connection

- **MenuItem** does **not** embed a recipe id. BOM is stored in **`Recipe`** keyed by `menuItem` (+ optional `menuItemVariant`).
- `menuItemModel.inventoryImpact`: `stockable` (default) \| `consumable` \| `service`.
- `finishedGoodsIngredient`: optional direct 1:1 ingredient deduction (qty = line qty) instead of recipe.
- **Demand resolution:** `inventoryRecipeUtils.js` → `flattenRecipeDemand` / `resolveStockableDemand` (nested `subMenuItem`, max depth 12, cycle detection).
- **Recipe API:** `/api/recipes` — `GET /`, `GET /by-menu-item/:menuItemId`, `POST /` (upsert), `DELETE /by-menu-item/:menuItemId`.

**Order linkage:** Order line subdocs reference `menuItem`; deduction uses `line.menuItem` + `line.menuItemVariant` + `line.quantity`. No `recipeId` on the order line.

---

### 1.3 Stock deduction on sale

| Question | Answer |
|----------|--------|
| Automatic on payment? | **Yes** — `processStockAfterPayment` in `inventoryService.js` |
| Trigger | `orderStatus` transitions to **`paid`** (previous ≠ `paid`) |
| Kitchen-send deduction? | **Disabled** — `processStockAfterStatusPatch` / `processStockAfterItemsPatch` are no-ops; comment: “always payment” |
| Config | `inventorySettingsService` hardcodes `stockDeductTrigger: "payment"`; `AccountingConfig.stockDeductTrigger` is audit-only |
| Sync vs async | **Synchronous** in request path; on paid transition often inside **`mongoose.startSession().withTransaction`** with GL (`orderController.patchOrderStatus`) |
| Fields updated | `StockBalance.quantity`, `Ingredient.currentStock`, `StockMovement` rows, cost layers via `inventoryCostService.consumeIngredientCost`, `line.stockDeductedAt` |
| Line flag | `stockDeductedAt` prevents double deduction |

**Call chain:** `PATCH /api/orders/:id/status` → `processStockAfterPayment` → `deductForOrderLine` per line → recipe demand → negative `StockMovement` (`reason: "sale"`).

---

### 1.4 Purchase orders and stock receiving

| Capability | Exists? | Details |
|------------|---------|---------|
| Create PO | ✅ | `POST /api/purchase-orders` |
| Confirm / cancel | ✅ | `POST /api/purchase-orders/:id/confirm`, `/cancel` |
| Receive against PO | ✅ (via GRN) | `POST /api/purchase-orders/:id/receive` **creates draft GRN only** (does not post stock) |
| GRN CRUD + confirm | ✅ | `/api/goods-receipt-notes` — `confirmGRN` in `grnService.js` posts stock |
| Receiving updates balance | ✅ | `stockBalanceService.applyQuantityDelta`, `inventoryCostService.addReceiveCost`, `StockMovement` reason `receive` |
| GRNI accrual | ✅ | Optional journal via `accountingService` on confirm |

**Stock balance record shape:** `{ organization, location, ingredient, quantity, reservedQty, incomingQty, bin, … }` — quantity in **ingredient `unit`**.

---

### 1.5 Current stock balance check

| Mechanism | Path / behavior |
|-----------|-----------------|
| Per-location balances | `GET /api/inventory/balances` |
| Ingredient denormalized | `Ingredient.currentStock` |
| Low stock | `GET /api/inventory/low-stock` — `currentStock <= reorderThreshold` |
| Alerts | `POST /api/inventory/alerts/run`, scheduler via `inventoryAlertService` |
| Manual add (e.g. 100 kg meat) | `POST /api/inventory/adjust` — body: `ingredientId`, `quantityDelta` or `purchaseQty`, `reason` (`manual_adjust`, `receive`, …), optional `locationId`, `unitCost` |

---

### 1.6 POS native accounting (candidate to disable for Bigcapital)

**Service:** `accountingService.js`  
**Config:** `accountingConfigModel.js`

| Flag / field | Default | Behavior |
|--------------|---------|----------|
| `autoPostOnPaid` | `true` | Calls `postOrderSaleLedger` on first `paid` |
| `autoPostCogsOnPaid` | `true` | Posts COGS journal (`sourceType: "order_cogs"`) |
| `bigcapitalIntegrationEnabled` / `skipNativeGL` | **Not found** | No code path to skip native GL for external finance |

**Default chart (POS org-scoped `AccountingAccount`):**

| Code | Name | Type |
|------|------|------|
| `1000` | Cash on hand | asset |
| `1010` | Card clearing | asset |
| `1200` | Inventory asset | asset |
| `4000` | Food & beverage revenue | revenue |
| `5100` | COGS — inventory | expense |
| `2000` / `2011` | Sales tax payable | liability |
| … | AP, GRNI (`2130`), gift cards, tips, etc. | |

**On paid:** `onOrderBecamePaid` → sale ledger (Dr cash/card/AR, Cr revenue, tax) + optional COGS (Dr `5100`, Cr `1200`) from recipe/movement costs. Results stored on order: `accountingSaleStatus`, `accountingCogsStatus`, errors, timestamps.

**To use Bigcapital as system of record:** need new flag + guard around `onOrderBecamePaid` / `postOrderSaleLedger` / `postOrderCogsLedger` (not present today).

---

### 1.7 POS API endpoints relevant to integration

| Endpoint | Purpose |
|----------|---------|
| `GET /api/accounting/export/integration.json` | **Exists** — exports POS journal entries (`format: "pos-gl-v1"`), not a live Bigcapital feed |
| `POST /api/accounting/sync/ack` | Offline batch ack (`AccountingSyncLog`) |
| `PATCH /api/orders/:id/status` | Payment / `orderStatus: "paid"` — runs stock + native GL |
| `GET/PUT /api/accounting/config` | `autoPostOnPaid`, `autoPostCogsOnPaid`, account mappings |
| Webhook on paid order | **No** — `orderController` does not enqueue `WebhookOutbox`; platform webhooks are separate (`/api/platform/v1/webhooks/*`) |

**Paid order response:** `200` with `{ success, message, data: populatedOrder, accountingPosting: { sale, cogs, … } }`.

---

## Bigcapital Inventory System

### 2.1 Items / products

**Model:** `Items/models/Item.ts` — table `items`

| Field | Purpose |
|-------|---------|
| `name`, `code` | Identity / SKU |
| `type` | `service` \| `non-inventory` \| `inventory` |
| `sellable`, `purchasable` | Flags |
| `costPrice`, `sellPrice` | **Yes** — both exist |
| `costAccountId`, `sellAccountId`, `inventoryAccountId` | GL mapping per item |
| `quantityOnHand` | On item (inventory type); also per-warehouse |
| `categoryId`, tax rate ids, `currencyCode` | Catalog / tax |

**API:** `ItemsController` @ `/items` → with global prefix **`/api/items`**

- `GET /api/items`, `GET /api/items/:id`
- `POST /api/items` (`CreateItemDto`)
- `PUT /api/items/:id`, `DELETE`, bulk operations

---

### 2.2 Inventory tracking

| Feature | Exists? |
|---------|---------|
| Quantity tracking | ✅ `quantityOnHand` + `items_warehouses_quantity` (`ItemWarehouseQuantity`) |
| FIFO / LIFO / AVG | ✅ `InventoryCost` module — `TCostMethod = 'FIFO' \| 'LIFO' \| 'AVG'` |
| COGS on sale | ✅ Sale receipt closed → inventory transactions → cost lots → `SaleReceiptCostGLEntriesSubscriber` on `inventory.onCostLotsGLEntriesWrite` |
| Warehouses | ✅ `Warehouses` module; optional `warehouseId` on receipt header and line entries |

**Not the same as POS:** Bigcapital tracks **Items**, not restaurant **Ingredients** / recipes.

---

### 2.3 Sale receipts API

**Controller:** `SaleReceiptsController` @ `sale-receipts` → **`/api/sale-receipts`**

**`POST /api/sale-receipts`** body (`CreateSaleReceiptDto` / `CommandSaleReceiptDto`):

| Field | Required? |
|-------|-----------|
| `customerId` | **Yes** (`@IsNotEmpty`) |
| `depositAccountId` | **Yes** (cash/bank account for receipt) |
| `receiptDate` | **Yes** |
| `entries[]` | **Yes** (min 1) — each: `itemId`, `rate`, `quantity`; optional `taxCode`, `taxRateId`, `warehouseId`, discount |
| `closed` | Boolean (default `false`) — inventory GL often needs **closed** receipt |
| `warehouseId`, `branchId` | Optional header-level |
| `exchangeRate`, `receiptNumber`, `referenceNo`, discounts | Optional |

**Inventory impact:** Subscribers write inventory transactions when `saleReceipt.closedAt` is set (`SaleReceiptWriteInventoryTransactions`).

---

### 2.4 Internal API for POS integration

**`InternalPos.controller.ts`:** **NOT FOUND**

**`InternalModule` controllers:**

- `InternalController` — `POST /api/internal/attach-user-to-tenant`
- `InternalProvisionController`, `InternalOrgController`, `InternalUsersController`, `InternalLicenseController`

**`POST /api/internal/pos/receipts`:** **Not implemented**

---

### 2.5 Items API for product sync

| Operation | Endpoint |
|-----------|----------|
| List | `GET /api/items` |
| Create | `POST /api/items` |
| Response | `ItemResponseDto` — includes prices, accounts, type, quantities (via transformer) |

---

### 2.6 Customers API

**Controller:** `CustomersController` @ `customers` → **`/api/customers`**

- `GET /api/customers`, `GET /api/customers/:id`
- `POST /api/customers`, `PUT /api/customers/:id`

Sale receipts require a **customer id** — plan a walk-in / POS default customer in Bigcapital.

---

### 2.7 Chart of accounts (seed defaults)

From `database/tenant/seeds/data/accounts.ts` (slug → type):

| Slug | Code | Type | Use |
|------|------|------|-----|
| `bank-account` | 10001 | bank | Cash-like deposits |
| `petty-cash` | 10004 | cash | |
| `inventory-asset` | 10008 | inventory | Stock asset |
| `accounts-receivable` | 10007 | accounts-receivable | |
| `accounts-payable` | 20001 | accounts-payable | |
| `cost-of-goods-sold` | 40002 | cost-of-goods-sold | **COGS** |
| `sales-of-product-income` | (see seed) | income | Revenue |
| `tax-payable` | 20006 | tax-payable | |

Account IDs are **per-tenant numeric** after seed — mappings must be resolved at runtime per organization, not hard-coded globally.

---

## Integration Layer Status

### 3.1 IntegrationConfig / mapping models (POS)

| File | Status |
|------|--------|
| `integrationConfigModel.js` | **NOT FOUND** |
| `integrationItemMappingModel.js` | **NOT FOUND** |
| `integrationCustomerMappingModel.js` | **NOT FOUND** |

### 3.2 Sync worker / routes (POS)

| File | Status |
|------|--------|
| `workers/bigcapitalSyncWorker.js` | **NOT FOUND** |
| `routes/integrationRoute.js` | **NOT FOUND** |

Workers present: `platformWorker`, `printWorker`, `recurringJournalWorker`, `recurringInvoiceWorker`.

### 3.3 Accounting disable flag

No matches for `bigcapitalIntegrationEnabled`, `bigcapital_integration`, or `externalAccounting` under `pos-backend`.

### 3.4 Provisioning (POS + Finance)

| Component | Status |
|-----------|--------|
| `infra/pos-tenant-stack/docker-compose.yml` | ✅ pos-backend, pos-frontend, mongo, redis |
| `infra/tenant-stack/docker-compose.yml` | ✅ Finance (nginx, server, webapp, mysql, redis, …) |
| `provisionPosStack` | ✅ `infra/worker-service/src/module-stacks.ts` when tenant modules include `pos` |
| Finance stack | ✅ `shouldProvisionFinanceStack` when modules include `accounting` |
| Module gating | `PROVISION_MODULE_GATING=1` |

### 3.5 `packages/db`

No `integration`, `itemMapping`, `posMapping`, or `bigcapital` references in Drizzle schema (grep on `packages/db/src`).

**Note:** `accountingSyncLogModel` in POS is for **offline GL batch ack**, not Bigcapital sync.

---

## Gap Analysis

### 4.1 POS side

| Feature | Exists? | Notes |
|---------|---------|-------|
| Ingredient model | ✅ | Full UOM, costing, location |
| Recipe model (ingredient BOM) | ✅ | Nested sub-menu items |
| Stock balance model | ✅ | Per location + reserved/incoming |
| Stock deduction on payment | ✅ | Sync; transactional with GL |
| Purchase orders | ✅ | Full lifecycle |
| Goods receipt | ✅ | GRN confirm posts stock |
| Native GL disable flag | ❌ | Only `autoPostOnPaid` / `autoPostCogsOnPaid` |
| IntegrationConfig model | ❌ | |
| Item mapping model | ❌ | |
| Bigcapital sync worker | ❌ | |
| Integration API routes | ❌ | Export JSON is POS GL only |

### 4.2 Bigcapital side

| Feature | Exists? | Notes |
|---------|---------|-------|
| Items API (GET/POST) | ✅ | `/api/items` |
| Sale receipts API | ✅ | `/api/sale-receipts`; `customerId` required |
| Internal POS endpoint | ❌ | |
| COGS calculation | ✅ | On closed inventory receipts |
| Inventory tracking | ✅ | Items + warehouses + cost lots |
| Walk-in customer | ⚠️ | API supports customers; no POS-specific default in code |
| Default accounts (COGS/Revenue) | ✅ | Seeded per tenant; numeric ids |
| Branch/warehouse support | ✅ | Optional on receipts / lines |

### 4.3 Infrastructure

| Feature | Exists? | Notes |
|---------|---------|-------|
| POS tenant Docker stack | ✅ | `infra/pos-tenant-stack` |
| Finance tenant Docker stack | ✅ | `infra/tenant-stack` |
| Module-aware provisioning | ✅ | `accounting` / `pos` modules |
| Shared Redis for queues | ⚠️ | Separate Redis per stack (pos-redis vs finance stack) |
| Integration env vars | ❌ | No POS→Finance URL/secret in pos-backend |

---

## Must Build (blocking integration)

1. **Bridge service / worker** — On POS order `paid`, map lines to Bigcapital `itemId`s and `POST /api/sale-receipts` (or internal POS endpoint).
2. **`IntegrationConfig` + mappings** — Store Finance base URL, API credentials, default `customerId`, `depositAccountId`, menu-item ↔ item map.
3. **Native GL guard** — When external finance enabled, set `autoPostOnPaid: false` (and COGS) or skip `onOrderBecamePaid`.
4. **Default walk-in customer + deposit account** — Per-tenant Bigcapital setup for receipt creation.
5. **Idempotency** — Key on POS `order._id` to avoid duplicate receipts.
6. **Product master strategy** — POS ingredients/recipes ≠ BC items; either sync menu items as BC items or map only “financed” SKUs.
7. **`InternalPos` API (optional)** — Simpler auth than user JWT for worker-to-worker calls.

## Already Built (no work needed)

1. POS ingredient/recipe/stock/PO/GRN/costing — production-grade.
2. POS paid-order hook point — `onOrderBecamePaid` + transactional `patchOrderStatus`.
3. Bigcapital sale receipts, items, customers, inventory COGS — standard ERP flow.
4. Tenant provisioning for POS and Finance stacks.
5. `GET /api/accounting/export/integration.json` — useful for GL migration, not live sync.

## Nice to Have (not blocking)

1. Bidirectional stock sync (POS ingredient qty → BC item qty).
2. Tenant webhook `order.paid` for third-party integrators.
3. Shared Redis / queue between stacks for cross-service jobs.
4. Drizzle audit tables for sync state in `packages/db`.

---

## The Burger Scenario — Can It Work Today?

Assume: ingredient **meat** in unit **kg**, recipe **Burger** = 0.1 kg (100 g) meat per serving, menu item **Burger** linked to recipe.

| Step | Status | What exists / what is missing |
|------|--------|------------------------------|
| 1. Add 100 kg meat to POS stock | ✅ | Create `Ingredient` (`unit: "kg"`). `POST /api/inventory/adjust` with `quantityDelta: 100` (or receive via PO→GRN). Updates `StockBalance` + `currentStock`. |
| 2. Create Burger recipe (100 g meat) | ✅ | `POST /api/recipes` with line `{ ingredient, quantity: 0.1 }` for `menuItem` = Burger. |
| 3. Sell 1 burger at POS | ✅ | Order flow; `PATCH /api/orders/:id/status` with `orderStatus: "paid"`. |
| 4. POS deducts 100 g from stock | ✅ | `processStockAfterPayment` → `deductForOrderLine` → −0.1 kg movement. |
| 5. Sale posts to Bigcapital automatically | ❌ | No bridge; POS posts to **native** GL only. |
| 6. COGS posted in Bigcapital | ❌ | Requires BC sale receipt for a mapped **inventory item** with costing; not triggered from POS. |
| 7. Stock value updated in Bigcapital | ❌ | BC `quantityOnHand` unrelated to POS meat ingredient unless separate item + receipt sync built. |

---

## Final Verdict

| | |
|--|--|
| **Ready to integrate** | **NO** — both sides are capable alone; **connector layer is absent**. |
| **Estimated gaps to close** | (1) Config + mappings, (2) paid-order outbound sync worker, (3) disable/skip native GL when Finance is source of truth, (4) BC customer + item bootstrap, (5) idempotent receipt API integration, (6) optional internal POS endpoint + env wiring in tenant stacks. |

**Recommended first vertical slice:** Paid POS order → single mapped BC inventory item (Burger) + walk-in customer → `POST /api/sale-receipts` with `closed: true` → verify COGS + inventory in Finance UI; keep POS stock deduction as operational kitchen inventory until a deliberate two-way product strategy is defined.
