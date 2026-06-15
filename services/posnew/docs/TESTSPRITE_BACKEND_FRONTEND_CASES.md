# TestSprite Test Cases (Backend + Frontend)

## 1) Scope

- **Backend app:** `apps/pos-backend`
- **Frontend app:** `apps/pos-frontend2`
- **Primary flows:** Auth/RBAC, tenant isolation, POS order lifecycle, payment settlement, inventory deduction, accounting posting visibility, public self-order

## 2) Environment and Preconditions

- Backend is running with valid `.env` (`MONGODB_URI`, `JWT_SECRET`, `PORT`).
- Frontend is running with `NEXT_PUBLIC_POS_API_ORIGIN` pointing to backend.
- At least 2 organizations exist for tenant-isolation tests.
- Test users exist with different role profiles (admin, staff, kitchen, restricted role).
- Seeded tables/menu items/ingredients exist for POS and inventory flows.

---

## 3) Backend Test Cases

### BE-001 - Auth required on protected API

- **Priority:** P0
- **Type:** Security
- **Endpoint(s):** any protected route (example: `GET /api/order`)
- **Preconditions:** no auth token/cookie
- **Steps:**
  1. Send request without credentials.
- **Expected:**
  - API returns 401 or equivalent unauthorized response.
  - No business data is returned.

### BE-002 - RBAC deny on restricted action

- **Priority:** P0
- **Type:** Authorization
- **Endpoint(s):** action requiring elevated permission (example: accounting write)
- **Preconditions:** authenticated user without required permission
- **Steps:**
  1. Call protected action with restricted role.
- **Expected:**
  - API returns 403.
  - No mutation occurs in DB.

### BE-003 - RBAC allow on permitted action

- **Priority:** P0
- **Type:** Authorization
- **Endpoint(s):** `GET /api/rbac/me` + one allowed write action
- **Preconditions:** authenticated user with required role
- **Steps:**
  1. Fetch effective permissions.
  2. Execute permitted action.
- **Expected:**
  - Permissions include required capability.
  - Action succeeds and persists expected change.

### BE-004 - Tenant isolation (cross-org read blocked)

- **Priority:** P0
- **Type:** Multi-tenancy
- **Endpoint(s):** read endpoint using resource id from another org
- **Preconditions:** user from Org A, target resource in Org B
- **Steps:**
  1. Attempt fetch using Org B resource id.
- **Expected:**
  - API denies access (404/403 depending implementation).
  - No Org B data leaks.

### BE-005 - Tenant isolation (cross-org write blocked)

- **Priority:** P0
- **Type:** Multi-tenancy
- **Endpoint(s):** update/delete endpoint on resource in another org
- **Preconditions:** user from Org A, target resource in Org B
- **Steps:**
  1. Attempt mutation against Org B resource.
- **Expected:**
  - API denies request.
  - Target record remains unchanged.

### BE-006 - Create order for table

- **Priority:** P0
- **Type:** Core POS
- **Endpoint(s):** `POST /api/order`
- **Preconditions:** valid table/menu references for same org
- **Steps:**
  1. Submit order payload with table and line items.
- **Expected:**
  - Order created with valid initial status.
  - Line items persisted with correct quantity/pricing data.

### BE-007 - Update order item status

- **Priority:** P1
- **Type:** Core POS
- **Endpoint(s):** `PATCH /api/order/:id/items/:itemId/status`
- **Preconditions:** existing order + line item
- **Steps:**
  1. Patch item status to next kitchen state.
- **Expected:**
  - Item status is updated.
  - Order reflects item state changes in subsequent fetches.

### BE-008 - Mark order paid with valid settlement math

- **Priority:** P0
- **Type:** Payment Integrity
- **Endpoint(s):** `PATCH /api/order/:id/status` (paid transition)
- **Preconditions:** open order with known totals
- **Steps:**
  1. Submit paid transition with valid split/manual payment values.
- **Expected:**
  - Order transitions to paid.
  - Payment metadata is stored.

### BE-009 - Reject invalid split settlement math

- **Priority:** P0
- **Type:** Payment Validation
- **Endpoint(s):** `PATCH /api/order/:id/status`
- **Preconditions:** open order
- **Steps:**
  1. Submit paid transition where payment sum != bill total.
- **Expected:**
  - API rejects with validation error.
  - Order remains unpaid.

### BE-010 - Idempotency/safety on repeated paid transition

- **Priority:** P1
- **Type:** Transaction Safety
- **Endpoint(s):** `PATCH /api/order/:id/status`
- **Preconditions:** order already marked paid
- **Steps:**
  1. Submit paid transition again.
- **Expected:**
  - API responds safely (no duplicate accounting/inventory side effects).
  - No duplicate settlement artifacts.

### BE-011 - Inventory deduction on configured trigger

- **Priority:** P0
- **Type:** Inventory Integration
- **Endpoint(s):** order status flow + inventory reports/movements
- **Preconditions:** stockable ingredients linked to ordered items
- **Steps:**
  1. Execute order flow up to configured trigger event.
  2. Inspect movement/balance endpoints.
- **Expected:**
  - Correct movements created once.
  - Balances reduced as expected.

### BE-012 - No duplicate stock deduction

- **Priority:** P0
- **Type:** Inventory Integrity
- **Endpoint(s):** order replays/retries + movement queries
- **Preconditions:** order already deducted
- **Steps:**
  1. Replay transition/retry payload.
- **Expected:**
  - No second deduction for same logical event.

### BE-013 - Paid order accounting status visibility

- **Priority:** P0
- **Type:** Accounting Integration
- **Endpoint(s):** paid transition response + order read endpoint
- **Preconditions:** order paid transition triggers accounting hooks
- **Steps:**
  1. Mark order paid.
  2. Read order details.
- **Expected:**
  - Accounting posting outcome/status fields are present.
  - Error status is visible when posting fails.

### BE-014 - Public self-order success

- **Priority:** P1
- **Type:** Guest Flow
- **Endpoint(s):** `POST /api/public/self-order`
- **Preconditions:** valid public menu/table context
- **Steps:**
  1. Submit valid self-order payload.
- **Expected:**
  - Order is created in expected initial state.
  - Order appears in staff operational endpoints.

### BE-015 - Public self-order invalid context rejected

- **Priority:** P1
- **Type:** Guest Flow Validation
- **Endpoint(s):** `POST /api/public/self-order`
- **Preconditions:** invalid table/menu/org context
- **Steps:**
  1. Submit malformed or invalid-context payload.
- **Expected:**
  - Request is rejected with clear validation error.

### BE-016 - Accounting reports endpoint health

- **Priority:** P2
- **Type:** Reporting
- **Endpoint(s):** selected `/api/accounting/reports/*`
- **Preconditions:** accounting seed data exists
- **Steps:**
  1. Hit trial balance, P&L, balance sheet report endpoints.
- **Expected:**
  - Endpoints return valid schema and 200 for authorized user.
  - Restricted users receive 403.

---

## 4) Frontend Test Cases

### FE-001 - Protected route redirects/blocks when unauthenticated

- **Priority:** P0
- **Type:** Auth UX
- **Surface:** `/dashboard/*`, `/pos/*`
- **Preconditions:** no authenticated session
- **Steps:**
  1. Open protected route directly.
- **Expected:**
  - User is redirected to login or blocked with unauthorized state.

### FE-002 - Permission-gated actions hidden or disabled

- **Priority:** P0
- **Type:** RBAC UX
- **Surface:** dashboard/pos modules with restricted actions
- **Preconditions:** login as restricted role
- **Steps:**
  1. Navigate to areas with write operations.
- **Expected:**
  - Forbidden actions are not accessible through UI.
  - Attempted direct action surfaces permission error.

### FE-003 - POS floor loads table/session state

- **Priority:** P0
- **Type:** Core POS UX
- **Surface:** `/pos/*` floor and table views
- **Preconditions:** seeded tables and active sessions
- **Steps:**
  1. Open floor route.
  2. Enter a table session.
- **Expected:**
  - Table statuses are rendered correctly.
  - Session shows active order details.

### FE-004 - Create order from POS UI

- **Priority:** P0
- **Type:** Core POS UX
- **Surface:** POS table session
- **Preconditions:** table open and menu available
- **Steps:**
  1. Add items.
  2. Submit order.
- **Expected:**
  - New order appears in session with correct totals.
  - No duplicate line rendering or stale totals.

### FE-005 - Update line item status from POS/kitchen view

- **Priority:** P1
- **Type:** Operational UX
- **Surface:** POS/kitchen status controls
- **Preconditions:** existing order with line items
- **Steps:**
  1. Change item status.
  2. Refresh/navigate back.
- **Expected:**
  - Updated status persists and is consistent across views.

### FE-006 - Payment dialog accepts valid settlement

- **Priority:** P0
- **Type:** Payment UX
- **Surface:** POS payment dialog
- **Preconditions:** payable order exists
- **Steps:**
  1. Open payment dialog.
  2. Enter valid tender/split values.
  3. Confirm settlement.
- **Expected:**
  - Success state shown.
  - Order status becomes paid in UI.

### FE-007 - Payment dialog rejects invalid settlement math

- **Priority:** P0
- **Type:** Payment UX Validation
- **Surface:** POS payment dialog
- **Preconditions:** payable order
- **Steps:**
  1. Enter inconsistent payment values.
  2. Attempt confirm.
- **Expected:**
  - Inline error is displayed.
  - No paid transition shown.

### FE-008 - Accounting posting result visible after payment

- **Priority:** P1
- **Type:** Financial Ops UX
- **Surface:** order detail/settlement feedback area
- **Preconditions:** simulate success and failure posting scenarios
- **Steps:**
  1. Complete payment in each scenario.
- **Expected:**
  - UI reflects accounting posting outcome (success/error signal).
  - Error scenario provides actionable feedback for staff/ops.

### FE-009 - Inventory impact reflected after deductible events

- **Priority:** P1
- **Type:** Cross-module UX
- **Surface:** inventory dashboards/reports
- **Preconditions:** stock-linked order flow executed
- **Steps:**
  1. Complete event that triggers deduction.
  2. Open inventory movement/balance pages.
- **Expected:**
  - Relevant movement and balance updates are visible.

### FE-010 - Public self-order page success path

- **Priority:** P1
- **Type:** Guest UX
- **Surface:** `/self-order`
- **Preconditions:** valid table/menu context
- **Steps:**
  1. Build cart and submit order.
- **Expected:**
  - Guest receives success confirmation.
  - Staff side can see the new guest order.

### FE-011 - Public self-order validation errors

- **Priority:** P1
- **Type:** Guest UX Validation
- **Surface:** `/self-order`
- **Preconditions:** invalid or incomplete payload values
- **Steps:**
  1. Submit invalid form/cart.
- **Expected:**
  - User gets clear validation messaging.
  - No order created.

### FE-012 - Realtime updates across two clients

- **Priority:** P1
- **Type:** Realtime UX
- **Surface:** POS/kitchen screens in two browser sessions
- **Preconditions:** two authenticated clients for same org
- **Steps:**
  1. Perform order status update on client A.
  2. Observe client B.
- **Expected:**
  - Client B reflects change without manual refresh in expected time window.

### FE-013 - Offline/reconnect sync safety

- **Priority:** P2
- **Type:** Resilience UX
- **Surface:** POS sync behavior
- **Preconditions:** throttled/disconnected network simulation
- **Steps:**
  1. Create/edit actions while disconnected.
  2. Reconnect and allow sync.
- **Expected:**
  - Actions replay safely.
  - No duplicate final records after reconnect.

### FE-014 - Responsive behavior for core POS routes

- **Priority:** P2
- **Type:** UI Compatibility
- **Surface:** `/pos/*`, `/dashboard/*`
- **Preconditions:** desktop + tablet viewport set
- **Steps:**
  1. Execute core flow in both viewports.
- **Expected:**
  - Usable layout with no blocking UI overlap on key actions.

---

## 5) Suggested Execution Order for TestSprite

1. Run all `P0` backend cases.
2. Run all `P0` frontend cases.
3. Run `P1` cross-module and guest/realtime cases.
4. Run `P2` resilience/reporting/compatibility regression.

## 6) Pass/Fail Gate

- **Release Blocker:** any failed P0 case.
- **Conditional Go:** P1 failures only if explicitly accepted with mitigation.
- **Non-blocking but tracked:** P2 failures with backlog ticket and owner.

