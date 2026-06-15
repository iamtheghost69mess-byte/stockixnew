# System Workflow & Architecture Breakdown

## 1) Project Structure

### Main folders
- `apps/pos-backend`: Express + Socket.IO API server, Mongo models, controllers, services, workers.
- `apps/pos-frontend2`: Next.js POS frontend (`studio-admin`) used by staff/terminal.
- `apps/saas-dash`: Next.js platform/owner dashboard for org provisioning, billing, entitlements, invitations.
- `packages/ui`: shared UI package (`@restaurant-pos/ui`).
- `packages/platform-api`: generated TS types from OpenAPI.
- `tools/fake-printers`: local fake TCP printer cluster for print tests.

### Tech stack in use
- Frontend: Next.js + React + TypeScript (`apps/pos-frontend2`, `apps/saas-dash`).
- Backend: Node.js + Express + Socket.IO (`apps/pos-backend/app.js`).
- Database: MongoDB with Mongoose (`apps/pos-backend/config/database.js`).
- Queue/infra: BullMQ/Redis for jobs (`apps/pos-backend/services/jobQueue.js`).
- Printing: ESC/POS via `node-thermal-printer`, TCP/ePOS/USB/Bluetooth dispatch (`apps/pos-backend/services/orderPrinting.js`).

### Monorepo status
- Yes. Nx + npm workspaces monorepo:
  - Root config: `package.json`, `nx.json`.
  - Workspaces: `apps/*`, `packages/*`.

### Electron app status
- No Electron runtime app exists currently.
- No Electron entrypoint or `BrowserWindow`/`ipcMain` usage found in app code.
- There is an analysis doc only: `electron.md`.
- Current frontend/backend comm is plain HTTP:
  - POS frontend directly calls backend origin from `apps/pos-frontend2/src/config/pos-api.ts`.
  - Platform dashboard uses Next rewrite proxy in `apps/saas-dash/next.config.mjs`.

---

## 2) Database & Data Models

### Main models/tables (Mongo collections)
- Tenant/core: `Organization`, `Location`, `User`, `OrgInvitation`, `Subscription`.
- POS runtime: `Order`, `Table`, `MenuItem`, `Category`, `Printer`, `PrintJob`, `Payment`, `Customer`.
- Inventory: `Ingredient`, `Recipe`, `StockBalance`, `StockMovement`, `StockLot`, `OrderStockReservation`.
- Accounting: `AccountingConfig`, `AccountingAccount`, `JournalEntry`, plus related accounting models.

### Key relationships
- `User.organization -> Organization`, `User.location -> Location`.
- `Location.organization -> Organization`.
- `Order.organization -> Organization`, `Order.location -> Location`, `Order.table -> Table`, `Order.waiter -> User`.
- `Order.items[].menuItem -> MenuItem`; category path is via `MenuItem.category -> Category`.
- `Category.printerAssignment -> Printer` (station routing key).
- `PrintJob.printer -> Printer`, `PrintJob.order -> Order`, `PrintJob.org -> Organization`.

### Locations and users structure
- Location is tenant-scoped by `organization` (`models/locationModel.js`).
- User can be global to tenant (`location: null`) or hard-pinned to one branch (`location` set) (`models/userModel.js`).
- User auth supports password or PIN (`pin`, `pinLookup`, lockout counters).

### Models used during live POS
- Order taking: `Order`, `Table`, `MenuItem`, `Category`, `User`.
- Bill close/payment: `Order`, `Payment` (external flow), accounting models via hooks.
- Printing: `Printer`, `Category` (routing), `PrintJob`.
- Inventory side effects: `StockBalance`, `StockMovement`, `OrderStockReservation`, `StockLot`.

### Read-heavy vs write-heavy during POS
- Read-heavy: `Order` list/open order lookups, `Table` status, `MenuItem`/`Category`, `Printer` list.
- Write-heavy: `Order` (create/items/status), `Table` occupancy/currentOrder, `PrintJob`, stock movement/reservation models.

### NeDB/local database status
- No NeDB or embedded local DB in backend.
- Current local persistence is browser-side only:
  - IndexedDB queue: `apps/pos-frontend2/src/lib/offline-queue.ts`.
  - localStorage (dev token fallback + location scope).

---

## 3) Authentication & Roles

### Login/auth flow
- POS auth routes: `apps/pos-backend/routes/authRoute.js`.
- Login controller: `apps/pos-backend/controllers/authController.js`:
  - `POST /api/auth/login` supports PIN or email/password.
  - Device gate middleware `deviceAuth` runs before login.
  - Successful login issues access/refresh JWT pair.

### Roles and permissions
- Staff roles (`User.role`): `admin`, `manager`, `waiter`, `cashier`, `kitchen`, `hostess` (`models/userModel.js`).
- Effective permission role can be overridden by `permissionRole` (RBAC custom role).
- Permission catalog: `constants/permissionsCatalog.js`.
- Default role grants: `constants/defaultRbacRoles.js`.
- Platform-side roles/permissions separate in `constants/platformPermissions.js`.

### Access control scope
- Both role and location scope are enforced.
- Middleware stack:
  - Auth/org scope: `tenantRouteStacks.js` (`authedTenant`, `authedTenantLocation`).
  - Location scope: `middlewares/locationScope.js`.
  - Permission checks: `middlewares/requirePermission.js`.

### JWT/session token generation + validation
- Generated in `utils/authTokens.js` (`issueTokenPair`, `signAccessToken`, `signRefreshToken`).
- Validated in `middlewares/tokenVerification.js` and Socket.IO auth (`services/posSocketServer.js`).

### Token storage
- Primary: httpOnly cookies (`accessToken`, `refreshToken`) via `utils/authCookies.js`.
- Dev fallback: localStorage keys in `apps/pos-frontend2/src/lib/pos-api-fetch.ts`.
- Runtime user state: Zustand stores in frontend.

### Auth middleware route protection
- `isVerifiedUser` (`middlewares/tokenVerification.js`) protects tenant routes via stacks.
- `deviceAuth` (`middlewares/deviceAuth.js`) protects login endpoint.
- `requirePermission` adds operation-level checks per route, e.g. `routes/orderRoute.js`.

### PIN auth status
- Yes, first-class PIN auth exists:
  - PIN login flow: `authController.loginWithPin`.
  - PIN hashing/lookup/uniqueness: `models/userModel.js`.
  - Lockout after failed attempts supported.

---

## 4) Core Workflow

### a) New business signs up
1. Platform UI calls `POST /api/platform/v1/organizations` (`apps/saas-dash/src/app/(platform)/organizations/page.tsx`).
2. `platformOrgController.createOrg` creates `Organization` with lifecycle/plan/license window.
3. Ensures default `Main` location exists.
4. Enqueues provisioning job `org_bootstrap`; falls back to sync bootstrap if queue unavailable.
5. `orgBootstrapService.bootstrapOrganization` seeds RBAC config, default users + PINs, accounting defaults, starter categories, branding, sets `isBootstrapped`.

### b) New location created
1. `POST /api/locations` -> `locationController.createLocation`.
2. Enforces tenant org from auth context.
3. Enforces entitlement limit via `assertLocationCreateAllowed`.
4. Creates `Location` with `organization`.

### c) New user invited
1. Platform UI calls `POST /api/platform/v1/invitations`.
2. `platformInvitationController.createInvitation` stores hashed token + expiry.
3. Sends email job through queue.
4. Invite acceptance path is `POST /api/auth/invitations/accept` in `authController.acceptInvitation`.

### d) Sale on POS (order creation/update)
1. POS frontend calls `posCreateOrder` or `posPatchOrderItems` (`apps/pos-frontend2/src/lib/pos-order-api.ts`).
2. Backend route `routes/orderRoute.js` -> `orderController.addOrder` / `patchOrderItems`.
3. Controller validates table, item status, tenant scope.
4. Recalculates totals, runs `assertOrderLinesFulfillable`.
5. Saves order and table occupancy; emits realtime events.

### e) Bill closed + receipt printed
1. Frontend marks paid via `posMarkOrderPaid` (`PATCH /api/order/:id/status`).
2. `orderController.patchOrderStatus` handles payment status transition.
3. Triggers inventory deduction (depending on config) and `onOrderBecamePaid` accounting posting.
4. Table released on terminal statuses.
5. Receipt printing is separate explicit call: `POST /api/order/:id/print` with `{ type: "receipt", printerId }`.

### f) Kitchen/bar print trigger
- Trigger path:
  - Frontend `posPrintOrder(orderId, { type: "kitchen" })`.
  - Backend `orderController.printOrderDocument` or `patchOrderStatus` with `submitStationTickets`.
- Routing logic:
  - `completeSubmitStationTickets` -> `orderPrinting.groupLinesByPrinter`.
  - Category drives routing through `Category.printerAssignment`.
- Services/config:
  - Core dispatch in `services/orderPrinting.js`.
  - Printer schema/config in `models/printerModel.js`.

### Frontend ↔ backend data flow
- HTTP JSON fetch wrappers:
  - POS: `apps/pos-frontend2/src/lib/pos-api-fetch.ts`.
  - Platform: `apps/saas-dash/src/lib/platform-constants.ts` + rewrites.
- Realtime invalidation:
  - Socket client in `apps/pos-frontend2/src/lib/pos-socket.ts`.
  - Event bridge in `apps/pos-frontend2/src/components/pos/pos-realtime-bridge.tsx`.

### `orderController.js` from create -> payment -> print
- `addOrder`: validates table + lines, totals, stock fulfillability, saves order, reserves/deducts stock depending on state, may post accounting if directly paid.
- `patchOrderStatus`: handles line state ops + order status transitions; on paid transition validates payment data/splits, triggers stock and accounting hooks, frees table.
- `printOrderDocument`: kitchen path submits station tickets; receipt path validates printer in org/location scope then prints.
- `syncOfflineOrders`: batch import endpoint with optional `offlineSyncKey` idempotency and per-order result reporting.

---

## 5) Subscription & Billing

### Existing billing/subscription logic
- Yes, platform billing exists:
  - Subscription model: `models/subscriptionModel.js`.
  - Billing webhook ingestion: `controllers/platformBillingController.js`.
  - Billing orchestration service: `services/billingOrchestrator.js`.
  - Org entitlements/usage enforcement: `services/entitlementService.js`.

### Tie to locations/users
- Plan limits are stored in `Organization.entitlements` (e.g. `maxLocations`, `maxUsers`).
- Enforced at create time:
  - Location cap: `assertLocationCreateAllowed`.
  - Staff cap: `assertStaffCreateAllowed`.
- Order volume/API usage counters also tracked per org.

### License key system status
- No 25-char per-location license key implementation exists.
- Existing license is date-window fields on `Organization` (`licenseStartsAt`, `licenseEndsAt`), patched via platform org controller.
- Logical place for per-location key system:
  - New model (e.g. `LocationLicense`) linked to `organization + location`.
  - Validation middleware in tenant route stack before mutating POS routes.
  - Issuance/rotation endpoints under `platformV1Route`.

---

## 6) Inventory & Accounting

### Inventory tracking flow
- Core checks/deductions in `services/inventoryService.js`.
- Uses recipe/BOM demand resolution and stock balances/lots.
- Behavior controlled by settings (`stockDeductTrigger`, `strictOversell`, reservation toggles).

### `assertOrderLinesFulfillable`
- Defined in `services/inventoryService.js`.
- Called from:
  - `orderController.addOrder`
  - `orderController.patchOrderItems`
  - `orderController.updateOrder`
  - `orderController.syncOfflineOrders`
  - `selfOrderController.submitSelfOrder`
- Checks:
  - strict oversell gates
  - available quantity (`StockBalance.quantity - reservedQty`)
  - FEFO/expired lot constraints
  - fallback to legacy ingredient stock in non-location mode

### Stock decrement path
- Actual deduction function: `deductForOrderLine`.
- Triggered by:
  - `processStockAfterStatusPatch` (kitchen-send mode)
  - `processStockAfterPayment` (payment mode)
  - `processStockAfterItemsPatch` for in-progress edits.
- Idempotency guard: `order.items[].stockDeductedAt`.

### Accounting connection to POS
- Hook: `onOrderBecamePaid` in `services/accountingService.js`.
- On first paid transition:
  - Posts sales journal (`postOrderSaleLedger`).
  - Posts COGS journal (`postOrderCogsLedger`).
  - Persists posting outcomes on `Order` (`accountingSaleStatus`, `accountingCogsStatus`, etc).

### Where `onOrderBecamePaid` is called
- `orderController.addOrder`
- `orderController.patchOrderStatus`
- `orderController.updateOrder`
- `orderController.syncOfflineOrders`

---

## 7) Printing System

### Printer configuration
- Model fields in `models/printerModel.js`:
  - `type`: `network`, `usb`, `bluetooth`, `epson-epos`
  - `ipAddress`, `port`, `eposUrl`, `usbVendorId`, `usbProductId`, `bluetoothAddress`
  - optional `location` scope
- Category-to-printer mapping via `Category.printerAssignment`.

### File handling category routing
- `services/orderPrinting.js`:
  - `groupLinesByPrinter()` groups order lines by category-assigned printer.
  - `printTicketsForLines()` dispatches each station ticket.

### Protocol/transport used
- Network printer: direct TCP (`tcp://ip:port`) via `node-thermal-printer`.
- Epson ePOS: HTTP POST binary payload to `eposUrl`.
- Bluetooth: Socket.IO job dispatch to connected terminal (`printDispatchService.dispatchBluetoothPrintJob`).
- USB: enqueued print jobs to `print-jobs` queue worker.

### Queue behavior
- Not globally queued.
- Network/ePOS: immediate dispatch.
- USB: queue-backed (`addJob("print-jobs", "usb_dispatch", ...)`).
- Bluetooth: creates `PrintJob`, then immediate socket dispatch to printer room.

### Bluetooth vs network logic difference
- Network/ePOS execute server-side printer transport directly.
- Bluetooth requires POS terminal socket connection; server emits `print:job` event to `printer:{printerId}` room and waits for `print:ack`.

---

## 8) Offline/Online Sync

### Current offline mode
- Client-side mutation queue only (no offline backend server).
- Implemented in IndexedDB (`apps/pos-frontend2/src/lib/offline-queue.ts`).

### IndexedDB queue internals
- DB: `pos-offline-db`, store: `mutations`.
- Records include `dedupeKey`, `kind`, payload, attempts, timestamps.
- Sorted flush order by `createdAt` (chronological).

### Flush mechanism
- `flushOfflineMutationQueue()` in `apps/pos-frontend2/src/lib/pos-check-sync.ts`.
- Triggered by:
  - browser `online` event
  - periodic 15s loop in `components/pos/sync-manager.tsx`
  - manual "Sync now" button in offline banner
- Processes queued mutations sequentially; successful ones removed, failed ones increment `attempts`.

### `offlineSyncKey` and dedupe
- Backend supports idempotency with `Order.offlineSyncKey` (`models/orderModel.js`).
- Used in `orderController.syncOfflineOrders`.
- Current POS queue path does **not** use `/api/order/sync`; it replays normal create/patch calls, so `offlineSyncKey` is currently not leveraged by main frontend queue.

### `POST /api/order/sync` exact behavior
- Route in `routes/orderRoute.js`.
- Handler `syncOfflineOrders`:
  - accepts `{ orders: [] }`, caps to first 25.
  - validates each order payload/table/menu items.
  - dedupes by `offlineSyncKey` if provided.
  - applies normal save/stock/accounting logic per order.
  - returns per-item success/failure (partial success allowed).

### Connectivity detection beyond `navigator.onLine`
- For POS offline queue: no robust heartbeat check, mostly `navigator.onLine` + request failure fallback.
- So WAN false positives are possible (online but API unreachable).

---

## 9) Multi-Tenancy

### Tenant isolation model
- Primary tenant boundary is `organization` field on documents.
- Middleware injects `req.tenantOrganizationId`; controllers filter by organization.

### Tenant identity source
- POS authenticated routes: tenant derived from authenticated user + JWT organization claim (`attachTenantOrganization`, `requireTenantOrganization`).
- Login context can also use subdomain via `extractSubdomainOrg`.

### Subdomain/header/token usage
- Subdomain: used to resolve org for login path (`{slug}.pos.zerowix.cloud`).
- Token: JWT contains `organizationId` and is validated against user org.
- Header: `X-Location-Id` for branch scope when user is not hard-assigned to a location.

### `locationId` API scoping
- Middleware `locationScope`:
  - If `user.location` exists, that wins.
  - Else optional `X-Location-Id` is parsed/validated and enforced to belong to tenant org.

### `X-Location-Id` set + validated
- Set in frontend fetch wrapper `apps/pos-frontend2/src/lib/pos-api-fetch.ts`.
- Read from localStorage `pos-location-scope`.
- Validated in backend `apps/pos-backend/middlewares/locationScope.js`.

---

## 10) LAN & Network

### Existing LAN communication
- No machine-to-machine LAN sync/service-discovery layer exists for POS peers.
- No server election logic found.

### Service discovery/broadcast
- None for terminals/servers.
- Printer "discovery" is printer endpoint probing, not peer discovery.

### Socket.IO setup
- Initialized in `apps/pos-backend/app.js`.
- Auth/room join logic in `services/posSocketServer.js`.
- Rooms:
  - org room: `org:{organizationId}`
  - optional location room: `org:{organizationId}:loc:{locationId}`
  - printer terminal room: `printer:{printerId}` for Bluetooth print jobs.

### Current realtime events
- Defined in `utils/socketEmit.js`:
  - `order:updated`
  - `order:new`
  - `table:status-changed`
  - `catalog:updated`
  - `inventory:updated`
  - `inventory:low-stock`
- Frontend consumer invalidates TanStack Query caches in `components/pos/pos-realtime-bridge.tsx`.

---

## Implementation Impact for Your Planned Features

### Electron offline mode + local NeDB
- Current architecture has no embedded local DB layer; only IndexedDB mutation queue in browser.
- Best insertion points:
  - Introduce local repository abstraction under POS app (order/table/stock/printer queues).
  - Keep API adapter boundary (`pos-order-api.ts`, `pos-api-fetch.ts`) to swap remote/local targets.

### Automatic LAN server election
- No election or local mesh exists.
- You will need a new LAN coordination layer (heartbeat + leader lease + failover), likely outside current Express route model.

### 25-char license key per location
- Not present.
- Best fit:
  - New location-bound license model + activation state.
  - Enforce in `authedTenantLocation` stack before order/payment/print/inventory mutations.

### PIN-based offline staff auth
- PIN auth already exists online.
- Offline requires securely mirrored credential verifier (hashed PIN + lockout counters) in local DB, then reconciliation strategy for lockout state.

### Category-based printer routing offline
- Routing logic already exists (`Category.printerAssignment` + `groupLinesByPrinter`).
- You can reuse the same model locally and defer delivery via local print job queue.

### Offline queue with chronological sync + deferred print jobs
- Current queue already processes by `createdAt`.
- Gaps:
  - no durable backend idempotency usage in normal queue path
  - no retry backoff policy
  - no dependency graph between order/payment/print jobs
- Add ordered operation log with causal links (`order_created -> paid -> receipt_print`), replay using `/api/order/sync` or equivalent.

### Stock management during internet outage
- Current stock logic is backend-authoritative.
- Offline stock requires local `StockBalance` mirror + deterministic reservation/deduction ledger with conflict resolution on reconnect.
- Existing `stockDeductedAt` semantics can be mirrored for idempotent replay.

