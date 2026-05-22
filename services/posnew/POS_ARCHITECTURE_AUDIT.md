# POS Architecture Audit

**Date:** Friday, May 22, 2026  
**Scope:** Read-only audit of `c:\Users\Jad\Desktop\pos\posnew` (restaurant POS monorepo) for Bigcapital / Stockix finance integration planning.  
**Bigcapital reference:** Sibling codebase at `c:\Users\Jad\Desktop\accounting3\stockix\services\stockix-finance` (not in this workspace).  
**Authoritative API contracts:** `apps/pos-backend/openapi/tenant-pos-v1.yaml` (159 paths), `apps/pos-backend/openapi/platform-v1.yaml`.

---

## 1. POS Overview

| Item | Value |
|------|-------|
| **Product name** | Restaurant POS (monorepo: `restaurant-pos-monorepo`) |
| **Type** | **Web** (Next.js). **No Electron runtime** today (planned in `mdfiles/electron.md` only). |
| **Frontend framework** | Next.js 16 App Router, React 19 |
| **Backend framework** | Express 4 (Node.js) |
| **Language** | Backend: JavaScript (CommonJS). Frontend: TypeScript |
| **Database** | MongoDB (Mongoose 8) |
| **ORM** | Mongoose (no Prisma/Drizzle) |
| **Package manager** | npm workspaces (root declares `packageManager: pnpm@9.0.5`; lockfile is `package-lock.json`) |
| **Monorepo?** | **Yes** — Nx + npm workspaces: `apps/*`, `packages/*` |
| **Apps (7 packages)** | `pos-backend`, `pos-frontend2` (package name `studio-admin`), `saas-dash`, `domain-access`, `platform-api`, `ui` |
| **Default API port** | `3000` (`config/config.js`); OpenAPI examples use `8010` |
| **SaaS dash port** | `3010` (dev) |
| **Tenancy** | Multi-tenant by `Organization`; subdomain routing (`*.localhost`, `*.pos.zerowix.cloud`) |

### Repository layout

```
pos/
└── posnew/                          # Monorepo root
    ├── package.json                 # workspaces: apps/*, packages/*
    ├── apps/
    │   ├── pos-backend/             # Express + MongoDB API
    │   ├── pos-frontend2/           # Tenant POS + back office (Next.js)
    │   └── saas-dash/               # Platform operator console (Next.js)
    └── packages/
        ├── ui/                      # Shared shadcn shell
        ├── domain-access/           # License window logic (shared)
        └── platform-api/            # Generated OpenAPI types for platform v1
```

---

## 2. Backend Structure

### 2.1 Runtime and entry

| Item | Path / value |
|------|----------------|
| Entry | `apps/pos-backend/app.js` (`npm run dev` → nodemon) |
| HTTP | `http.createServer` + Express |
| Realtime | Socket.IO on same server (`services/posSocketServer.js`) |
| Jobs | BullMQ + Redis (`services/jobQueue.js`); workers: platform, print, recurring journal/invoice |
| Docs | Swagger UI: `/api-docs`, `/api-docs/pos`, `/api-docs/platform` |

### 2.2 Authentication

| Aspect | Implementation |
|--------|----------------|
| **Tenant POS JWT** | Access token `aud: pos`; refresh via `POST /api/auth/refresh` |
| **Transport** | `Authorization: Bearer` or httpOnly cookies `accessToken` / `refreshToken` |
| **Login** | `POST /api/auth/login` — email/password **or** PIN (4–6 digits); device cookie flow |
| **Platform JWT** | `aud: platform`; separate secret `PLATFORM_JWT_SECRET` |
| **Platform API keys** | `X-Api-Key` composite auth on `/api/platform/v1/*` |
| **Staff roles** | `admin`, `manager`, `waiter`, `cashier`, `kitchen`, `hostess`, `accountant`, `accountant_readonly` |
| **RBAC** | `@rbac/rbac` + per-org `RbacConfig`; permissions in `constants/permissionsCatalog.js` |
| **Device trust** | `device_uuid` cookie; pending → approved devices (`models/deviceModel.js`) |
| **Location scope** | Header `X-Location-Id` for admin/manager without assigned branch |
| **License gate** | `requireActiveOrganization` — blocks tenant API outside `licenseStartsAt` / `licenseEndsAt` (org timezone) |
| **Token storage (client)** | httpOnly cookies (prod); dev fallback `localStorage` `pos_access_token` / `pos_refresh_token` |
| **Offline auth** | **No** cryptographic offline JWT validation on client; license is **server-side date window**, not signed offline license file |

**Key files:** `controllers/authController.js`, `middlewares/tokenVerification.js`, `middlewares/tenantRouteStacks.js`, `middlewares/requireActiveOrganization.js`, `packages/domain-access/get-organization-access-state.ts`

### 2.3 Offline support (backend)

| Capability | Details |
|------------|---------|
| **Order bulk replay** | `POST /api/orders/sync` — up to 25 orders; dedupe via unique sparse `offlineSyncKey` on `Order` |
| **Accounting batch ack** | `POST /api/accounting/sync/ack` — `{ batchId, orderIds?, note }` → `AccountingSyncLog` |
| **Idempotency** | Journal posts, refunds, platform org create use `Idempotency-Key` / `idempotencyKey` |
| **No** | General-purpose sync engine, local Mongo/SQLite on server, or Bigcapital push queue |

### 2.4 Database — collections (Mongoose models)

MongoDB URI: `MONGODB_URI` (default `mongodb://localhost:27017/pos-db`). Schema migrations: `migrations/registry.js`, `npm run migrate:schema`.

**88 model files** under `apps/pos-backend/models/`. Grouped by domain:

#### Tenancy, auth, platform

| Collection (typical) | Model | Purpose |
|----------------------|-------|---------|
| `organizations` | Organization | Tenant, license window, entitlements, lifecycle, provisioning |
| `users` | User | Staff: role, PIN, password, locations, RBAC role |
| `platformusers` | PlatformUser | SaaS operator accounts |
| `platformapikeys` | PlatformApiKey | Platform API keys |
| `devices` | Device | POS terminal registration |
| `rbacconfigs` | RbacConfig | Custom roles / overrides |
| `orginvitations` | OrgInvitation | Staff invites |
| `idempotencyrecords` | IdempotencyRecord | Platform idempotent writes |
| `webhookendpoints` / `webhookoutboxes` | Webhook* | Outbound webhooks |
| `featureflags` | FeatureFlag | Feature flags |
| `schemamigrations` | SchemaMigration | Migration registry |

#### POS operations

| Collection | Model | Key columns / notes |
|------------|-------|---------------------|
| `orders` | Order | `organization`, `table`, `waiter`, `items[]`, `bills{total,tax,serviceCharge*,totalWithTax,taxLines}`, `orderStatus`, `status` (lifecycle), `paymentMethod`, `paymentSplits[]`, `paymentData`, `paidAt`, `offlineSyncKey`, `accountingSaleStatus`, `accountingCogsStatus`, `manualDiscountAmount`, `billingMode`, `documentCurrency`, `fxRateToCompany` |
| `tables` | Table | Floor layout, seats, status, QR, zone |
| `locations` | Location | Branch: VAT, receipt config, kitchen workflow |
| `menuitems` / `menuitemvariants` | MenuItem* | Catalog, SKU, tax, modifier groups |
| `modifiergroups` | ModifierGroup | Options, price adjustments |
| `combos` | Combo | Combo slots |
| `categories` | Category | Menu hierarchy |
| `customers` | Customer | CRM |
| `payments` | Payment | Razorpay metadata |
| `splitbills` | SplitBill | Equal / by_item / custom splits |
| `printers` / `printjobs` | Printer / PrintJob | Thermal/network print queue |
| `posauditlogs` | PosAuditLog | POS action audit |
| `loyaltyconfigs` / `loyaltyaccounts` | Loyalty* | Points |

#### Inventory & procurement

| Collection | Model | Purpose |
|------------|-------|---------|
| `ingredients`, `stockbalances`, `stockmovements`, `stocklots`, `inventorycostlayers` | Various | Ingredient stock, FIFO layers, movements |
| `recipes` | Recipe | Menu item → ingredient BOM |
| `purchaseorders`, `goodsreceiptnotes`, `requestforquotations`, `vendorreturns` | Various | Procurement |
| `stocktakesessions` | StockTakeSession | Physical counts |
| `zones`, `bins`, `serialnumbers` | Warehouse | Zones/bins/serials |

#### Built-in accounting (native GL — **not** Bigcapital)

| Collection | Model | Purpose |
|------------|-------|---------|
| `accountingconfigs` | AccountingConfig | COA defaults, tax rates, payment method → GL accounts, webhooks |
| `accountingaccounts` | AccountingAccount | Chart of accounts |
| `journalentries` | JournalEntry | GL lines, `sourceType`/`sourceId`, order link |
| `accountingsessions` | AccountingSession | Cashier session open/close |
| `accountinginvoices` | AccountingInvoice | AR from orders |
| `accountingperiods` | AccountingPeriod | Period close |
| `accountingsynclogs` | AccountingSyncLog | Offline/batch sync ack |
| `vendorbills`, `creditnotes`, `expensereports`, `giftcards`, `bankstatementlines`, `budgets`, `fxrates` | Various | AP/AR/expenses/bank/FX |

**Order schema reference:** `apps/pos-backend/models/orderModel.js`

### 2.5 API endpoints

**Contract source:** OpenAPI documents **159 tenant paths** + platform v1. Legacy aliases: `/api/order` → `/api/orders`, `/api/table` → `/api/tables`.

Below: **complete accounting mount list** (from `routes/accountingRoute.js`) + **grouped summary** for other domains. For every path/method/body, see `openapi/tenant-pos-v1.yaml` or Swagger `GET /api-docs/pos`.

#### Health & public

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/`, `/health`, `/ready`, `/metrics` | Health / metrics |
| GET | `/api/public/menu` | QR/guest menu (table token or org slug) |
| POST | `/api/public/self-order` | Guest self-order submit |

#### Auth & staff

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register`, `/login`, `/refresh`, `/logout` | Tenant auth |
| POST | `/api/auth/invitations/accept` | Accept invite |
| GET | `/api/auth/session` | Session probe |
| GET/POST/PATCH/DELETE | `/api/users`, `/api/users/:id` | Staff CRUD |
| POST | `/api/users/:id/unlock-pin` | Unlock PIN |
| GET/PATCH/DELETE | `/api/devices` (+ approve/revoke) | Device management |
| GET/PUT | `/api/rbac/me`, `/catalog`, `/config`, `/custom-roles` | RBAC |

#### Floor — tables, orders, payments (integration-critical)

| Method | Path | Purpose | Request (summary) | Response (summary) |
|--------|------|---------|-------------------|-------------------|
| GET | `/api/tables` | List tables | Query: location scope | `{ success, data: Table[] }` |
| GET/POST/PATCH/DELETE | `/api/tables/:id` | Table CRUD | Table body | Table |
| GET | `/api/tables/:id/qr` | Table QR payload | — | QR data |
| GET | `/api/orders/kitchen` | Kitchen queue | Location scope | Order[] |
| GET | `/api/orders/for-table/:tableId` | Open order for table | — | Order or null |
| POST | `/api/orders` | Create order | `{ table, items[], customerDetails?, ... }` | `{ success, data: Order }` |
| **POST** | **`/api/orders/sync`** | **Offline bulk create** | `{ orders: [{ table, items[], offlineSyncKey?, ... }] }` (max 25) | Per-order `{ ok, orderId?, error? }` |
| GET | `/api/orders` | List orders | `page`, `limit`, filters | Order[] (+ pagination) |
| GET | `/api/orders/:id` | Get order | — | Order |
| PUT | `/api/orders/:id` | Update order | Partial order | Order |
| PATCH | `/api/orders/:id/items` | Replace/patch lines | `{ items }` or replace lines | Order |
| PATCH | `/api/orders/:id/items/:itemId/status` | Line kitchen status | `{ itemStatus }` | Order |
| **PATCH** | **`/api/orders/:id/status`** | **Pay / lifecycle** | `{ orderStatus: "paid", paymentMethod, paymentData?, paymentSplits?, billingMode?, ... }` | Order + `accountingPosting` metadata |
| PATCH | `/api/orders/:id/transfer` | Move to another table | `{ tableId }` | Order |
| POST | `/api/orders/:id/manual-discount` | Manual discount | `{ amount, reason, ... }` | Order |
| POST | `/api/orders/:id/print` | Enqueue print job | `{ type: "kitchen" \| "receipt", printerId? }` | Print job |
| POST | `/api/orders/:id/reprint/:printerId` | Reprint | — | — |
| DELETE | `/api/orders/:id` | Cancel/void order | — | — |
| POST | `/api/payment/create-order` | Razorpay order | Razorpay payload | Razorpay ids |
| POST | `/api/payment/verify-payment` | Verify Razorpay | Payment proof | — |
| POST | `/api/payment/webhook-verification` | Razorpay webhook | Raw body + signature | — |
| GET/POST | `/api/split-bills` | Split bill entity | Split config | SplitBill |
| POST | `/api/split-bills/:id/pay` (if mounted) | Pay split portion | `{ splitId, methodKey, amount }` | SplitBill |

**Payment PATCH body (actual):** `orderStatus`, `paymentMethod`, `paymentData`, `paymentSplits: [{ methodKey, amount }]`, `billingMode`, `documentCurrency`, `submitStationTickets`, line status updates.

#### Catalog

| Method | Path | Purpose |
|--------|------|---------|
| CRUD | `/api/categories`, `/api/menu-items`, `/api/menu-items/:id/availability` | Categories & menu |
| CRUD | `/api/modifier-groups`, `/api/combos` | Modifiers & combos |
| POST | `/api/upload` | Image upload (multipart) |

#### Customers, loyalty, config

| Method | Path | Purpose |
|--------|------|---------|
| CRUD | `/api/customers`, `/api/customers/:id/orders` | Customers |
| GET/PUT | `/api/loyalty/config`, POST `/redeem`, `/earn` | Loyalty |
| GET/PUT | `/api/config/tax`, `/public-menu-branding`, `/self-order-venue-qr` | Tax & branding |
| CRUD | `/api/locations`, GET/PUT `/locations/receipt-config` | Branches |

#### Printers & print jobs

| Method | Path | Purpose |
|--------|------|---------|
| CRUD | `/api/printers` (+ discover, status, test) | Printer registry |
| GET/PATCH/POST | `/api/print-jobs` (+ ack, retry) | Print queue |

#### Reports & dashboard

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/reports/sales`, `/top-items`, `/payment-methods`, `/food-cost`, `/staff`, `/tables`, `/discount-audit`, `/pos-audit`, `/vat`, `/vat/pdf`, `/voids`, `/sales-by-category`, `/expenses`, `/branch-comparison` | Analytics |
| CRUD | `/api/report-schedules` | Scheduled reports |
| GET | `/api/dashboard/default`, `/recent-orders`, `/recent-voids`, `/low-stock` | Dashboard widgets |

#### Inventory (representative — full list in OpenAPI)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inventory/low-stock`, `/report`, `/report/valuation`, `/report/slow-moving`, `/forecast` | Reports |
| GET | `/api/inventory/scan/:barcode`, `/movements`, `/balances`, `/balances/planning` | Operations |
| POST | `/api/inventory/adjust`, `/transfer`, `/returns`, `/bootstrap-balances` | Stock changes |
| GET/POST | `/api/inventory/zones`, `/bins`, `/menu-availability`, `/pos-policy` | Policy & structure |
| CRUD | `/api/ingredients`, `/ingredient-categories`, `/suppliers`, `/recipes` | Master data |
| CRUD | `/api/purchase-orders`, `/goods-receipt-notes`, `/request-for-quotations`, `/vendor-returns` | Procurement |
| CRUD | `/api/stock-takes` (+ lines, post) | Stock take |
| CRUD | `/api/warehouse/zones`, `/bins`, `/api/serials` | Warehouse |
| GET/POST | `/api/reconciliation` | 3-way match |

#### Accounting — **complete route table** (`/api/accounting` prefix)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ensure-defaults` | Seed default COA |
| GET/POST/PATCH | `/accounts`, `/accounts/:id` | Chart of accounts |
| GET/PUT | `/config` | Accounting config |
| GET/POST | `/journal-entries`, GET `/journal-entries/:id` | Journals |
| GET | `/trial-balance`, `/reports/pnl`, `/reports/cash-flow`, `/reports/balance-sheet` | Financial reports |
| GET | `/reports/consolidated/trial-balance`, `/pnl`, `/balance-sheet` | Consolidated |
| GET | `/consolidation/child-organizations` | Multi-org |
| GET | `/reports/budget-vs-actual`, `/reports/ar-aging` | Analytics |
| GET | `/reports/customer-statement`, `.pdf`, `/reports/supplier-statement`, `.pdf` | Statements |
| GET | `/reports/session-summary` | Cashier sessions |
| GET | `/export/journals.csv`, `.pdf`, **`/export/integration.json`**, `/trial-balance.xlsx`, `.pdf` | Exports |
| GET | `/audit-log` | Journal audit |
| **POST** | **`/sync/ack`** | Batch sync acknowledgment |
| GET/POST | `/notifications` (+ unread, mark read) | Backoffice notifications |
| **POST** | **`/post-order/:orderId`**, **`/reverse-order/:orderId`**, **`/refunds/:orderId`** | Order ↔ GL |
| POST | `/ar/payments` | AR payment allocation |
| GET/POST/PATCH/DELETE | `/fx/rates`, GET `/fx/resolve` | FX |
| POST | `/inventory/bootstrap-cost-layers` | Cost layers |
| GET | `/periods`, POST `/periods/close`, POST `/closing/retained-earnings` | Period close |
| GET/POST | `/invoices`, POST `/invoices/from-order/:orderId`, PATCH `/invoices/:id/void` | AR invoices |
| GET/POST | `/sessions/open`, POST `/sessions/:id/close` | Cash sessions |
| GET/POST | `/gift-cards`, POST `/issue`, `/redeem` | Gift cards |
| GET/POST | `/bank/statements`, `/import`, `/match`, `/match-suggestions/:id`, `/reconciliation-report` | Bank rec |
| GET | `/accounts/:id/ledger` | Account ledger |
| CRUD | `/recurring-templates`, `/budgets`, `/recurring-invoices` (+ run, preview) | Automation |
| POST | `/automation/run`, `/automation/test-webhook` | Webhooks |
| GET/POST | `/vendor-bills`, `/accounts-payable` (+ from-po, post, payments, void) | AP |
| GET/POST | `/credit-notes` | AR credit notes |
| CRUD | `/expense-reports` (+ submit, approve, reject, post-gl) | Expenses |
| CRUD | `/approval-requests` (+ approve/reject) | Approvals |

**Integration export response shape:**

```json
{
  "success": true,
  "format": "pos-gl-v1",
  "data": [ /* JournalEntry[] with populated lines.account */ ]
}
```

Query: `?start=&end=` (ISO dates on `entryDate`).

#### Platform API v1 (`/api/platform/v1` — SaaS control plane)

| Area | Paths (representative) |
|------|------------------------|
| Auth | `POST /auth/login`, `/refresh`, `/logout`; `GET /auth/me`; API keys CRUD |
| Orgs | `GET/POST /organizations`, `GET/PATCH/DELETE /organizations/:id`, **`PATCH .../license`**, entitlements, provisioning, lifecycle |
| Metrics | `/metrics/summary`, `/kpis`, `/analytics`; `GET /stream` (SSE) |
| Ops | `/jobs`, `/webhooks/endpoints`, `/webhooks/outbox`, `/compliance/export`, `/deletion`, `/flags`, `/impersonation/session`, `/audits`, `/notifications`, `/system-settings`, `/devices`, `/users/global`, `/invitations`, `/bootstrap` |
| Spec | `GET /openapi.json` |

#### Setup & misc

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH/POST | `/api/v1/setup/status`, `/step/:stepNumber`, `/complete` | Onboarding wizard |
| GET | `/api/tenant/orders` | Isolation test listing |

### 2.6 Current integrations (POS backend)

| Integration | Usage |
|-------------|--------|
| **MongoDB** | Primary datastore |
| **Redis** | BullMQ, rate limits, Socket.IO adapter |
| **Razorpay** | Card payments + webhook |
| **Resend** | Email |
| **AWS S3** | Uploads / exports |
| **Sentry** | Errors |
| **Socket.IO** | Kitchen, printers, realtime catalog/inventory |
| **Outbound webhooks** | `AccountingConfig` automation URL; platform `webhookOutbox` + BullMQ `webhooks_out` |
| **Thermal printing** | `node-thermal-printer`, ESC/POS, BullMQ `print-jobs` |

**Not present:** Bigcapital, QuickBooks, Xero, or external accounting SaaS sync. Accounting is **in-app GL** (`services/accountingService.js`).

---

## 3. Frontend Structure

### 3.1 Applications

| App | Package | Role | Stack |
|-----|---------|------|-------|
| **pos-frontend2** | `studio-admin` | Tenant POS terminal + back office | Next.js 16, React 19, Zustand, TanStack Query, shadcn/Tailwind 4, `@restaurant-pos/ui` |
| **saas-dash** | `saas-dash` | Platform operator console | Same stack + Vitest/Playwright; `@restaurant-pos/platform-api` |

**Not Electron.** Service worker + IndexedDB for limited offline shell caching.

### 3.2 Screen inventory (pos-frontend2)

**~107 routes** under `src/app/`. Critical POS surfaces:

| Screen / URL | Purpose | Key data / components |
|--------------|---------|------------------------|
| `/login`, `/staff-login` | Admin vs PIN staff login | `pos-auth-api.ts`, device states |
| `/pos` | Floor plan — table selection | `pos-floor-page.tsx`, `FloorTable` |
| `/pos/t/[tableId]` | **Cashier session** — cart, pay, print | `pos-table-session-page.tsx`, `pos-order-store`, `pos-payment-dialog.tsx` |
| `/self-order` | Guest QR ordering | Public menu flow |
| `/dashboard/floor` | Table management (back office) | Tables CRUD |
| `/dashboard/menu-items`, `/modifiers`, `/combos` | Catalog admin | `pos-catalog-api.ts` |
| `/dashboard/printers`, `/receipt-config` | Print setup | `pos-printer-api.ts` |
| `/dashboard/reports/*` | Sales, VAT, voids, staff, etc. | Report APIs |
| `/dashboard/accounting/*` | Full GL UI (~30 pages) | `pos-accounting-api.ts` |
| `/dashboard/inventory/*` | Stock, PO, GRN, wastage, serials | `inventory-api.ts` |
| `/settings/bluetooth-printer` | Web Bluetooth ESC/POS | `bluetooth-printer.ts` |

**saas-dash (~20 routes):** `/organizations`, `/organizations/[id]` (license dates), `/devices`, `/jobs`, `/webhooks`, `/compliance`, `/api-keys`, `/flags`, `/audits`, etc.

**KDS gap:** Kitchen workflow exists (config, `GET /api/orders/kitchen`, print type `kitchen`) but **no dedicated KDS page** in frontend; realtime invalidates `kitchenOrders` query only.

### 3.3 Cart / order data model (client)

**Zustand store:** `apps/pos-frontend2/src/stores/pos-order-store.ts`

```typescript
interface PosCartLine {
  id: string;
  menuItem: string;
  name: string;
  pricePerQuantity: number;
  quantity: number;
  price: number;
  note?: string;
  status?: "pending" | "sent" | "ready" | "served" | "void";
  selectedModifiers?: {
    groupId?: string;
    groupName?: string;
    selectedOptions?: { name: string; priceAdjustment?: number }[];
  }[];
  itemType?: "menu_item" | "combo";
  comboId?: string | null;
  comboName?: string;
  comboPrice?: number | null;
  selectedSlots?: { slotName: string; menuItemId: string; menuItemName: string }[];
}

// Server order (pos-order-api.ts)
interface PosOrder {
  _id: string;
  orderNumber?: number;
  orderStatus: "pending" | "paid" | "cancelled" | "void";
  status?: "draft" | "sent" | "billed" | "paid" | "closed";
  table?: string | { _id: string; tableNo: number };
  customer?: string | null;
  customerDetails?: { name?: string; phone?: string; guests?: number };
  items: PosOrderLine[];
  bills: {
    total: number;
    tax: number;
    serviceChargeRate?: number;
    serviceChargeAmount?: number;
    totalWithTax: number;
    taxLines?: { code: string; label?: string; amount: number }[];
  };
  paymentMethod?: string;
  paymentSplits?: { methodKey: string; amount: number }[];
  manualDiscountAmount?: number;
  billingMode?: "immediate" | "on_account";
  documentCurrency?: string;
  paidAt?: string;
  offlineSyncKey?: string;
  accountingSaleStatus?: "ok" | "failed" | "skipped";
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 Payment methods

| Method | Implementation |
|--------|----------------|
| **Cash** | `method: "cash"` + `amountReceived` / change in `pos-payment-dialog.tsx` |
| **Card** | `method: "card"` (manual reference; Razorpay path separate for online) |
| **Manual** | `method: "manual"` + reference/note |
| **Multi-tender** | `paymentSplits: [{ methodKey, amount }]` must sum to `bills.totalWithTax` |
| **Split bill** | Entity `SplitBill` — equal / by_item / custom; `posCreateSplitBill`, `posPaySplitBillSplit` |
| **On account** | `billingMode: "on_account"` → AR via accounting AR payment |
| **Razorpay** | `POST /api/payment/create-order`, `verify-payment` |
| **Refunds** | Back office: `POST /api/accounting/refunds/:orderId` (not cashier UI) |

### 3.5 Receipt / printing

| Layer | Details |
|-------|---------|
| **Server** | `POST /api/orders/:id/print` → BullMQ print worker; ESC/POS via `node-thermal-printer` |
| **Client preview** | `pos-receipt-preview-dialog.tsx` |
| **Bluetooth** | Web Bluetooth + `@point-of-sale/receipt-printer-encoder` (`bluetooth-printer.ts`, `TicketData`) |
| **Realtime** | Socket `print:job` → `usePrintJobListener.ts` |
| **Config** | Per-location receipt template in `Location.receiptConfig` / dashboard receipt-config |

---

## 4. Current Data Flow (sale → storage)

```
1. Item selection (CLIENT)
   File: pos-table-session-page.tsx → pos-order-store.ts (Zustand cart)
   ↓
2. Persist check (CLIENT → API, debounced)
   File: pos-check-sync.ts → persistPosCheckToServer()
   - Online: POST /api/orders OR PATCH /api/orders/:id/items
   - Offline: IndexedDB queue (offline-queue.ts) kinds: create_order, patch_order_items
   ↓
3. MongoDB (SERVER)
   Collection: orders — items[], bills computed server-side
   ↓
4. Kitchen / send (CLIENT)
   PATCH status / print POST type=kitchen; Socket order:updated
   ↓
5. Payment (CLIENT)
   File: pos-payment-dialog.tsx → use-pos-session.ts handlePayment
   PATCH /api/orders/:id/status { orderStatus: "paid", paymentMethod, paymentSplits, ... }
   ↓
6. Order paid (SERVER)
   File: orderController.patchOrderStatus
   - Sets paidAt, linesLockedAt
   - processStockAfterPayment (inventoryService) — trigger from AccountingConfig.stockDeductTrigger
   - onOrderBecamePaid → postOrderSaleLedger + postOrderCogsLedger
   ↓
7. GL journals (SERVER)
   File: accountingService.js → JournalEntry collection
   Fields: Order.accountingSaleStatus, accountingCogsStatus (ok/failed/skipped)
   ↓
8. Receipt (CLIENT + SERVER)
   posPrintOrder(id, { type: "receipt" }) OR Bluetooth local print
   ↓
9. Reports (SERVER, async/query)
   Aggregations on paid orders — /api/reports/*; not real-time push to external ERP
```

**Offline flush:** `sync-manager.tsx` — on `online` + every 15s; replays IndexedDB mutations (does **not** auto-call `/api/orders/sync` for full offline checks unless implemented in flush path — verify flush uses individual APIs vs bulk sync).

**Bigcapital integration hook point:** After step 6 (paid) or parallel async job — **not implemented today**.

---

## 5. Bigcapital Integration Analysis

### 5.1 Data model mapping

| Bigcapital entity | POS entity | Match | Notes |
|-------------------|------------|-------|-------|
| Sale Receipt | Paid `Order` | **Partial** | POS has line modifiers, service charge, multi-tender; Bigcapital expects `customer_id`, `deposit_account_id`, `entries[]` with `item_id` |
| Sale Invoice | Order (on_account) | **Partial** | POS has `billingMode: on_account` + `/api/accounting/invoices/from-order/:id` internally |
| Item / Product | `MenuItem` (+ variants) | **Partial** | POS menu ≠ inventory items; recipes link menu → ingredients |
| Customer | `Customer` | **Good** | Map Mongo `_id` → Bigcapital `customer_id` via external ref table |
| Payment Received | `paymentSplits` / Razorpay | **Partial** | Bigcapital payment receives are separate documents |
| Tax Rates | `TaxConfig`, `Location.vatRate`, `bills.taxLines` | **Needs mapping** | Multi-bucket tax on order |
| Warehouse / Branch | `Location` | **Needs mapping** | `warehouse_id`, `branch_id` on Bigcapital receipt |
| Cash Flow / Sessions | `AccountingSession` | **Partial** | POS has native cashier sessions |
| COGS / Inventory | `StockMovement`, recipes | **Partial** | POS deducts ingredients; Bigcapital has item entries + inventory transactions |
| Manual Journal | `JournalEntry` | **Overlap** | POS already has native GL — **risk of double posting** if both systems book same sale |

### 5.2 Bigcapital API endpoints (Stockix finance server)

Base path (authenticated dashboard): **`/api/sales/...`** per `packages/server/src/api/index.ts`.

| Endpoint | Method | When POS would call | Payload highlights |
|----------|--------|---------------------|-------------------|
| `/api/sales/receipts` | POST | On paid checkout | `customer_id`, `deposit_account_id`, `receipt_date`, `entries[{ item_id, quantity, rate, discount }]`, `branch_id?`, `warehouse_id?`, `closed` |
| `/api/sales/receipts` | GET | Catalog sync / reconciliation | Pagination, filters |
| `/api/sales/receipts/:id` | GET | Lookup | — |
| `/api/sales/receipts/:id` | POST | Edit (avoid for POS replay) | — |
| `/api/sales/receipts/:id` | DELETE | Void mirror | — |
| `/api/items` | GET/POST | Product sync | Item master for `item_id` mapping |
| `/api/customers` | GET/POST | Customer sync | `customer_id` for walk-in vs named |
| `/api/customers` (Contacts) | — | Same contact subsystem | — |
| `/api/expenses` | POST | Petty cash / paid-outs | Not same as POS order |
| `/api/manual-journals` | POST | Fallback if receipt API insufficient | — |
| Tax / settings | `/api/settings`, accounts | Map tax codes → rates | Tenant-scoped |

**Auth:** Bigcapital uses JWT tenancy middleware (`JWTAuth`, `TenancyMiddleware`) — POS bridge needs service account or API token per tenant.

**Validation reference:** `SalesReceipts.ts` — `entries` min 1; numeric `item_id`, `rate`, `quantity`.

### 5.3 Integration approach options

| Option | Feasible? | Reasoning |
|--------|-----------|-----------|
| **A — Real-time API** | **Partial** | POS is web-first with online payment flow; works when network + Bigcapital up. **Fails** when IndexedDB queue is active unless flush waits for Bigcapital. Native GL may **double-book** unless disabled per org. |
| **B — Async queue** | **Best fit** | Already have IndexedDB offline queue, `offlineSyncKey`, BullMQ patterns, `AccountingSyncLog` / `sync/ack`. Add `bigcapital_push` job on paid orders with idempotency key = `order._id`. |
| **C — End-of-day batch** | **Yes** | `GET /api/accounting/export/integration.json` or custom export of paid orders; map to Bigcapital import. **Con:** not live; duplicates native GL. |
| **D — Webhook push** | **Partial** | POS has outbound webhook infrastructure (platform + accounting automation). Could POST to bridge service that calls Bigcapital — not to Bigcapital directly without receiver. |

**Recommended:** **Option B** — extend paid-order pipeline with idempotent outbound sync queue; **disable or scope native auto-post** (`AccountingConfig.autoPost*`) when Bigcapital is source of truth for revenue.

**Effort:** **High** — restaurant-specific fields (modifiers, service charge, split bills, tables) need mapping layer; item/customer ID crosswalk; multi-currency (`documentCurrency`, `fxRateToCompany`).

---

## 6. License Integration

### 6.1 Current POS licensing

| Aspect | Implementation |
|--------|----------------|
| **Model** | `Organization.licenseStartsAt` / `licenseEndsAt` (also legacy `licenseStartDate` / `licenseEndDate`) |
| **Enforcement** | Server: `requireActiveOrganization` → `organizationAccessService` → `getOrganizationAccessState()` |
| **Not JWT file** | No offline signed license blob in POS repo; **date window check** in org timezone |
| **Platform admin** | `PATCH /api/platform/v1/organizations/:id/license` (saas-dash UI) |
| **Mode** | `licenseEnforcementMode: "shadow"` can log-but-allow in config |
| **Client display** | Staff page shows license dates from API (`PosStaffListLimits`) |

**Shared package:** `packages/domain-access/get-organization-access-state.ts` — used by backend `licenseWindowService`.

### 6.2 Stockix / Electron JWT licensing (planned, not in POS)

Per `mdfiles/electron.md`: future Electron POS may use NeDB + local API; **no `LICENSE_SIGNING_SECRET` or JWT license validation** found in `posnew` apps.

**Mapping to Stockix finance (external):**

| Stockix concept | POS equivalent |
|-----------------|----------------|
| `packages/db` licenses table | `Organization` license fields + entitlements |
| `LICENSE_SIGNING_SECRET` | **Not wired** in POS — would be new for Electron offline |
| LicenseGuard (finance server) | Analog: `requireActiveOrganization` |

**Integration note:** If Electron offline JWT is added, platform must issue licenses via SaaS dash and POS must validate without blocking paid-order sync queue.

---

## 7. Restaurant-Specific Features

| Feature | POS support | Bigcapital mapping challenge |
|---------|-------------|------------------------------|
| **Table management** | `Table`, floor `/pos`, transfer order | No table entity — use `reference_no` / memo |
| **Floor plan / zones** | Table zones, dashboard floor | — |
| **Open tabs** | Open order per table until paid | Single receipt per payment |
| **Modifiers** | `selectedModifiers[]` on lines | Extra lines or non-inventory descriptions |
| **Combos / slots** | `itemType: combo`, `selectedSlots` | Bundle pricing → single line or exploded items |
| **Service charge** | `bills.serviceChargeRate/Amount` | Not standard — manual line or adjustment |
| **Split bill** | `SplitBill` entity + payment dialog | Multiple Bigcapital receipts or one with split payments |
| **Kitchen workflow** | Item statuses, kitchen print, `kitchenFlowMode` | N/A |
| **Course management** | **Not found** | — |
| **KDS** | API + print; **no KDS UI** | — |
| **Waiter attribution** | `waiter`, `waiterUsername` | Custom field / reference |
| **Self-order / QR** | `orderSource: self-order`, public menu | Separate channel flag |
| **Tips** | `tipAmount` on order (field exists) | Gratuity line or excluded |
| **Loyalty** | Points redeem on order | Discount mapping |
| **Multi-location** | `location`, `X-Location-Id` | `branch_id` / `warehouse_id` |
| **VAT inclusive / tax lines** | `bills.taxLines[]` | Per-line tax in Bigcapital entries |

---

## 8. What Needs To Be Built For Integration

### On POS side

1. **Integration config** per organization: Bigcapital base URL, tenant id, API token, default `customer_id` (walk-in), `deposit_account_id`, branch/warehouse mapping from `Location`.
2. **ID mapping store** (Mongo): `menuItemId` ↔ Bigcapital `item_id`, `customerId` ↔ `customer_id`.
3. **Sync worker** on `orderStatus → paid`: build `ISaleReceiptDTO` from order lines (explode modifiers/service charge/tips/splits).
4. **Idempotency** — use `order._id` or `offlineSyncKey` as `reference_no` to prevent duplicate receipts.
5. **Feature flag** to disable native `postOrderSaleLedger` when Bigcapital is authoritative.
6. **Offline**: queue Bigcapital push in IndexedDB or BullMQ; retry with backoff.
7. **Admin UI** — connection status, last sync error, manual replay (like `post-order` but external).

### On Bigcapital side

1. **Service user / API key** per POS tenant with scoped permissions (`SaleReceiptAction.Create`, Items.View).
2. **Items** aligned to menu SKUs (or generic "Open food" item).
3. **Walk-in customer** record for anonymous dine-in.
4. Optional **webhook receiver** if using Option D (bridge).

### New shared service (recommended)

**POS ↔ Bigcapital bridge** (small Node service or pos-backend module):

- Subscribes to paid orders (internal event or poll).
- Maps POS → Bigcapital payload.
- Handles retries, dead-letter, reconciliation dashboard.
- Avoids coupling Next.js client to Bigcapital secrets.

---

## 9. Integration Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Double GL posting** (native + Bigcapital) | Critical | Org-level flag to skip `onOrderBecamePaid` sale journal |
| **POS offline, Bigcapital down** | High | Async queue; do not block `PATCH .../status` paid response |
| **Item ID mismatch** | High | Mapping table + nightly item sync from Bigcapital |
| **Modifiers / service charge** | Medium | Document mapping rules; use description lines or adjustment items |
| **Split bills → multiple receipts** | Medium | One receipt per split or single receipt with split payment metadata |
| **Multi-currency orders** | Medium | Pass `exchange_rate`; align with Bigcapital base currency |
| **No Electron yet** | Medium | Integration targets web POS first |
| **Razorpay vs Bigcapital payments** | Low | Card clearing stays Razorpay; Bigcapital records deposit account only |
| **159 API surface drift** | Low | Contract tests against `tenant-pos-v1.yaml` already exist |

---

## 10. Recommended Next Steps

1. **Decide system of record** — native POS GL vs Bigcapital (per org). Document in `AccountingConfig`.
2. **Spike mapping** — one paid order → `POST /api/sales/receipts` payload; validate with Stockix dev tenant.
3. **Add `IntegrationConfig` model** + admin UI in dashboard settings.
4. **Implement paid-order outbound queue** (BullMQ) with idempotency — mirror `print-jobs` pattern.
5. **Build menu/customer sync** — scheduled `GET /api/items`, `GET /api/customers` → cache in Mongo.
6. **Pilot Option B** with one location; compare totals to `/api/reports/sales` vs Bigcapital receipts list.
7. **Defer Electron JWT licensing** until bridge stable; align with platform `PATCH .../license` dates for web.

---

## Appendix A — OpenAPI path index (tenant)

Full machine-readable list: **`apps/pos-backend/openapi/tenant-pos-v1.yaml`** (159 paths). Swagger UI: **`GET /api-docs/pos`**.

Domains covered: Public, Auth, Users, RBAC, Locations, Tables, Orders, Payments, Catalog, Printers, Customers, Dashboard, Reports, Config, Loyalty, Inventory, Ingredients, Suppliers, Recipes, PO/GRN/RFQ, Stock takes, Accounting (~70 paths in spec), Tenant tools, Vendor returns, Warehouse, Reconciliation, Print jobs (if documented), Setup.

## Appendix B — Key file index

| Area | Path |
|------|------|
| Server entry | `apps/pos-backend/app.js` |
| Order logic | `apps/pos-backend/controllers/orderController.js` |
| Accounting | `apps/pos-backend/services/accountingService.js` |
| Order model | `apps/pos-backend/models/orderModel.js` |
| Cart store | `apps/pos-frontend2/src/stores/pos-order-store.ts` |
| Offline queue | `apps/pos-frontend2/src/lib/offline-queue.ts`, `pos-check-sync.ts` |
| Payment UI | `apps/pos-frontend2/src/app/(main)/pos/_components/pos-payment-dialog.tsx` |
| License logic | `packages/domain-access/get-organization-access-state.ts` |
| Master audit (in-repo) | `posnew/mdfiles/SYSTEM_AUDIT_MASTER.md` |
| Bigcapital receipts API | `accounting3/stockix/.../api/controllers/Sales/SalesReceipts.ts` |

---

*End of audit. No POS source files were modified.*
