# Figma specification — navigation & screens

**Section numbering (maps to your 13-point template):** Within each sidebar item, numbered lists **1–13** correspond to: (1) Exact UI label, (2) Purpose, (3) User roles, (4) UI breakdown, (5) Flows, (6) Data model, (7) API integration, (8) Business logic, (9) State management, (10) Permissions & security, (11) Dependencies, (12) UX notes, (13) Figma requirements. POS blocks use `###` headings with the same numeric labels.

**Scope:** This document is derived from the monorepo at `posnew`. It covers:

1. **POS** — `apps/pos-frontend2` routes under `/pos` (selling UI; no classic left nav list like the dashboard).
2. **Restaurant backoffice** — `apps/pos-frontend2` dashboard under `/dashboard` (sidebar: `src/navigation/sidebar/sidebar-items.ts`).
3. **Platform / SaaS owner dashboard** — `apps/saas-dash` (sidebar: `src/navigation/platform-sidebar-items.ts`).

**Cross-cutting (tenant POS / backoffice):**

- **API base:** `posApiFetch` / `posApiJson` (`src/lib/pos-api-fetch.ts`) call the configured POS API origin (`getPosApiOrigin`); requests send `Authorization: Bearer …` and often **`X-Location-Id`** for branch scoping.
- **Permissions:** Strings from `GET /api/user` (stored in `usePosAuthStore`). Client checks use `posCan` (`src/lib/pos-permissions.ts`) — supports `*` and prefix wildcards like `backoffice.*`.
- **Sidebar filtering:** `filterSidebarGroupsByPermissions` drops items whose `permission` fails `posCan`.
- **Page gates:** Many pages wrap content in `AccessGate` (`src/components/access-gate.tsx`) with `redirect` → `/unauthorized` when `posCan` fails after mount.
- **Hostess shell:** `isHostessUser` → minimal nav (`hostessSidebarItems`): **Floor**, **Customers** only; both require `pos.table.read` in that config.

**Master pattern — MDD `ResourcePage` (metadata-driven CRUD):**

Used for several catalog/inventory list screens. Registry: `src/lib/mdd/resource-config.tsx` (`ResourceRegistry`).

- **UI:** Search input, data table (columns from registry), create/edit **dialogs** with Zod-backed forms, delete confirm, toast errors via Sonner.
- **List:** `GET {apiPath}` → response `{ success?, data: T[] }`; table rows from `dataSelector`.
- **Create:** `POST {apiPath}` with JSON body from schema.
- **Update:** `PUT {apiPath}/:id`.
- **Delete:** `DELETE {apiPath}/:id`.
- **State:** TanStack Query (`useQuery` / `useMutation`) + local dialog state; not Redux.

---

# POS Sidebar / navigation

The POS selling experience **does not** mirror the dashboard’s grouped sidebar. Treat these as **first-class navigation / layout regions** for Figma.

---

## 1. POS shell header (global)

### 1. Sidebar item name

- **POS** (brand text) + primary actions: **Floor**, **Dashboard** (conditional), **Sign out**

### 2. Purpose

- Persistent way to return to floor plan, optionally open restaurant backoffice, show who is signed in and branch context, and sign out safely.

### 3. User roles

- **All POS roles** see Floor + Sign out.
- **Dashboard** button: shown only if `hasBackofficePermission` (`*` / `admin.rbac.manage` / `backoffice.*` / any `backoffice.` prefix) **or** fallback when `permissions.length === 0` and role key is `admin` | `manager` | `accountant*` (`src/components/pos/pos-pos-shell.tsx`).

### 4. UI breakdown

- **Header:** sticky bar; brand row (Utensils icon + “POS”).
- **Buttons:** “Floor” (`Link` → `/pos`), “Dashboard” (`Link` → `/dashboard/default`) when allowed, “Sign out” (calls `posLogout` then clears session and `router.replace("/login")`).
- **Card:** truncated name, role label, optional branch label (`locationLabel`).
- **Loading/error:** logout errors → Sonner toast; no inline skeleton on header itself.

### 5. User actions / flows

- **Floor:** navigate to `/pos`.
- **Dashboard:** navigate to default backoffice (subject to backoffice route guards).
- **Sign out:** API logout → clear Zustand session → redirect login.

### 6. Data model

- **User** (session): `_id`, `name`, `role`, `rbacRoleKey`, `permissions[]`, `location` (branch for `X-Location-Id` labeling).

### 7. API integration

- **`POST`** (logout): `posLogout` from `src/lib/pos-auth-api.ts` (exact path in that module; session teardown).

### 8. Business logic

- Dashboard visibility is **client-only**; server must still enforce RBAC on `/dashboard` routes.

### 9. State management

- **`usePosAuthStore`** (Zustand) for `user`, `clearSession`.

### 10. Permissions & security

- Sensitive: **Sign out** clears tokens/session.
- Dashboard link is a **convenience**; real enforcement is `AccessGate` + API.

### 11. Dependencies

- Layout wraps all `/pos/*` pages (`src/app/(main)/pos/layout.tsx`): `PosHostessPosRedirect`, `PosPrintJobListener`, `PosPosShell`, `main` children.

### 12. UX notes

- Clear hierarchy: Floor vs backoffice separation avoids accidental admin entry for cashiers.
- **Suggested:** loading state on logout button while request in flight.

### 13. Figma requirements

- **Frame:** full-width header, max width ~1600px content; responsive wrap.
- **Components:** `Button` outline sm, `Card`/`CardContent` for user meta, `Separator` vertical (hidden on xs).
- **Tokens:** match `border-border/70`, `backdrop-blur`.

---

## 2. Floor plan (`/pos`)

### 1. Sidebar item name

- **Floor** (shell button destination; primary POS landing)

### 2. Purpose

- Visual table map: pick table, create/open session, see occupancy/sync messaging.

### 3. User roles

- Typical: cashier, server, manager. **Hostess** uses minimal dashboard nav but still uses POS floor via `/pos`.

### 4. UI breakdown

- **Title block:** “Floor Plan”, subtitle “Real-time Terminal Sync — Professional Edition”.
- **Branch picker:** when user must pick location (`needsBranchPicker`) — card-style selector.
- **Actions:** create table (disabled when branch required / loading), per-table navigate to **`/pos/t/[tableId]`** (`app/(main)/pos/t/[tableId]/page.tsx`).
- **Table tiles:** status, table number, optional reservation metadata (from `PosTableRow`).
- **Empty/loading:** skeleton/spinner paths in `pos-floor-page.tsx` (large layout).
- **Offline:** `OfflineStatusBanner` where used.

### 5. User actions / flows

- Select branch → load tables for `X-Location-Id`.
- Tap table → open table session (order UI).
- Create table → POST table then refresh list.
- **Edge:** missing/invalid location → picker gating.

### 6. Data model

- **`PosTableRow`:** `_id`, `tableNo`, `seats`, `section`, `status`, `name`, reservation fields, `floorAnchorX/Y`, `visibleInPos`, `currentOrder`, etc. (`src/lib/pos-tables-api.ts`).

### 7. API integration

- **`GET /api/table`** (list; optional location header) — `posFetchTables`.
- **`GET /api/table/:id`** — `posFetchTableById`.
- **`POST /api/table`** — create (`PosTableCreateBody`).
- **`PUT/PATCH`** table update — see `pos-tables-api.ts` for full set.

### 8. Business logic

- Tables can be hidden from POS via `visibleInPos`.
- Status drives color/label in UI.

### 9. State management

- React state + TanStack Query where applicable; branch from auth store.

### 10. Permissions & security

- Table mutations should require appropriate backend role (frontend enables buttons optimistically — verify server).

### 11. Dependencies

- Orders: `currentOrder` preview on tile.

### 12. UX notes

- High-contrast “pro” POS aesthetic (emerald on zinc).
- **Suggested:** explicit legend for table statuses for new staff.

### 13. Figma requirements

- **Layout:** page padding `p-4 md:p-6`, max width 1600px.
- **Grid:** responsive table cards; touch targets for tablet POS.

---

## 3. Table session — catalog rail (`PosCategorySidebar`)

### 1. Sidebar item name

- **POS CATALOG** (header) + **All items** + **dynamic category tree** (nested folders, expand/collapse)

### 2. Purpose

- Filter product grid by category hierarchy; support collapsed width and floating overflow menu.

### 3. User roles

- Same as floor/session operators.

### 4. UI breakdown

- **Header:** logo tile + “POS CATALOG” / “Enterprise Edition” when expanded.
- **Tree rows:** chevron expand, folder icons, leaf rows; `ScrollArea`.
- **Collapsed mode (~80px):** icon column + `FloatingMenu` on hover for deep categories.
- **Inputs:** none (navigation only).
- **Empty:** if no categories — empty tree (Suggested: empty state copy).

### 5. User actions / flows

- Select “all” vs specific category → updates `selectedCategoryId` in parent.
- Expand/collapse parents without navigating (stopPropagation on chevron).

### 6. Data model

- **`PosCategory`:** `_id`, `name`, `sortOrder`, `parentCategory` (id or populated), `color`, `revenueAccount`, `printerAssignment`, etc. (`src/lib/pos-catalog-api.ts`).

### 7. API integration

- Categories loaded in session init: **`GET /api/categories`** — `posFetchCategories`.

### 8. Business logic

- Tree built client-side from flat list + `parentCategory` edges; roots sorted by `sortOrder`.
- Auto-expand ancestors of selected category.

### 9. State management

- Local `useState` for `expanded` set and `activeFloatingMenu`.

### 10. Permissions & security

- Read-only catalog at runtime.

### 11. Dependencies

- **Menu items** list filtered in parent by `selectedCategoryId`.

### 12. UX notes

- Strong enterprise branding; dense uppercase microcopy.

### 13. Figma requirements

- **Two widths:** expanded `w-72`, collapsed `w-20`.
- **Component:** tree row (indent per level), active row state (emerald).

---

## 4. Table session — product grid (`PosProductGrid`)

### 1. Sidebar item name

- (Center column; not sidebar — document for layout completeness)

### 2. Purpose

- Search, barcode entry, pick items into cart.

### 3. User roles

- Cashier / server.

### 4. UI breakdown

- **Search** text field; **barcode** input with submit handling; **product tiles** with availability hints when `availabilityMap` says cannot fulfill.
- **Locked state:** when `orderLinesLocked` true — picking disabled.
- **Loading:** catalog loading handled at page level.

### 5. User actions / flows

- Type search → filters grid.
- Scan/submit barcode → `normalizeInventoryBarcodeScan` → if maps to menu item, `pickItem`.
- **Edge:** strict inventory policy blocks add (toast).

### 6. Data model

- **`PosMenuItem`:** `_id`, `name`, prices (`priceUsd` / `priceLbp`), `category`, `isAvailable`, `sku`, `imageUrl`, `categoryFullPath`, …

### 7. API integration

- **`GET /api/menu-items?available=true`** — `posFetchMenuItems` in session init.
- **Inventory:** `fetchInventoryMenuAvailability` (see `src/lib/inventory-api.ts` for path) — TanStack Query in `usePosSession`.
- **Barcode normalize:** `normalizeInventoryBarcodeScan` (`inventory-api.ts`).
- **FX (optional display):** **`GET /api/accounting/fx/resolve?from=USD&to=LBP`**.

### 8. Business logic

- **`useInventoryPosPolicyQuery`:** `strictOversell` blocks quantity increases / adds when stock insufficient.

### 9. State management

- Parent `usePosSession` + `usePosOrderStore` for cart; local search/barcode state in `PosTableSessionPage`.

### 10. Permissions & security

- Payment/refund dialogs separate; grid is pre-payment.

### 11. Dependencies

- Accounting config query: `posFetchAccountingConfig` → **`GET /api/accounting/config`** for tax/service charge and stock deduct trigger display in cart.

### 12. UX notes

- Barcode is power-user flow — ensure field is keyboard-first.

### 13. Figma requirements

- **Three-column desktop:** category rail | grid | check ledger; **stack** on mobile (document breakpoints from `pos-table-session-page.tsx`).

---

## 5. Table session — check ledger (`PosCartSidebar`)

### 1. Sidebar item name

- **Check Ledger** (right panel)

### 2. Purpose

- Line items, qty bump/remove, subtotal/taxes/service charge/total, payment, kitchen send, receipt preview, void, refund.

### 3. User roles

- Cashier (payment), manager (void/refund — backend should enforce).

### 4. UI breakdown

- **Header:** status dot + title + “Real-time Terminal Sync”; optional chip for **stock deduct trigger** (`kitchen_send` | `payment` | other).
- **Lines:** each `PosCartLineItem` — qty controls, remove, availability warnings.
- **Footer:** totals breakdown (`BillBreakdown` from `pos-bill-utils`), **Pay**, **Send to kitchen**, **Preview receipt**, **Void**, **Refund** (icons per `pos-cart-sidebar.tsx`).
- **Empty state:** dashed card “Cart is empty”.
- **Busy:** `paying`, `sendingToKitchen`, `busy` props disable actions.

### 5. User actions / flows

- Adjust qty → sync to server via order patch (store + `persistPosCheckToServer` / APIs — see `pos-check-sync`, `posPatchOrderItems`).
- **Pay** → `PosPaymentDialog` → `posMarkOrderPaid` (**`PATCH /api/order/:id/status`** body `orderStatus: "paid"`, `paymentMethod`).
- **Send to kitchen** → kitchen print/status workflow (busy state).
- **Void** → confirm dialog → **`DELETE /api/order/:id`** (`posDeleteOrder`).
- **Refund** → `PosRefundDialog` (separate flow).
- **Edge:** accounting posting failures surfaced via `describeAccountingPostingFailures` on paid response.

### 6. Data model

- **`PosCartLine`** (Zustand): line id, `menuItem`, `name`, `quantity`, `pricePerQuantity`, notes, etc.
- **`PosOrder` / lines** for server mirror.

### 7. API integration (core)

- **`GET /api/order/for-table/:tableId`** — `posGetOpenOrderForTable`.
- **`POST /api/order/`** — `posCreateOrder` (new check).
- **`PATCH /api/order/:id/items`** — `posPatchOrderItems` / `posPatchOrderReplaceLines`.
- **`PATCH /api/order/:id/status`** — pay or other status (`posMarkOrderPaid`, `posUpdateOrderStatus`).
- **`POST /api/order/:id/print`** — `posPrintOrder` (kitchen/receipt).
- **`DELETE /api/order/:id`** — void.
- **Tax config:** `posFetchTaxConfig` (`pos-config-api.ts`).

### 8. Business logic

- **`calculateOrderBills`:** tax lines, service charge, multi-currency display using FX rate query.

### 9. State management

- **`usePosOrderStore`** (Zustand): cart, `activeOrderId`, `orderLinesLocked`, table context, hydrate/replace from server.

### 10. Permissions & security

- **Sensitive:** void (DELETE), refund, mark paid — must be server-authoritative.

### 11. Dependencies

- Printers: `posFetchPrinters`, `pickDefaultThermalReceiptPrinterId` for receipt print target.

### 12. UX notes

- Totals sticky footer is correct pattern for POS.
- **Suggested:** show payment method on success banner.

### 13. Figma requirements

- **Right rail:** fixed width `md:w-[340px] xl:w-[380px]`; mobile fixed height `h-[460px]` — **critical** for hardware design.

---

## 6. `PosMenuNavigator` (alternate menu UI)

### 1. Sidebar item name

- **All Menu** + category buttons (separate from `PosCategorySidebar`; used in other POS flows)

### 2. Purpose

- Simpler flat category list + grid (see `pos-menu-navigator.tsx`).

### 3–13.

- **Suggested:** treat as variant layout in Figma “POS — Menu navigator variant”; same data as catalog APIs above.

---

# Restaurant backoffice sidebar (`apps/pos-frontend2`)

**Source of truth for labels & URLs:** `src/navigation/sidebar/sidebar-items.ts`.

**Not in sidebar (footer):** user menu includes **Notifications** link `/dashboard/notifications` — design shell footer separately.

Below, items **without** `permission` in config rely on **page-level** `AccessGate` or implicit login-only access — verify per page in code.

---

## Master — shared technical appendix (backoffice)

### API response shape (typical)

- JSON: `{ success?: boolean, message?: string, data?: T, page?: number, limit?: number, total?: number }` (`PosApiJson`).

### MDD resources (`ResourceRegistry`)

| Registry key           | Label                 | Permission                 | List path                      |
| ---------------------- | --------------------- | -------------------------- | ------------------------------ |
| `categories`           | Menu Categories       | `backoffice.catalog.read`  | `GET/POST/PUT/DELETE /api/categories` |
| `menuItems`            | Menu Items            | `backoffice.catalog.read`  | `GET/POST/PUT/DELETE /api/menu-items` |
| `ingredients`          | Inventory Ingredients | `backoffice.inventory.read`| `GET/POST/PUT/DELETE /api/ingredients` |
| `ingredientCategories` | Ingredient Categories | `backoffice.inventory.read`| `GET/POST/PUT/DELETE /api/ingredient-categories` |
| `locations`            | Locations (Branches)  | `backoffice.location.read` | `GET/POST/PUT/DELETE /api/locations` |

**Menu items extra actions (UI):** toggle availability (`switch` column), open recipe editor, variants dialog — see `src/app/(main)/dashboard/menu-items/page.tsx` and related components.

### Accounting client

- Large surface: **`src/lib/pos-accounting-api.ts`** — all `/api/accounting/*` routes (accounts, ledger, PnL, balance sheet, cash flow, budgets, recurring journals/invoices, AR/AP tools, consolidation, expense reports, approvals, exports, gift cards, FX helpers, etc.). Individual accounting pages compose these functions.

### State (general)

- **TanStack Query** for server data; **Zustand** for POS session/auth (`usePosAuthStore`), preferences (`usePreferencesStore`); forms often **React Hook Form + Zod**.

---

## Dashboards — Default Dashboard

**Label:** Default Dashboard — **`/dashboard/default`**

1. **Purpose:** Executive snapshot — revenue/cost/profit/visitors + time-series chart + demo proposal table.
2. **Roles:** Logged-in staff with route access (no sidebar-level permission string).
3. **UI:** `DevDashboardDataNotice`; `SectionCards` (KPI cards + range); `ChartAreaInteractive` (range `7d|30d|90d`, auto `7d` on mobile); `ProposalSectionsTable` (static `data.json` demo).
4. **Flows:** Change date range → refetch.
5. **Data model:** `DefaultDashboardPayload` — `summary`, `chartData[]`, `displayCurrency`, `range`, `tz`.
6. **API:** **`GET /api/dashboard/default?range=`** (`fetchDashboardDefault`).
7. **Business logic:** Range validated to union type on client.
8. **State:** `useQuery` keyed `["dashboard","default",range,"live"]`.
9. **Permissions:** **Suggested:** explicit `AccessGate` if product requires non-manager visibility control.
10. **Security:** Read-only analytics.
11. **Dependencies:** Accounting/revenue backend aggregation.
12. **UX:** Proposal table is **demo** — flag in Figma as “sample content”.
13. **Figma:** dashboard grid `@container/main`, card + chart vertical stack.

---

## Dashboards — CRM

**Label:** CRM — **`/dashboard/crm`** (page metadata title: **Operations**)

1. **Sidebar item name:** CRM.
2. **Purpose:** Operations / CRM-style dashboard — sales rhythm charts, staff performance, low stock callouts, top products table (not a traditional “leads pipeline” in code; name is legacy vs content).
3. **User roles:** Authenticated backoffice users who can open the route (no dedicated `permission` on sidebar item).
4. **UI breakdown:** `DevDashboardDataNotice`; `OverviewCards` (busy hour, AOV, daily orders Recharts, paid order count, top product); `InsightCards` (top items bar); `OperationalCards` (staff performers, low stock list); `TopProductsTable` (TanStack Table); `CrmErrorBoundary`; skeleton until client chart mount (`useClientVisualReady`).
5. **Flows:** Page load → parallel queries; error states show joined error strings per widget group.
6. **Data model:** Report DTOs from sales/top-items/staff reports + `IngredientLean[]` for low stock rows (see `use-crm-dashboard-queries.ts`).
7. **API integration:** **`GET /api/reports/sales?…`** (`fetchSalesReport`), **`GET /api/reports/top-items?…`** (`fetchTopItemsReport`), **`GET /api/reports/staff?…`** (`fetchStaffReport`), **`GET /api/inventory/low-stock?…`** (`fetchInventoryLowStock`). Dev mocks: `shouldUseDevDashboardMocks` may swap **Suggested** local JSON instead of live API when enabled (`dashboard-dev-mocks`).
8. **Business logic:** Range window via `buildReportRangeWindow`; dedupe top items by `menuItemId` with summed qty/revenue; low stock capped (`LOW_STOCK_LIMIT = 20`).
9. **State management:** TanStack Query (`retry: 1`, `staleTime: 60_000`); React state for visual readiness.
10. **Permissions & security:** Read-only analytics; org/branch scoping follows global POS API headers.
11. **Dependencies:** Inventory module for low stock; reports API for charts.
12. **UX notes:** Deferred chart mount avoids Recharts hydration issues — brief skeleton is intentional.
13. **Figma requirements:** Vertical stack of four card regions + full-width table; reserve loading and inline error text per section.

---

## Dashboards — Finance

**Label:** Finance — **`/dashboard/finance`**

1. **Sidebar item name:** Finance.
2. **Purpose:** Personal-finance-style **tenant finance overview** (tabs: Overview, Activity, Insights, Utilities) with optional **`?demo=1|true`** demo dataset for overview tab (`FinanceDemoOverview`).
3. **User roles:** Backoffice users with route access.
4. **UI breakdown:** `Tabs` / `TabsList` / four `TabsTrigger`; Overview non-demo: KPI grid (`PrimaryAccount`, `NetWorth`, `MonthlyCashFlow`, `SavingsRate`), `CashFlowOverview`, `SpendingBreakdown`, `IncomeReliability`, `CardOverview`; demo path replaces grid with `FinanceDemoOverview`; other tabs: `FinanceActivityTab`, `FinanceInsightsTab`, `FinanceUtilitiesTab`.
5. **Flows:** User switches tabs; optional demo via URL param (marketing / training).
6. **Data model:** **Suggested:** per-component props from each `_components/*` file (many widgets are composite).
7. **API integration:** Not centralized in `page.tsx` — each child component may call `posApiJson` / accounting APIs (**Suggested:** grep `finance/_components` for `/api/`).
8. **Business logic:** Demo flag purely client branch in RSC `Page` reading `searchParams`.
9. **State management:** Server component wrapper + client islands inside tabs.
10. **Permissions & security:** Treat finance widgets as sensitive if they ever show real bank connections (**Suggested** product review).
11. **Dependencies:** Overlaps conceptually with **Accounting** sidebar but this page is a distinct UX surface.
12. **UX notes:** Four tabs reduce clutter; demo mode should be clearly labeled in Figma (banner).
13. **Figma requirements:** Tabs flush under header; overview uses responsive `grid-cols-1 sm:2 lg:4` KPI row + two-column lower block.

---

## Overview — Floor

**Label:** Floor — **`/dashboard/floor`**

1. **Purpose:** Backoffice view of dining floor / tables (distinct from `/pos` floor — compare `floor/page.tsx`).
2. **Roles:** Managers; hostess nav includes with `pos.table.read`.
3. **UI:** Table management / layout — buttons for edit/create **Suggested** per actual page components.
4. **API:** likely **`/api/table`** family + location header.
5. **Permissions:** `pos.table.read` on hostess variant.
6. **Figma:** differentiate **POS floor** (dark, marketing-heavy) vs **dashboard floor** (shadcn dashboard chrome).

---

## Menu & Catalog — Categories

**Label:** Categories — **`/dashboard/categories`**

1. **Purpose:** Maintain menu category tree and GL revenue mapping metadata.
2. **Roles:** Users with `backoffice.catalog.read` (writes **Suggested:** `backoffice.catalog.write` on server).
3. **UI (MDD):** columns: name, parent, revenue GL, sort order, row actions (edit/delete icons).
4. **Dialogs:** create/edit category form (parent select, color, revenue account, printer assignment **Suggested**).
5. **API:** registry **`/api/categories`**.
6. **Data model:** matches `PosCategory` fields + Mongo `_id`.
7. **State:** TanStack Query + dialog state inside `ResourcePage`.
8. **Permissions:** `AccessGate` via `resource.permission`.
9. **Sensitive:** delete category impacts menu items referencing it — server validation expected.
10. **Figma:** standard admin table + modal forms; mono font for GL code column.

---

## Menu & Catalog — Menu Items

**Label:** Menu Items — **`/dashboard/menu-items`**

1. **Purpose:** Full menu engineering — items, prices, availability, recipes entry point, variants.
2. **Roles:** `backoffice.catalog.read`.
3. **UI:** MDD table — image, name, category badge (`categoryFullPath` preferred), dual currency price display, availability **switch**, actions: edit, recipe, variants, delete.
4. **Flows:** Toggle availability inline; open recipe page prefilled; manage variants dialog.
5. **API:** **`/api/menu-items`** + auxiliary endpoints for variants/recipes (grep `menu-items` folder).
6. **Business logic:** Prices USD/LBP; deprecated single `price` field still handled in types.
7. **State:** query invalidation on mutations (`ResourceRegistry.menuItems`).
8. **Figma:** wide table; image thumbnails; sticky action column.

---

## Menu & Catalog — Guest menu

**Label:** Guest menu — **`/dashboard/guest-menu`**

1. **Purpose:** Configure guest-facing / QR menu experience.
2. **Roles:** Marketing/manager.
3. **UI:** See `guest-menu/page.tsx` + `guest-menu-api.ts` — forms/sections for public menu.
4. **API:** functions in **`src/lib/guest-menu-api.ts`** (inspect for REST paths).
5. **Figma:** preview panel + settings form split.

---

## Stock — Core — Ingredients

**Label:** Ingredients — **`/dashboard/ingredients`** — permission **`backoffice.inventory.read`**

1. **Purpose:** Ingredient master — SKU, units, stock thresholds, supplier link action.
2. **UI (MDD):** name, SKU, category, unit badge, on hand, reorder threshold, status badge, actions: supplier links, edit, delete.
3. **API:** **`/api/ingredients`**.
4. **Figma:** inventory table density; supplier link icon column.

---

## Stock — Core — Ing. Categories

**Label:** Ing. Categories — **`/dashboard/ingredient-categories`** — **`backoffice.inventory.read`**

1. **Purpose:** Classify ingredients (tax code, sort).
2. **UI:** MDD — name, tax code, sort, actions.
3. **API:** **`/api/ingredient-categories`**.

---

## Stock — Core — Suppliers

**Label:** Suppliers — **`/dashboard/suppliers`** — **`backoffice.inventory.read`**

1. **Purpose:** Vendor master for PO/GRN.
2. **UI:** Custom page (not in small `ResourceRegistry` excerpt) — expect table + dialogs.
3. **API:** **`/api/suppliers`** family (**Suggested:** confirm in `suppliers/page.tsx`).

---

## Stock — Core — Purchase Orders

**Label:** Purchase Orders — **`/dashboard/purchase-orders`**

1. **Purpose:** Create/approve/track POs.
2. **UI:** List + detail routes **Suggested:** `purchase-orders/[id]` if present.
3. **API:** **`/api/purchase-orders`** or procurement namespace — confirm in page.

---

## Stock — Core — Goods receipt notes

**Label:** Goods receipt notes — **`/dashboard/goods-receipt-notes`**

1. **Purpose:** Record inbound stock against POs.
2. **UI:** Table + receive workflow dialogs.
3. **API:** GRN endpoints under inventory/procurement (`goods-receipt-notes`).

---

## Stock — Core — Recipes

**Label:** Recipes — **`/dashboard/recipes`**

1. **Purpose:** BOM / recipe editor linking menu items to ingredients.
2. **UI:** `recipes-editor.tsx` — selectors for menu item/variant, ingredient lines, scaling.
3. **API:** multiple (`/api/recipes`, ingredients, menu-items) — grep `recipes` folder.
4. **Figma:** complex editor — master-detail, sticky save bar.

---

## Stock — Core — Inventory

**Label:** Inventory — **`/dashboard/inventory`**

1. **Purpose:** Stock levels, adjustments entry (per `inventory/page.tsx`).
2. **API:** inventory endpoints (`/api/inventory/...` **Suggested**).

---

## Stock — Core — Stock Take

**Label:** Stock Take — **`/dashboard/inventory/stock-take`**

1. **Purpose:** Physical count sessions.
2. **UI:** likely multi-step count sheet.
3. **API:** stock-take routes.

---

## Stock — Core — Warehouse

**Label:** Warehouse — **`/dashboard/warehouse`**

1. **Purpose:** Warehouse/bin level ops.
2. **UI:** `warehouse/page.tsx`.

---

## Stock — Core — Menu availability

**Label:** Menu availability — **`/dashboard/inventory/menu-availability`**

1. **Purpose:** Tie stock to sellable menu items.
2. **API:** overlaps POS availability fetch used in session.

---

## Stock — Extended — RFQ

**Label:** RFQ — **`/dashboard/procurement/rfq`** (+ **`/new`**, **`/[id]`**)

1. **Purpose:** Request for quote lifecycle.
2. **UI:** list / detail / create pages.
3. **API:** procurement service paths — read `procurement/rfq/*.tsx`.

---

## Stock — Extended — 3-Way match

**Label:** 3-Way match — **`/dashboard/procurement/reconciliation`**

1. **Purpose:** PO / receipt / invoice matching.
2. **UI:** comparison table.

---

## Stock — Extended — Vendor returns (RTV)

**Label:** Vendor returns (RTV) — **`/dashboard/inventory/vendor-returns`** (+ **`/[id]`**)

1. **Purpose:** Return stock to vendor; **`AccessGate`** `backoffice.inventory.read` on pages.
2. **UI:** heavy client components (grep shows large `page.tsx`).

---

## Stock — Extended — Customer returns

**Label:** Customer returns — **`/dashboard/inventory/returns`**

1. **Purpose:** Post-sale customer returns processing.

---

## Stock — Extended — Inventory analytics

**Label:** Inventory analytics — **`/dashboard/inventory/analytics`**

1. **Purpose:** Charts/KPIs for stock — `AccessGate` `backoffice.inventory.read`.

---

## Stock — Extended — Barcode lookup

**Label:** Barcode lookup — **`/dashboard/inventory/barcode-lookup`**

1. **Purpose:** Resolve barcode → item/variant/ingredient (admin tool); shares normalize logic with POS.

---

## Stock — Extended — Serial tracker

**Label:** Serial tracker — **`/dashboard/inventory/serials`** (+ **`/[serial]`**)

1. **Purpose:** Serialized item traceability.

---

## Business — Staff

**Label:** Staff — **`/dashboard/staff`**

1. **Purpose:** Staff users / roles assignment UI.
2. **API:** **`GET /api/users`** (see `pos-users` / staff modules).

---

## Business — Locations

**Label:** Locations — **`/dashboard/locations`**

1. **Purpose:** Branches / addresses (MDD **`/api/locations`**).
2. **Permission:** `backoffice.location.read`.

---

## Business — Printers

**Label:** Printers — **`/dashboard/printers`**

1. **Purpose:** Thermal/kitchen printer setup; ties to `posFetchPrinters` consumer on POS.
2. **API:** printer endpoints in `pos-printer-api.ts`.

---

## Business — Customers

**Label:** Customers — **`/dashboard/customers`**

1. **Purpose:** CRM-style customer records; hostess sidebar includes with `pos.table.read`.
2. **UI:** table + profile edit.

---

## Business — Tax & treasury

**Label:** Tax & treasury — **`/dashboard/tax`**

1. **Purpose:** Tax rates, treasury, **FX** tab deep-link **`?tab=fx`** from accounting extended nav.
2. **UI:** tabs per `tax/page.tsx`.

---

## Business — Reports

**Label:** Reports — **`/dashboard/reports`**

1. **Purpose:** Operational reports hub (sales, inventory, **Suggested** subsets).

---

## Business — Discounts

**Label:** Discounts — **`/dashboard/discounts`**

1. **Purpose:** Manage discounts/promotions.

---

## Accounting — Core — Overview

**Label:** Overview — **`/dashboard/accounting`**

1. **Purpose:** Accounting home — cards/links to submodules (copy references sidebar in-page).

---

## Accounting — Core — Chart of accounts

**Label:** Chart of accounts — **`/dashboard/accounting/accounts`** (+ **`/[id]`**)

1. **Purpose:** GL accounts list/detail.
2. **API:** **`GET/POST /api/accounting/accounts`**, **`GET/PATCH /api/accounting/accounts/:id`**, ledger sub-route **`GET /api/accounting/accounts/:id/ledger`**.

---

## Accounting — Core — Entries

**Label:** Entries — **`/dashboard/accounting/ledger`** (+ **`/journal/[id]`**)

1. **Purpose:** Journal entries list + editor/viewer.
2. **API:** journal endpoints in `pos-accounting-api.ts`.

---

## Accounting — Core — GL settings

**Label:** GL settings — **`/dashboard/accounting/settings`**

1. **Purpose:** Configure posting rules, tax integration, service charge, etc.
2. **API:** **`GET/PATCH /api/accounting/config`**, **`POST /api/accounting/ensure-defaults`**.

---

## Accounting — Core — Register sessions

**Label:** Register sessions — **`/dashboard/accounting/sessions`**

1. **Purpose:** Cash register / Z-reports style session tracking (**Suggested** naming).

---

## Accounting — Core — Trial balance

**Label:** Trial balance — **`/dashboard/accounting/trial-balance`**

1. **API:** **`GET /api/accounting/reports/trial-balance?...`**.

---

## Accounting — Core — Profit & Loss

**Label:** Profit & Loss — **`/dashboard/accounting/pnl`**

1. **API:** **`GET /api/accounting/reports/pnl?...`**.

---

## Accounting — Core — Fiscal periods

**Label:** Fiscal periods — **`/dashboard/accounting/periods`**

1. **Purpose:** Open/close accounting periods (locking).

---

## Accounting — Extended — Balance sheet

**Label:** Balance sheet — **`/dashboard/accounting/balance-sheet`**

1. **API:** **`GET /api/accounting/reports/balance-sheet?...`** (`posFetchBalanceSheet`).
2. **Purpose:** Statement of financial position; filters for as-of date **Suggested** from query builder in API client.

---

## Accounting — Extended — Cash flow

**Label:** Cash flow — **`/dashboard/accounting/cash-flow`**

1. **API:** **`GET /api/accounting/reports/cash-flow?...`**.

---

## Accounting — Extended — Budget vs actual

**Label:** Budget vs actual — **`/dashboard/accounting/budget-vs-actual`**

1. **API:** **`GET /api/accounting/reports/budget-vs-actual?...`**.

---

## Accounting — Extended — Budgets

**Label:** Budgets — **`/dashboard/accounting/budgets`**

1. **API:** **`GET/POST /api/accounting/budgets`**, **`PATCH/DELETE /api/accounting/budgets/:id`** (409 if period locked).

---

## Accounting — Extended — Exchange rates

**Label:** Exchange rates — **`/dashboard/tax?tab=fx`** (sidebar URL)

1. **Purpose:** FX management inside Tax & treasury (not a separate route file in sidebar).
2. **Figma:** show sidebar **active** state on Tax item + **FX tab** selected; deep-link state in URL.

---

## Accounting — Extended — Recurring journals

**Label:** Recurring journals — **`/dashboard/accounting/recurring-journals`**

1. **API:** **`/api/accounting/recurring-templates`** (GET/POST/PATCH/DELETE, **`POST .../:id/run`**).

---

## Accounting — Extended — Invoices (AR)

**Label:** Invoices (AR) — **`/dashboard/accounting/invoices`**

1. **Purpose:** Accounts receivable invoices list/issue.

---

## Accounting — Extended — Recurring invoices

**Label:** Recurring invoices — **`/dashboard/accounting/recurring-invoices`**

1. **API:** **`/api/accounting/recurring-invoices`** (+ run endpoint per `pos-accounting-api.ts`).

---

## Accounting — Extended — AR aging

**Label:** AR aging — **`/dashboard/accounting/ar-aging`**

1. **Purpose:** Aging buckets report.

---

## Accounting — Extended — Customer statement

**Label:** Customer statement — **`/dashboard/accounting/customer-statement`**

1. **Purpose:** Printable/exportable statement for a customer.

---

## Accounting — Extended — Supplier statement

**Label:** Supplier statement — **`/dashboard/accounting/supplier-statement`**

1. **Purpose:** AP-style supplier statement.

---

## Accounting — Extended — Credit notes

**Label:** Credit notes — **`/dashboard/accounting/credit-notes`** (+ **`/[id]`**)

1. **Purpose:** AR credit notes issuance/detail.

---

## Accounting — Extended — Vendor bills (AP)

**Label:** Vendor bills (AP) — **`/dashboard/accounting/vendor-bills`** (+ **`/[id]`**)

1. **Purpose:** Enter/match vendor bills.

---

## Accounting — Extended — Expense reports

**Label:** Expense reports — **`/dashboard/accounting/expense-reports`** (+ **`/[id]`**) — permission **`backoffice.accounting.expenses.read`**

1. **API:** **`GET/POST /api/accounting/expense-reports`**, **`GET/PATCH .../:id`**, **`POST .../:id/submit|approve|reject|post-gl`** (exact set in `pos-accounting-api.ts`).

---

## Accounting — Extended — Approvals inbox

**Label:** Approvals inbox — **`/dashboard/accounting/approvals`** — permission **`backoffice.accounting.approvals.read`**

1. **API:** **`GET/POST /api/accounting/approval-requests`**, approve/reject PATCH-style routes on id.

---

## Accounting — Extended — Consolidated reports

**Label:** Consolidated reports — **`/dashboard/accounting/consolidated`** — permission **`backoffice.accounting.consolidated.read`**

1. **API:** **`GET /api/accounting/consolidation/child-organizations`**, consolidated trial balance / PnL / balance sheet query variants under `/api/accounting/reports/consolidated/...`.

---

## Accounting — Extended — Audit log

**Label:** Audit log — **`/dashboard/accounting/audit-log`**

1. **Purpose:** Immutable-style read of accounting changes **Suggested** (verify backend fields in page).

---

## Accounting — Extended — GL exports

**Label:** GL exports — **`/dashboard/accounting/exports`**

1. **Purpose:** Download posting files for external ERP.

---

## Accounting — Extended — Gift cards

**Label:** Gift cards — **`/dashboard/accounting/gift-cards`**

1. **Purpose:** Liability tracking / redemption for gift cards.

---

## Accounting — Extended — Order GL tools

**Label:** Order GL tools — **`/dashboard/accounting/order-gl`**

1. **Purpose:** Repair/replay order → GL posting tooling for support.

---

## Accounting — Extended — Bank (beta)

**Label:** Bank (beta) — **`/dashboard/accounting/bank`**

1. **Purpose:** Bank feed / reconciliation beta surface.

---

## System — Roles & RBAC

**Label:** Roles & RBAC — **`/dashboard/rbac`**

1. **Purpose:** Define roles and permission strings consumed by POS/backoffice (`posCan`).
2. **Sensitive:** misconfiguration grants broad `*` or `backoffice.*`.
3. **Figma:** matrix view (roles × permissions) **Suggested** if not already.

---

## System — POS sign-in

**Label:** POS sign-in — **`/login`** (external to `/dashboard` layout)

1. **Purpose:** Staff authentication; issues tokens used by `posApiFetch`.
2. **Figma:** full-screen login, not dashboard shell.

---

# Platform admin sidebar (`apps/saas-dash`)

**Source:** `src/navigation/platform-sidebar-items.ts`. **Filtering:** `hasPermission(roles, entry.perm, apiScopes)` in `platform-app-sidebar.tsx`. **Groups:** “platform”, “settings”, “security” categories become sidebar groups.

**HTTP:** `platformJson` + `platformEndpoints` (`src/lib/platform-http.ts`, `platform-endpoints.ts`) against platform API (separate from tenant POS API).

**Permission constants:** `src/lib/permissions.ts` — `P.ORG_READ`, `P.ORG_WRITE`, `P.METRICS_READ`, `P.WEBHOOK_ADMIN`, `P.QUEUE_ADMIN`, `P.FLAG_ADMIN`, `P.COMPLIANCE_RUN`, `P.INVITE_ADMIN`, `P.AUDIT_READ`, `P.IMPERSONATE`.

---

## Overview (`/`)

1. **Perm:** `metrics:read`.
2. **Purpose:** SaaS operator metrics / health at platform scope.
3. **API:** platform metrics routes consumed by home page (inspect `apps/saas-dash/src/app` root page).
4. **Figma:** KPI grid + charts; shell from `DashboardAppSidebar`.

---

## Organizations (`/organizations`)

1. **Perm:** `org:read`.
2. **Purpose:** Tenant org directory, health summary (`platformEndpoints.organizations.healthSummary`).
3. **Figma:** searchable table + org detail drawer.

---

## Global Users (`/users`)

1. **Perm:** `org:read`.
2. **Purpose:** Cross-tenant user listing/admin.

---

## Jobs (`/jobs`)

1. **Perm:** `queue:admin`.
2. **API:** `platformEndpoints.jobs.list`, `.detail(queue,id)`.
3. **Purpose:** Queue inspection / retry / DLQ-style ops **Suggested**.

---

## Notifications (`/notifications`)

1. **Perm:** `audit:read`.
2. **API:** list unread/read; **`GET /notifications/unread-count`**; mark read paths in `platformEndpoints.notifications`.
3. **UI:** Sidebar badge from `useNotificationStore` + server sync query.

---

## Reports (`/reports`)

1. **Perm:** `metrics:read`.
2. **Purpose:** Platform-level reporting (distinct from tenant `/dashboard/reports`).

---

## Audits (`/audits`)

1. **Perm:** `audit:read`.
2. **Purpose:** Compliance/audit trail across orgs (uses `auditsDefaultOrgId` pref in sidebar data fetch patterns).

---

## Webhooks (`/webhooks`)

1. **Perm:** `webhook:admin`.
2. **Sensitive:** secret rotation, delivery logs.

---

## Compliance (`/compliance`)

1. **Perm:** `compliance:run`.
2. **Purpose:** Run compliance jobs / exports **Suggested**.

---

## API keys (`/api-keys`)

1. **Perm:** `org:write`.
2. **Sensitive:** create/revoke platform API keys.

---

## Developers (`/developers`)

1. **Perm:** `org:read`.
2. **Purpose:** Docs / SDK / integration entry **Suggested**.

---

## Devices (`/devices`)

1. **Perm:** `org:read` (category `security`).
2. **API:** `platformEndpoints.devices.*` — list, pending count, approve, revoke, nickname, remove.
3. **UI:** pending count badge query keyed with optional `organizationId`.

---

## System (`/system`)

1. **Perm:** `org:write` (settings category).
2. **Purpose:** Global platform configuration.

---

## Flags (`/flags`)

1. **Perm:** `flag:admin`.
2. **Purpose:** Feature flag management.

---

## Team (`/team`)

1. **Perm:** `invite:admin`.
2. **Purpose:** Invite/manage platform team users.

---

## Document maintenance

- When adding a sidebar entry, update **`sidebar-items.ts`** or **`platform-sidebar-items.ts`** and mirror here.
- For **full per-screen control inventories** (every button on accounting sub-pages), grep the corresponding `page.tsx` and `_components/*` — this file maps **navigation scope** and **primary API surfaces** to unblock Figma IA and shell design.
