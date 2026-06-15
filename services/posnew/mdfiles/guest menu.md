# Guest Menu / Self-Order Audit (Vendorix Stack)

## Relevant files found

### Frontend (pos-frontend2)
- `apps/pos-frontend2/src/app/self-order/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/guest-menu/page.tsx`
- `apps/pos-frontend2/src/lib/guest-menu-api.ts`
- `apps/pos-frontend2/src/lib/pos-tables-api.ts`
- `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts`
- `apps/pos-frontend2/src/components/pos/pos-root-gate.tsx`
- `apps/pos-frontend2/src/stores/pos-auth-store.ts`
- `apps/pos-frontend2/src/app/(main)/pos/_components/pos-floor-page.tsx`
- `apps/pos-frontend2/src/app/(main)/pos/_hooks/use-pos-session.ts`
- `apps/pos-frontend2/src/lib/pos-order-api.ts`

### Backend (pos-backend)
- `apps/pos-backend/routes/publicRoute.js`
- `apps/pos-backend/controllers/publicController.js`
- `apps/pos-backend/controllers/selfOrderController.js`
- `apps/pos-backend/controllers/publicMenuBrandingController.js`
- `apps/pos-backend/controllers/tableController.js`
- `apps/pos-backend/routes/tableRoute.js`
- `apps/pos-backend/routes/configRoute.js`
- `apps/pos-backend/services/qrMenuScanService.js`
- `apps/pos-backend/models/publicMenuBrandingModel.js`
- `apps/pos-backend/models/qrScanEventModel.js`
- `apps/pos-backend/models/tableModel.js`
- `apps/pos-backend/models/orderModel.js`
- `apps/pos-backend/models/organizationModel.js`
- `apps/pos-backend/app.js`
- `apps/pos-backend/config/config.js`
- `apps/pos-backend/openapi/tenant-pos-v1.yaml`

---

## 1) Frontend scan

### `apps/pos-frontend2/src/app/self-order/page.tsx`
- Renders public menu UI: branding header, category/subcategory sections, item cards.
- Fetches data through `fetchPublicMenu()` from `guest-menu-api`.
- URL params expected:
  - `?table=<tableId>` -> table mode.
  - `?org=<slug>` -> org browse mode.
- Behavior:
  - If neither param exists: "Menu link is incomplete".
  - Table mode fetches by table.
  - Org mode fetches by org slug and shows browse-only banner.
- Hardcoded/fallback values:
  - Accent fallback: `#ca8a04`.
  - Default title fallback: `Menu`.
  - "Ask staff for price" when `showPrices=false`.
- Missing:
  - No cart.
  - No quantity controls.
  - No call to `POST /api/public/self-order`.
  - No guest checkout/submit flow.

### `apps/pos-frontend2/src/app/(main)/dashboard/guest-menu/page.tsx`
- Renders admin dashboard controls for guest menu:
  - Menu source snapshot (categories/items count + preview rows).
  - Branding editor (display name, tagline, logo URL, accent, show prices, location scope).
  - Venue QR block (`/self-order?org=<slug>` browse link).
  - Table QR block (`/self-order?table=<tableId>`).
- Fetches:
  - branding: `fetchPublicMenuBranding`.
  - locations/tables.
  - category + menu item snapshot (POS catalog).
- Mutations:
  - `updatePublicMenuBranding`.
  - `fetchVenueSelfOrderQrBlob`.
  - `posFetchTableQrBlob`.
- Props/params:
  - none from route params.
  - uses current org slug from auth store (`usePosAuthStore`).
- Button status:
  - "Generate QR" (both venue + table): functional, hits backend and renders returned PNG.
  - "Open" (both): functional, opens `/self-order?...` in new tab.

### `apps/pos-frontend2/src/lib/guest-menu-api.ts`
- Defines public menu + branding API client.
- Implements:
  - `fetchPublicMenu({ tableId | orgSlug })` -> `GET /api/public/menu`.
  - `fetchPublicMenuBranding` / `updatePublicMenuBranding` -> config endpoints (authed).
  - `fetchVenueSelfOrderQrBlob` -> `GET /api/config/self-order-venue-qr`.
- Sets anonymous visitor/session headers for menu analytics:
  - `X-Visitor-Key`
  - `X-Session-Id`
- No self-order submit helper implemented.

### `apps/pos-frontend2/src/lib/pos-tables-api.ts`
- Implements `posFetchTableQrBlob(id)` -> `GET /api/table/:id/qr`.
- Table QR endpoint wiring is real.

### `apps/pos-frontend2/src/components/pos/pos-root-gate.tsx` (critical)
- Global auth gate in root layout path.
- Redirects all non-`/login` routes to `/login` when no authenticated user.
- Since `/self-order` is not excluded, guest users are redirected away.
- This currently breaks the intended public guest flow.

### `apps/pos-frontend2/src/navigation/sidebar/sidebar-items.ts`
- Guest menu admin page is linked at `/dashboard/guest-menu`.

### Is `/self-order?org=<slug>` implemented?
- **Page exists** (`/self-order`), query handling exists.
- **But public access is blocked** by `PosRootGate` redirect for unauthenticated users.
- So real-world guest usage currently fails at app gate.

### Does table ID in URL do anything?
- Yes for menu fetch: `?table=<id>` drives `fetchPublicMenu({ tableId })`.
- No for checkout UX: there is no frontend order submit flow.

### Branding wiring: real or mocked?
- Wired to real backend storage and retrieval (`public-menu-branding` endpoints).
- Displayed live in `/self-order`.
- Uses fallback defaults when missing.

### Are "Generate QR" and "Open" buttons functional?
- In dashboard context: yes, both are functional.
- In guest context after scan: blocked by root auth gate unless user already authenticated.

---

## 2) Backend scan

### Public endpoints

#### `apps/pos-backend/routes/publicRoute.js`
- `GET /api/public/menu` (rate-limited) -> `getPublicMenu`.
- `POST /api/public/self-order` (rate-limited) -> `submitSelfOrder`.

#### `apps/pos-backend/controllers/publicController.js`
- `GET /api/public/menu` is implemented.
- Accepts exactly one:
  - `table=<MongoId>`, or
  - `org=<slug>` (+ optional `location=<MongoId>` for branding scope).
- Returns:
  - `branding`
  - `categories` (including parentCategory + sortOrder)
  - `items` (available only)
- Org scoping:
  - Table flow resolves org from table.
  - Org flow resolves by slug.
  - Category/item queries always filtered by `organization: orgId`.
- Analytics:
  - Records scan event if `X-Visitor-Key` present.

#### `apps/pos-backend/controllers/selfOrderController.js`
- `POST /api/public/self-order` is implemented end-to-end in backend.
- Validates:
  - tableId must be valid.
  - non-empty items array.
  - each line has valid menuItem id.
  - org lifecycle is `active`.
- Supports:
  - append lines to existing self-order check for same table.
  - create new order + bind table if no current order.
- Uses transactions and stock checks.
- Emits socket events:
  - `order:new` / `order:updated`
  - `table:status-changed`
- Response includes `orderId`.

### Branding model/schema and persistence

#### `apps/pos-backend/models/publicMenuBrandingModel.js`
- Real model exists with:
  - `scopeKey`
  - `location`
  - `displayName`
  - `tagline`
  - `logoUrl`
  - `accentColor`
  - `showPrices`
  - org scoping via plugin + indexes

#### `apps/pos-backend/controllers/publicMenuBrandingController.js`
- Admin read/write endpoints implemented:
  - `GET /api/config/public-menu-branding`
  - `PUT /api/config/public-menu-branding`
- Supports default and location-specific scope.
- Upsert behavior implemented.
- Emits `catalog:updated` after save.

### QR generation

#### Table QR
- `apps/pos-backend/controllers/tableController.js`
- `GET /api/table/:id/qr` generates PNG encoding:
  - `${publicAppUrl}/self-order?table=${id}`
- URL is correct and includes table id.

#### Venue QR
- `apps/pos-backend/controllers/publicMenuBrandingController.js`
- `GET /api/config/self-order-venue-qr` generates PNG encoding:
  - `${publicAppUrl}/self-order?org=${encodeURIComponent(org.slug)}`
- URL encoding is correct.

### Is self-order submission fully implemented?
- Backend: yes, implemented (not scaffold).
- Frontend guest checkout UI: missing.
- End-to-end (guest browser): incomplete because no public submit UX and public route is auth-gated in frontend.

---

## 3) Data flow trace (guest journey)

## Intended chain
1. Guest scans QR.
2. Opens `/self-order?table=<id>` or `/self-order?org=<slug>`.
3. Frontend loads menu from `GET /api/public/menu`.
4. Guest submits order via `POST /api/public/self-order`.
5. POS sees table/order update.

## Actual chain right now
1. QR resolves to correct URL.
2. Frontend root gate redirects unauthenticated visitor to `/login`.
3. Guest never reaches menu in normal unauthenticated scenario.
4. Even if bypassed/authenticated, page is browse-only (no submit UI).
5. Backend submit endpoint works if called directly (API client/Postman/custom client).

## Where chain breaks
- Primary break: frontend auth gate (`pos-root-gate.tsx`) blocks public route.
- Secondary break: self-order page has no order creation UX.

## Menu source for guest view
- Guest view pulls directly from live POS menu collections:
  - `Category` + `MenuItem` (isAvailable=true), scoped by org.
- It is not a separate copied menu store.

## Multi-tenancy enforcement on public menu endpoint
- Yes for data query: categories/items always filtered by resolved `organization`.
- Org slug path also enforces org lifecycle active.
- Table path does org resolution via table and then org-scoped data fetch.

---

## 4) Gap report

## ✅ Fully working
- Backend public menu endpoint (`GET /api/public/menu`) with org/table context resolution.
- Backend self-order endpoint (`POST /api/public/self-order`) including transactions, stock checks, table binding, socket emits.
- Table QR generation (`GET /api/table/:id/qr`) with correct `?table=` URL.
- Venue QR generation (`GET /api/config/self-order-venue-qr`) with correct `?org=` URL.
- Branding persistence and retrieval (default + per-location scope).
- Guest menu admin page in dashboard with functional Generate/Open actions.

## 🟡 Scaffolded but incomplete
- `/self-order` frontend page supports read-only catalog rendering but not ordering.
- Org browse mode is explicitly browse-only (no submit path).
- Table mode currently only changes fetch context, not checkout behavior.
- Public menu analytics exists (scan events), but no obvious dashboard surfaced in scanned files.

## ❌ Missing entirely
- Guest cart state and item selection UX.
- Guest checkout form + payload builder for `POST /api/public/self-order`.
- Frontend API client function for posting self-orders from guest UI.
- Explicit success/failure UX for guest order submission.

## 🔴 Security / correctness issues
- **Critical functional/security boundary issue:** global `PosRootGate` forces auth on `/self-order`, breaking public flow and forcing guests to login.
- **Public endpoint abuse risk:** `POST /api/public/self-order` is unauthenticated and only IP-rate-limited; no CAPTCHA/challenge/signature. Any actor with valid `tableId` can submit orders (spam risk).
- **Table-ID knowledge exposure risk:** `GET /api/public/menu?table=<id>` resolves by raw table ObjectId; if leaked/guessed, it exposes that table’s org menu.
- **Lifecycle inconsistency:** org-slug path checks `organization.lifecycle === active`; table path does not check org lifecycle before serving menu (suspended org could still serve via table URL).

---

## Direct answers to your explicit checks

- Public menu link `/self-order?org=<slug>` implemented?  
  - Route exists and backend supports it, but guest users are redirected to `/login` by frontend root gate.

- Table QR flow implemented?  
  - QR generation is implemented and includes table id in URL; frontend uses table param to fetch menu context, but does not submit orders from UI.

- Branding (logo/accent/display name/tagline) real data or mocked?  
  - Real data model + endpoints + persistence; page uses saved values with hardcoded fallbacks.

- "Generate QR" and "Open" buttons functional?  
  - Yes in dashboard, but resulting public URL is not truly public due auth gate.

