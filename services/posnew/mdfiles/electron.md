# Electron + offline POS — codebase audit

**Scope:** `apps/pos-backend` (Express + Mongoose + MongoDB) and `apps/pos-frontend2` (Next.js POS / studio-admin UI). The separate `apps/saas-dash` platform app is **not** the in-store POS surface; this report focuses on what the Electron-wrapped POS actually uses.

**Target architecture (your plan):** Next.js UI in Electron, local Express (or embedded Node) with **NeDB** as offline Mongo stand-in, later sync to cloud Mongo.

---

## 1. Express API routes — offline-critical vs cloud-only

Mounts are registered in `apps/pos-backend/app.js` (lines ~256–299). Below is a **practical** split for **in-store POS selling flow** (floor, check, pay, print). “Degraded” = usable with limitations when offline.

| Prefix / router | Role | Offline stance |
|-----------------|------|----------------|
| `/api/health` (`healthRoute`) | Liveness | **Critical** for “am I talking to local vs cloud?” probes |
| `/api/public` | Public / self-order bits | **Degraded** — guest flows may need cloud |
| `/api/auth`, `/api/user` | Login, session, profile | **Critical** — need local session strategy when cloud auth unavailable |
| `/api/users` (`staffRoute`) | Staff CRUD | **Cloud-first** — POS runtime may only need cached staff list |
| `/api/devices` | Device registration | **Cloud-first** |
| `/api/order`, `/api/orders` | Orders, kitchen, **POST `/sync`** batch | **Critical** — core write path; sync already exists for batch replay |
| `/api/table`, `/api/tables` | Floor / tables | **Critical** |
| `/api/payment` | Razorpay create/verify/webhook | **Cloud-only** (external Razorpay) — in-store “cash/card recorded in POS” usually goes through **order status + payment fields**, not this router |
| `/api/categories`, `/api/menu-items` | Catalog | **Critical** (read-heavy; admin edits cloud-first) |
| `/api/upload` | Media upload | **Degraded** — optional offline (queue files) |
| `/api/printers`, `/api/print-jobs` | Printing | **Critical** for local/network printers; Bluetooth jobs need socket |
| `/api/ingredients`, `/api/ingredient-categories`, `/api/recipes` | Back-office + cost | **Degraded** — needed if POS enforces inventory / recipes at order time |
| `/api/suppliers`, `/api/purchase-orders`, `/api/goods-receipt-notes`, `/api/vendor-returns`, `/api/request-for-quotations` | Procurement | **Cloud-only** for typical POS shift |
| `/api/inventory`, `/api/stock-takes`, `/api/warehouse` | Inventory | **Degraded** — **strict oversell** (`assertOrderLinesFulfillable` in `orderController`) ties orders to live stock; offline must mirror policy + balances or relax checks |
| `/api/reports`, `/api/dashboard` | Analytics | **Cloud-only** (or stale cached) |
| `/api/locations` | Store locations | **Critical** for multi-site scope |
| `/api/customers` | CRM | **Degraded** — needed if attach customer at table |
| `/api/loyalty`, `/api/config` (tax, public menu, etc.) | Config + loyalty | **Critical** for tax/loyalty accuracy (cached snapshots) |
| `/api/rbac` | Role config | **Cloud-first** — runtime could cache catalog |
| `/api/accounting` | GL, invoices, FX, exports | **Cloud-only** for full fidelity; **paid orders** already call `onOrderBecamePaid` / accounting hooks server-side |
| `/api/platform/v1` | Platform API | **Cloud-only** |
| `/api/tenant` | Tenant isolation utilities | **Cloud-only** |
| `/api/reconciliation` | 3-way match | **Cloud-only** |
| `/api/serials` | Serial tracking | **Degraded** if selling serialized items at POS |

**Already relevant for offline replication**

- `POST /api/order/sync` — batch idempotent-ish replay with `offlineSyncKey` on `Order` (`orderModel.js`, `orderController.js` `syncOfflineOrders`).
- Standard `POST /api/order/` — used by the current Next.js offline queue flush (see §6).

---

## 2. Mongoose models — what to mirror in NeDB

NeDB is document-oriented but **not** aggregation/feature-complete like MongoDB. Treat local DB as a **synced subset + outbox**, not a full clone of all 76 models.

### Tier A — POS session (must mirror or cache)

| Model file | Why |
|------------|-----|
| `organizationModel.js` | Tenant id, branding, limits (minimal fields) |
| `locationModel.js` | `X-Location-Id` scoping |
| `userModel.js` | Staff identity for `waiter` / auth (subset) |
| `tableModel.js` | Floor plan + `currentOrder` linkage |
| `categoryModel.js` | Menu structure + `printerAssignment` |
| `menuItemModel.js`, `menuItemVariantModel.js` | Catalog + pricing |
| `orderModel.js` | Open/paid orders; `offlineSyncKey` |
| `customerModel.js` | If POS attaches customers |
| `taxConfigModel.js` | Totals |
| `loyaltyConfigModel.js`, `loyaltyAccountModel.js` | If loyalty applied at pay |
| `printerModel.js`, `printJobModel.js` | Local print pipeline |
| `deviceModel.js` | Only if device gate enforced locally |

### Tier B — inventory-aware POS (if you keep strict fulfillment offline)

| Model file | Why |
|------------|-----|
| `ingredientModel.js`, `recipeModel.js` | Recipe depletion |
| `stockBalanceModel.js`, `stockMovementModel.js`, `stockLotModel.js` | Availability |
| `orderStockReservationModel.js` | Reservations on order open / send |
| `inventoryCostLayerModel.js` | If cost moves with deductions |

### Tier C — written on payment / sync (cloud reconciliation)

| Model file | Why |
|------------|-----|
| `paymentModel.js` | Only if you persist Razorpay rows; cash/card may live on `Order` only |
| `discountAuditModel.js` | Manual discounts |
| `journalEntryModel.js` + accounting family | **Heavy** — today `accountingService` runs on paid orders; cloud replay may be simpler than full local GL |

### Tier D — explicitly cloud / omit locally (initially)

Accounting suite (`accountingAccountModel`, `invoiceModel`, `vendorBillModel`, …), procurement (`purchaseOrderModel`, `goodsReceiptNoteModel`, …), platform (`platformUserModel`, `platformApiKeyModel`, …), reporting rollups, webhooks, subscriptions, etc.

**Risk:** `orderController` pulls in `inventoryService`, `orderReservationService`, `accountingService`, `loyaltyService`, `entitlementService`. Offline mode must define which of those run **locally** vs **deferred jobs** when connectivity returns.

---

## 3. Where database access happens (switching logic)

There is **no** single data-access layer. Mongoose is used **directly** in:

- **Controllers** (e.g. `orderController.js`, `paymentController.js`, `customerController.js`, …) — primary HTTP entrypoints.
- **Services** (e.g. `inventoryService.js`, `accountingService.js`, `orderPrinting.js`, `loyaltyService.js`, `reportService.js`, `grnService.js`, …) — shared business logic.
- **Workers** (`workers/printWorker.js`, `workers/platformWorker.js`, …).
- **Middlewares** (`tokenVerification.js`, `requireActiveOrganization.js`, `locationScope.js`, …).

**Implication:** “Flip DB in one place” is **not** possible without refactoring. Realistic approaches:

1. **Strangler:** Introduce a `storage` or `repository` module per bounded context (`orders`, `catalog`, `inventory`) and migrate hot paths first.
2. **Dual-mode Express:** `OFFLINE_MODE=1` env switches implementations of those repositories (Mongoose vs NeDB adapter).
3. **Sidecar sync:** Local NeDB is source of truth while offline; a **sync worker** pushes to cloud Mongo when online (avoids rewriting every controller at once, but needs conflict rules).

**Highest-churn files for order offline:** `controllers/orderController.js`, `services/inventoryService.js`, `services/orderReservationService.js`, `services/accountingService.js`, `utils/orderTotals.js`.

---

## 4. Connectivity detection — what exists today

| Location | Behavior |
|----------|----------|
| `apps/pos-frontend2/src/components/pos/offline-status-banner.tsx` | `navigator.onLine` + `online`/`offline` events; shows queued mutation count |
| `apps/pos-frontend2/src/components/pos/sync-manager.tsx` | Flushes queue on `online` event |
| `apps/pos-frontend2/src/lib/pos-check-sync.ts` | On persist: if `!navigator.onLine`, enqueue; on flush: bail if `!navigator.onLine` |
| `apps/pos-frontend2/src/app/(main)/pos/_components/pos-refund-dialog.tsx` | Guards with `navigator.onLine` |
| `apps/pos-frontend2/src/components/pos/service-worker-registrar.tsx` | Registers `public/sw.js` (shell cache — not Mongo) |
| `apps/saas-dash/...` | Separate `navigator.onLine` handling in platform layout |

**Gaps for Electron + local API**

- No **application-level** ping (e.g. `GET /api/health` to **local** vs **cloud**); browser online ≠ SaaS reachable.
- No shared **connectivity store** (React context) — banner and sync manager duplicate patterns.
- Printer “online” in `printerController` / dashboard is **device reachability**, not store internet.

---

## 5. Next.js frontend — API / socket base URLs

**Central choke point:** `getPosApiOrigin()` in `apps/pos-frontend2/src/config/pos-api.ts`

- Uses `NEXT_PUBLIC_POS_API_ORIGIN` when set; otherwise hardcodes `http://localhost:8010`.

**Consumers**

- All `posApiFetch` / `posApiJson` (`src/lib/pos-api-fetch.ts`) — HTTP API.
- Socket.IO client (`src/lib/pos-socket.ts`) — **`io(getPosApiOrigin(), …)`** (same origin as HTTP).

**Other hardcoded fallbacks**

- `apps/pos-frontend2/src/app/api/upload/route.ts` — `process.env.NEXT_PUBLIC_POS_API_ORIGIN \|\| "http://localhost:8010"`.
- `apps/pos-frontend2/.env.example` documents `NEXT_PUBLIC_POS_API_ORIGIN`.

**Assessment**

- Relative `/api/...` paths are fine **if** `getPosApiOrigin()` resolves to the right host (local Express in Electron vs deployed cloud).
- For Electron, you will likely need **runtime configuration** (e.g. `file://` or custom protocol) because `NEXT_PUBLIC_*` is build-time in many setups — plan for **electron-store** or a bootstrap `config.json` + IPC to set the base URL before the Next layer loads, or use a small local reverse proxy on a fixed port.

**No raw cloud URLs found** scattered across POS libs — good; consolidation is already mostly done.

---

## 6. Existing offline-related implementation (baseline)

- **IndexedDB queue:** `src/lib/offline-queue.ts` — stores mutations (`create_order`, `patch_order_items`).
- **Sync to server when online:** `flushOfflineMutationQueue` → replays via `posCreateOrder` / `posPatchOrderReplaceLines` (`pos-check-sync.ts`).
- **Backend batch sync:** `POST /api/order/sync` with `offlineSyncKey` dedup on `Order`.
- **Service worker:** `public/sw.js` caches app shell URLs; does not implement API offline reads.
- **Order model:** `offlineSyncKey` field for idempotency.

**Missing relative to your NeDB + local Express goal**

- No local **read** replica of catalog/tables while offline (queue only helps **writes**).
- No NeDB or local server in repo yet.
- Flush path does not use **`/api/order/sync` batch** — it uses single create/patch endpoints (works, but different from bulk sync semantics).

---

## 7. Prioritized implementation plan (no code)

1. **Define offline scope contract** — Which flows must work with zero internet (open check, add items, pay cash, print)? Which fail soft (loyalty, strict inventory, Razorpay)? Document deferred sync behavior.

2. **Electron shell + fixed local API URL** — Run Express on `127.0.0.1:<port>`; Electron loads Next (or static export) with runtime config so `getPosApiOrigin()` always hits local when in “offline store mode.”

3. **Health + connectivity model** — Add periodic ping to local Express and optional ping to cloud; drive UI from that instead of raw `navigator.onLine` only.

4. **Local NeDB bootstrap** — Seed Tier A models from cloud (one-shot “nightly sync” or login pull). Version snapshots (e.g. `catalogVersion`).

5. **Repository layer for orders + catalog** — First migration target: `getOpenOrderForTable`, `addOrder`, `patchOrderItems`, `patchOrderStatus`, list tables/categories/menu-items. Behind interface: Mongo when `CLOUD_DB=1`, NeDB when local.

6. **Unify offline writes** — Align IndexedDB queue flush with `offlineSyncKey` and optionally `POST /api/order/sync` for atomic batch + single entitlement check.

7. **Inventory / accounting strategy** — Either: (a) offline relaxed mode (skip `assertOrderLinesFulfillable` / defer reservations), or (b) mirror Tier B + replay stock movements on sync (harder). Accounting: queue `onOrderBecamePaid` side effects for cloud worker.

8. **Payments** — Keep Razorpay on cloud; local “paid” orders marked pending-sync until verification if using gateway. Cash/card-as-recorded can stay local.

9. **Sockets / print** — Local Express must expose Socket.IO for Bluetooth print jobs; verify CORS and cookies in Electron webview.

10. **Testing** — Chaos tests: kill WAN, keep LAN; kill LAN; clock skew; duplicate `offlineSyncKey`; two tills same table.

---

## 8. Summary

| Question | Finding |
|----------|---------|
| Critical routes | Auth, user/session, orders (+ `/sync`), tables, catalog, config/tax/loyalty, printers; inventory if strict |
| Cloud-only | Reports, dashboard, accounting depth, procurement, platform, Razorpay webhooks |
| NeDB mirror | Tier A minimum; Tier B if inventory strict; not all 76 models |
| DB switch points | Controllers + services — need facades or sync worker; no single switch today |
| Connectivity | `navigator.onLine` + IndexedDB queue; no local/cloud split ping |
| Hardcoded URLs | Mostly centralized via `getPosApiOrigin()`; defaults to `localhost:8010`; socket shares same origin |

This document is an audit only; implementation should proceed in Agent mode when you are ready to change code.
