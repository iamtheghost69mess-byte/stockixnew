# POS Module — Technical Audit Report

**Scope:** `apps/pos-frontend2` (POS UI), `apps/pos-backend` (orders, inventory, accounting, printing, reports).  
**Stack note:** Orders use **MongoDB/Mongoose** (`Order`, `Table`, etc.), not Prisma. Accounting and inventory are integrated through services on this backend.

**Legend**

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented |
| ⚠️ | Partially implemented |
| ❌ | Missing |
| 🔴 | Broken |
| 🔗 | Not connected (backend vs UI or module gap) |

---

## A. Implemented features (summary)

- **Restaurant-style POS:** Floor/table selection, open order per table, cart, categories, product grid, search, table transfer API, kitchen item statuses in model.
- **Catalog & pricing:** Menu items/categories from POS catalog APIs; bills use server `recalcOrderTotals` with tax codes from menu items + `AccountingConfig` (`apps/pos-backend/utils/orderTotals.js`).
- **Payments (simple):** Single tender via `PATCH /api/orders/:id/status` with `orderStatus: "paid"` and `paymentMethod` (`cash` \| `card` \| `manual` from UI). Cash change calculated client-side (`pos-payment-dialog.tsx`).
- **Tax:** Server-side per-line tax (inclusive/exclusive) and `bills.taxLines`; client preview via `calculateOrderBills` (`pos-bill-utils.ts`).
- **Inventory (recipe / ingredient model):** Deduction on kitchen send or on pay per `inventorySettings` (`inventoryService.js` — `shouldDeductOnKitchenSend` / `shouldDeductOnPayment`). Reservations on open orders (`orderReservationService.js`). Strict oversell checks in `use-pos-session.ts` using `fetchInventoryMenuAvailability`.
- **Stock movements:** `order_deduction` and reversals with `StockMovement` (`inventoryService.js`).
- **Accounting on pay:** `onOrderBecamePaid` → `postOrderSaleLedger` + `postOrderCogsLedger`; outcomes on order (`accountingSaleStatus`, `accountingCogsStatus`) (`accountingService.js`, `orderModel.js`).
- **Multi-tender / AR (backend):** `paymentSplits`, `billingMode: immediate | on_account` on order schema; `validateOrderPaymentSplitsForPay` (`orderPaymentSplits.js`). Loyalty redemption fields on pay path (`orderController.js` `patchOrderStatus`).
- **Manual discount (backend):** `POST /api/orders/:id/manual-discount` + `DiscountAudit` (`orderController.js`, `orderRoute.js`).
- **Offline (partial):** IndexedDB queue for create/patch cart (`offline-queue`, `pos-check-sync.ts`, `OfflineStatusBanner`). Server batch `POST /api/orders/sync` with `offlineSyncKey` dedupe (`orderController.js` `syncOfflineOrders`).
- **Printing infrastructure:** `orderPrinting.js` (ESC/POS, jobs, Bluetooth dispatch), category `printerAssignment`, `markAllItemsSent` path prints new lines (`patchOrderStatus`), void snapshots (`printCancelledSnapshots`).
- **Reports (backoffice API):** `/api/reports/sales`, `top-items`, `payment-methods`, `staff`, `tables`, `discount-audit` (`reportRoute.js`) — **not** mounted under POS routes; require backoffice staff + location scope.
- **Accounting sessions (cash drawer / Z-style):** `POST /api/accounting/sessions/open`, `POST .../close` (`accountingRoute.js`); UI on **dashboard** `accounting/sessions/page.tsx`, **not** in `/pos` flow.
- **Refund GL (finance):** `POST /api/accounting/refunds/:orderId` (`accountingController.js` `postRefund`); UI on **dashboard** `accounting/order-gl/page.tsx`.
- **Mobile / responsive:** POS table session uses stacked layout on small screens, collapsible categories on `md+`, fixed cart height on mobile (`pos-table-session-page.tsx`, `pos-floor-page.tsx`).

---

## 1. Core POS features checklist

| Feature | Status | Notes |
|---------|--------|-------|
| Product search | ✅ | `pos-product-grid.tsx` + `search` state in `pos-table-session-page.tsx` |
| Barcode scanning | ⚠️ | Sales: menu **variant** barcodes only (`normalizeInventoryBarcodeScan` in `use-pos-session.ts`). Ingredients rejected for sale scan. |
| Cart system | ✅ | `pos-order-store.ts`, sync `persistPosCheckToServer` |
| Quantity adjustment | ✅ | `setLineQuantity` + +/- in `pos-cart-sidebar.tsx` |
| Price override | ❌ | No UI; `recalcOrderTotals` prefers **menu item** prices when `menuItem` exists — line `pricePerQuantity` from patch is not used in that branch (`orderTotals.js`) |
| Discount handling | ⚠️ | Server: `manualDiscountAmount`, loyalty on pay. **POS UI:** no manual discount, no loyalty (`pos` app) |
| Tax handling | ✅ | Server recalc + client preview |
| Multiple payment methods | ⚠️ | Backend `paymentSplits`; **POS sends only `paymentMethod`** (`pos-order-api.ts` `posMarkOrderPaid`) |
| Split payments | ❌ | No UI; API supports splits if client sent them |
| Partial payments | ❌ | Pay closes order as `paid` in full |
| Cash / card / “manual” | ✅ | `pos-payment-dialog.tsx` |
| Customer selection | ❌ | Walk-in `customerDetails` default in `posCreateOrder`; no customer picker in `/pos` |
| Hold sale / resume | ⚠️ | **Implicit:** open order on table; no named “hold” or park-sale |
| Refunds (sales) | 🔴 | Dialog exists but **does not call backend** (see §12) |
| Exchange | ❌ | Not found |
| Order notes | ⚠️ | Line `note` in schema/store; **no per-check note field** in POS UI beyond line notes |
| Table management | ✅ | Floor, create table, sections, branch scope (`pos-floor-page.tsx`, `tableModel`) |
| Shift open/close | ⚠️ | **Accounting “sessions”** exist; not wired into POS terminal flow |
| Cash drawer | ⚠️ | Same as sessions / GL; no dedicated drawer open/close in POS UI |
| Receipt printing | ✅ | `POST /api/order/:id/print` + `composeCustomerReceipt` (`orderPrinting.js`); POS resolves printer via `pickDefaultThermalReceiptPrinterId` |
| Bluetooth / WiFi printing | ⚠️ | Infra + dashboard printer setup + socket `printer:register`; POS print path now hits `printOrderDocument` |
| Email receipt | ❌ | No implementation in POS |(NOT NEEDED)
| Offline sales | ⚠️ | Queue for cart sync; **pay while offline not implemented**; `offlineSyncKey` not set on normal `posCreateOrder` |
| Multi-register | ❌ | No register id on orders |
| Multi-branch | ⚠️ | `Location` scope on tables/user; floor branch picker when user has no fixed location (`pos-floor-page.tsx`) |

---

## 2. Inventory integration

| Check | Status | Evidence |
|-------|--------|----------|
| Reduce stock after sale | ✅ | `processStockAfterPayment` / `processStockAfterStatusPatch` → `deductForOrderLine` (`inventoryService.js`) |
| Restore after void/cancel | ✅ | `restoreStockForOrderLine`, `deleteOrder`, cancelled status (`orderController.js`) |
| Reserved stock | ✅ | `orderReservationService.js` |
| Variant stock | ⚠️ | `menuItemVariant` on line schema; POS cart uses `menuItem` id — variant-level POS selling not surfaced in audited POS UI |
| Serial / batch at POS sale | ⚠️ | Movements carry lot fields when applicable; **no POS UI to pick serials** for a line |
| Warehouse selection | ⚠️ | Uses order/table `location` + `stockBalanceService`; no explicit warehouse picker on check |
| Low stock after sale | ✅ | `emitPos` `inventory:low-stock` from `processStockForLineIds` |
| Movement logging | ✅ | `StockMovement` create on deduct/restore |
| Negative stock prevention | ⚠️ | `strictOversell` + `assertOrderLinesFulfillable`; if off, oversell possible per settings |

**Frontend ↔ backend:** ✅ `fetchInventoryMenuAvailability`, `normalizeInventoryBarcodeScan`, `useInventoryPosPolicyQuery`, order patch/create APIs.

---

## 3. Accounting integration

| Check | Status | Evidence |
|-------|--------|----------|
| Sale journal on pay | ✅ | `onOrderBecamePaid` → `postOrderSaleLedger` |
| Tax in GL | ✅ | Part of sale ledger / tax lines on order |
| Discount in GL | ⚠️ | Manual + loyalty adjust `bills.totalWithTax` before posting (`patchOrderStatus`); must match config |
| Payment / AR entries | ✅ | `billingMode`, `paymentSplits` in sale posting (`accountingService.js`) |
| Refund reverses | ⚠️ | `postOrderRefund`, `reverseOrderSaleLedger` in **accounting** API — **not** triggered from POS refund button |
| Mapping / double-entry | ✅ | Service + tests (`scripts/accounting-api-check.js`) |
| Day close reconcile | ⚠️ | Session close in dashboard accounting, not POS |

**Tables:** Journal entries, accounting sessions, invoices (AR) exist; POS does not surface AR payment or on-account checkout.

---

## 4. Customer module

| Item | Status |
|------|--------|
| Lookup in POS | ❌ |
| Loyalty at checkout | 🔗 | Backend supports on `PATCH .../status`; **POS never sends** `customer` / `loyaltyPointsRedeemed` / `loyaltyDiscountAmount` |
| Balances / history / credit / invoices / statements | ❌ / dashboard only | No `/pos` wiring |

---

## 5. Payment system

- ✅ Single method + cash received / change (UI).
- ❌ Split / mixed tender in POS (API ready).
- ❌ Online gateway capture in POS flow (Razorpay fields exist on `orderModel` but not used in audited POS UI).
- ❌ Partial pay / unpaid tab: paying sets full `paid`.
- ⚠️ Overpayment: UI allows extra cash for **change** only; `Complete Payment` disabled if received &lt; due (`pos-payment-dialog.tsx`).
- ⚠️ Payment history: per-order only; no POS-facing payment ledger screen.

---

## 6. Printing system

| Item | Status |
|------|--------|
| Receipt / kitchen templates | ✅ | `orderPrinting.js` (`composeKitchenTicket`, etc.) |
| WiFi / network | ✅ | Printer model + TCP / ePOS paths in printing services |
| Bluetooth | ⚠️ | `bluetooth-printer.ts`, dashboard printers page, print worker — **not** the broken POS HTTP path |
| POS `posPrintOrder` | ✅ | `POST /api/order/:id/print` JSON `{ type, printerId? }` → `printOrderDocument` (kitchen → `completeSubmitStationTickets`; receipt → `printCustomerReceipt`) |

**Print jobs:** Bluetooth/USB receipt uses the same `PrintJob` + socket `print:ack` path as kitchen tickets.

---

## 7. Offline mode

| Item | Status |
|------|--------|
| Cart create/patch offline | ⚠️ | Queued; flushed on reconnect (`flushOfflineMutationQueue`) |
| Pay offline | ❌ | No queue for `posMarkOrderPaid` |
| Duplicate prevention | ⚠️ | `offlineSyncKey` on **sync** endpoint only; normal create from POS does not set key |
| Conflict resolution | ❌ | Not implemented beyond version retry on `patchOrderItems` |
| Inventory / accounting sync after reconnect | ⚠️ | Happens when server processes paid order — but offline pay not supported |

---

## 8. Mobile responsiveness

- ✅ Layout breakpoints, touch targets on quantity and pay (`pos-cart-sidebar.tsx`, `pos-table-session-page.tsx`).
- ⚠️ Categories hidden on small screens — acceptable tradeoff; ensure SKU-heavy venues have search (they do).

---

## 9. Database validation (high level)

- **Orders:** `orderSchema` — items, bills, `paymentSplits`, accounting flags, `offlineSyncKey`, `location`, `customer`, discounts (`apps/pos-backend/models/orderModel.js`).
- **No separate `sale_items` SQL table** — embedded `items[]`.
- **Payments:** `paymentMethod` + `paymentSplits`; no distinct `payments` child collection in this schema.
- **Shifts:** Use **AccountingSession** model via accounting routes, not `Order`.
- **Receipts:** Print jobs collection / worker, not a dedicated receipt row per sale in audited path.
- **FKs:** Mongoose refs + app-level scoping (`organization`, `location`).
- **Orphans:** Possible if table `currentOrder` desyncs — `getOpenOrderForTable` has cleanup when order missing.

---

## 10. Business logic validation

- ✅ Server totals/tax are authoritative (`recalcOrderTotals`).
- ⚠️ **Client “Grand Total”** in sidebar uses `pos-bill-utils` (may differ slightly from server if FX/menu drift).
- ✅ Inventory strict mode aligns server assert + client gating.
- ✅ Accounting posting on pay with persisted ok/failed/skipped.
- ⚠️ Shift close vs POS sales: only if staff uses accounting sessions UI.

---

## 11. Missing / partial / disconnected

- **UI without backend:** None critical at audited time (POS print route implemented).
- **Backend without POS UI:** `manual-discount`, `billingMode` / `paymentSplits`, loyalty fields, `POST /api/orders/sync` (normal POS uses per-mutation flush, not batch sync API).
- **Duplicate logic:** Tax/bill preview client + full recalc server (intentional preview vs source of truth).

---

## 12. Bug detection (concrete)

### 🔴 Refund dialog does not perform refund or cancel

- **Files:** `apps/pos-frontend2/src/app/(main)/pos/_components/pos-table-session-page.tsx` (`onConfirm` for `PosRefundDialog`), `pos-refund-dialog.tsx`
- **Function:** anonymous `onConfirm` passed to `PosRefundDialog` — only closes dialog and `router.refresh()`; **never** calls `posUpdateOrderStatus`, `posDeleteOrder`, inventory restock API, or `POST /api/accounting/refunds/:orderId`.
- **Module:** POS refunds
- **Fix:** Implement `onConfirm` to call the intended API (e.g. status `cancelled` with reason, optional restock endpoint if one exists, or finance refund flow for **paid** orders). Align copy: dialog says “cancel check” but Refund is only enabled when `locked` (paid) (`pos-cart-sidebar.tsx`).

### ~~POS print API path missing~~ (fixed)

- **Files:** `pos-order-api.ts` (`posPrintOrder`), `orderRoute.js` (`POST /:id/print`), `orderController.js` (`printOrderDocument`), `orderPrinting.js` (`printCustomerReceipt`)
- **Behavior:** Kitchen uses `completeSubmitStationTickets`; receipt requires `printerId` (POS picks default thermal printer when possible).

### ⚠️ `usePosSession.handlePayment` typing

- **File:** `apps/pos-frontend2/src/app/(main)/pos/_hooks/use-pos-session.ts`
- **Function:** `handlePayment` uses `payload: any` — should use `PosPaymentConfirmPayload`.

### ⚠️ `pos-check-sync.ts` offline patch processor

- **File:** `apps/pos-frontend2/src/lib/pos-check-sync.ts`
- **Function:** `posPatchOrderReplaceLines` cast `as any[]` — weak typing; also ensure hydrated `activeOrderId` after offline `create_order` before patch replay (verify ordering in production).

---

## 13. Security

- ✅ RBAC on orders (`requirePermission`, `assertPosOrderReadAccess` / `WriteAccess`, `pos.payment.use` for marking paid) (`orderController.js`, `orderRoute.js`).
- ⚠️ Refund/void: **cancel** uses `pos.order.cancel`; paid “refund” UI broken so permission surface untested end-to-end.
- ✅ Discount audit records actor on **server** manual discount.
- ⚠️ Price override: not exposed (reduces fraud surface but also limits legitimate use).

---

## 14. Reporting

- ✅ Sales, top items, payment methods, staff, tables, discount audit — **dashboard** `/api/reports/*` with `requireBackofficeStaff`.
- ❌ Dedicated POS in-app cashier shift report / refund report for cashier role only.

---

## B. Missing features (consolidated)

- Price override, split tender UI, partial payments, exchange, email receipt, explicit hold/park sale, multi-register, customer/loyalty in POS, paid-order refund workflow, offline payment, full offline accounting replay.

---

## C. Broken features

1. **POS receipt/kitchen `posPrintOrder`** — wrong/missing route.  
2. **Refund dialog completion** — no server mutation.

---

## D. Not connected features

- Accounting sessions (shift) ↔ POS terminal.
- Loyalty / `billingMode` / `paymentSplits` ↔ POS checkout API payload.
- `POST /api/accounting/refunds/:orderId` ↔ POS (dashboard only).
- Bluetooth Web API ↔ POS print button (server enqueues `PrintJob`; terminal acks).

---

## E. Integration issues

- Client totals vs server `recalcOrderTotals` (preview vs truth).
- `recalcOrderTotals` overwrites line pricing from catalog when menu item exists — custom prices from POS never stick without schema/controller changes.
- Offline queue lacks idempotency key on standard create.

---

## F. Recommended fixes (ordered)

1. ~~**Critical:** Implement `POST /api/orders/:id/print`~~ — done (`/api/order` and `/api/orders` aliases).  
2. **Critical:** Wire `PosRefundDialog` to correct backend operations for **paid** vs **open** checks; separate “void open order” vs “refund closed sale”.  
3. **Important:** Send `paymentSplits` from UI if adding split tender; document `billingMode` for house accounts.  
4. **Important:** Add POS customer attach + optional loyalty redeem payload on pay.  
5. **Important:** Expose manual discount (manager PIN) calling `POST /api/orders/:id/manual-discount`.  
6. **Optional:** `offlineSyncKey` on all offline creates; queue payment mutations; POS-facing slim reports.

---

## G. Priority matrix

| Priority | Items |
|----------|--------|
| **Critical** | Refund dialog no-op; ~~missing print route~~ fixed |
| **Important** | Split tender / AR in POS; customer + loyalty; manual discount UI; paid refund + GL + inventory policy; offline pay + idempotency |
| **Optional** | Exchange, email receipt, multi-register, POS-native reports, serial picker at POS |

---

## Issue register (required format)

| ID | Verdict | File path | Function / symbol | Problem | Module | Recommended fix |
|----|---------|-----------|---------------------|---------|--------|-------------------|
| POS-001 | ✅ | `pos-order-api` + `orderRoute` + `orderController` | `posPrintOrder` / `printOrderDocument` | `POST .../print` with JSON body; kitchen + receipt wired | Printing | Optional: org-level default receipt printer (replace name heuristic). |
| POS-002 | 🔴 | `apps/pos-frontend2/src/app/(main)/pos/_components/pos-table-session-page.tsx` | `PosRefundDialog` `onConfirm` | Ignores payload; no API call | POS / Refunds | Call order status cancel, restock service, or accounting refund per product rules; set loading/errors. |
| POS-003 | 🔗 | `apps/pos-frontend2/src/app/(main)/pos/_hooks/use-pos-session.ts` | `handlePayment` | Only passes `paymentMethod`; omits `paymentSplits`, `billingMode`, loyalty | Payments / AR | Extend API client + dialog to optional advanced checkout. |
| POS-004 | 🔗 | `apps/pos-backend/utils/orderTotals.js` | `recalcOrderTotals` | When `menuItem` resolves, **catalog price wins**; line override ignored | Pricing | Support persisted override flag or use line price when `priceOverride` set. |
| POS-005 | ⚠️ | `apps/pos-frontend2/src/lib/pos-check-sync.ts` | `persistPosCheckToServer` / `flushOfflineMutationQueue` | No `offlineSyncKey` on create; pay not queued | Offline | Generate UUID key on offline create; extend queue for pay + conflict policy. |
| POS-006 | ❌ | `apps/pos-frontend2/src/app/(main)/pos/**` | — | No customer picker, loyalty, manual discount, split pay | CRM / Discounts | Add UI + use existing REST endpoints. |
| POS-007 | ⚠️ | `apps/pos-frontend2/src/app/(main)/dashboard/accounting/sessions/page.tsx` vs `pos/**` | session open/close | Sessions live in dashboard only | Shift | Add POS modal or require session open before payment. |

---

*Audit generated from static code review of the repository state; runtime E2E was not executed in this pass.*
