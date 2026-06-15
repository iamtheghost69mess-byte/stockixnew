# Product Specification Document (PSD)

## 1) Product

- **Name:** Restaurant POS (multi-tenant SaaS)
- **Repository:** `posnew` monorepo
- **Primary surfaces:**
  - `apps/pos-backend` - tenant API (Express + MongoDB/Mongoose + Socket.IO)
  - `apps/pos-frontend2` - Studio + staff POS shell (Next.js App Router)
  - `apps/saas-dash` - platform operator dashboard
- **Business domain:** Restaurant operations (floor service, orders, kitchen, payment, inventory, accounting)

## 2) Problem Statement

Restaurants need one system to run service operations and back office accounting/inventory per organization (tenant), with strict tenant isolation and role-based access. The platform must support staff order flow, guest self-order, inventory deduction policies, and financial posting for paid orders.

## 3) Product Goals

1. Enable end-to-end table service flow (open table -> create order -> kitchen updates -> payment -> close table).
2. Provide back-office controls for accounting, inventory, catalog, and operations.
3. Guarantee tenant data isolation by organization scope.
4. Enforce permission-driven access per role (RBAC).
5. Keep operational data consistent across POS, inventory, and accounting modules.

## 4) Non-Goals (Current Scope)

- No dedicated guest online payment flow in current public self-order implementation.
- No mandatory integrated PSP checkout in current POS UI flow (manual cash/card reference flow exists).
- No public-facing multi-bank OFX automation in scope.

## 5) User Roles

- **Platform Owner / Operator:** manages organizations, entitlements, platform-wide controls.
- **Org Admin / Manager (Studio):** configures catalog, floors, roles, accounting, and inventory.
- **Staff (POS):** creates and manages table orders, sends items to kitchen, settles payments.
- **Kitchen Staff:** consumes kitchen queue/status changes.
- **Guest:** places self-order via public endpoint/QR flow.

## 6) System Scope

### In Scope

- Multi-tenant organization onboarding and org-scoped data access.
- Authentication + RBAC-protected APIs under `/api/*`.
- POS order lifecycle and kitchen status updates.
- Inventory tracking, movement, procurement-related flows.
- Accounting journal/reporting and order-linked posting hooks.
- Public self-order endpoint and guest ordering.
- Realtime updates via sockets.

### Out of Scope

- Native mobile apps.
- External ERP synchronization as first-class required flow.
- Full omnichannel e-commerce checkout.

## 7) Core Functional Requirements

### FR-001: Tenant Isolation

- Every business query and mutation must be scoped by organization/tenant.
- Cross-tenant access must be denied at API layer.

**Acceptance Criteria**
- Requests using user/token from Organization A cannot read/write Organization B records.
- Isolation self-test returns pass under configured environment.

### FR-002: Authentication and RBAC

- Authenticated endpoints under `/api/*` require a valid authenticated context.
- Role permissions must gate module actions (orders, payments, kitchen, inventory, accounting, admin).

**Acceptance Criteria**
- Unauthorized request returns 401/403.
- `GET /api/rbac/me` returns current permission set for user.
- UI hides or disables actions not allowed by role permissions.

### FR-003: POS Order Lifecycle

- Staff can create order, add/update items, send for kitchen processing, and transition order status.
- Order item statuses can be updated independently.
- Table-linked orders can be queried and managed.

**Acceptance Criteria**
- API supports create/list/get/update/delete and status transitions.
- Kitchen view updates with item and order status changes.
- Table session reflects current order state consistently.

### FR-004: Payment and Settlement

- Staff can mark an order as paid through POS settlement flow.
- Split/manual tender values must reconcile with final bill total.

**Acceptance Criteria**
- Paid transition stores payment metadata and final status.
- Invalid split/payment math is rejected with validation error.
- Repeated settlement call for same order is idempotent or safely rejected.

### FR-005: Inventory Deduction Integration

- Inventory deduction runs according to configured trigger policy (kitchen send, payment, or both).
- Stock movement and balances are updated when deduction occurs.

**Acceptance Criteria**
- Stock moves exactly once per deductible order line.
- Non-negative and validation rules are enforced.
- Order + inventory records remain consistent for same tenant.

### FR-006: Accounting Posting Integration

- When order reaches `paid`, accounting posting hooks must execute for sale and COGS where configured.
- Posting outcome must be visible in persisted order metadata/API response.

**Acceptance Criteria**
- Posting status fields are stored on order.
- Failed posting is surfaced in API response metadata for operational visibility.
- Finance team can trace paid orders to corresponding accounting records (or explicit error status).

### FR-007: Studio Back Office

- Studio includes management surfaces for accounting, inventory, catalog, and operations.
- Accounting dashboard includes ledgers, reports, invoices, sessions, budget and bank workflows.

**Acceptance Criteria**
- Accessible routes exist and load with authorized role.
- Report endpoints return expected dataset structure.
- Invalid/unauthorized actions are blocked and surfaced.

### FR-008: Public Self-Order

- Guest can submit self-order through public API flow.
- Self-order must create order records scoped to targeted organization/table context.

**Acceptance Criteria**
- Valid self-order payload creates order in expected initial state.
- Invalid table/menu context is rejected.
- Guest order appears in staff operational flow for fulfillment.

### FR-009: Realtime Operational Updates

- Order and table state changes should emit realtime events to subscribed clients.
- POS and kitchen interfaces should reflect near-real-time updates.

**Acceptance Criteria**
- State-changing actions emit expected socket events.
- Connected clients update without manual refresh under normal operation.

## 8) Data and Domain Requirements

- Organization-scoped entities include (non-exhaustive): users, roles, tables, orders, inventory entities, accounting entities.
- Paid order flow is a critical integrity boundary across POS, inventory, and accounting.
- Product must preserve auditability for financial and stock-affecting events.

## 9) API Surface (High-Level)

- **Orders:** `/api/order`, `/api/orders`
- **Payments:** `/api/payment`
- **Inventory:** `/api/inventory` and related mounts (`/api/stock-takes`, `/api/purchase-orders`, etc.)
- **Accounting:** `/api/accounting/*`
- **Public guest:** `/api/public/self-order`
- **RBAC introspection:** `/api/rbac/me`

## 10) Non-Functional Requirements

### Security

- Enforce authentication and permission checks for protected routes.
- Enforce tenant isolation on every data operation.
- Rate limiting and input validation on exposed APIs.

### Reliability and Integrity

- Idempotent handling for critical retries (status transitions, sync, replay patterns).
- Observable failure states for accounting/inventory side effects.
- Durable behavior for queue-based or async operational jobs where configured.

### Performance

- API response times must remain stable under concurrent floor usage.
- UI updates should be responsive for table and kitchen operations.
- Realtime event delivery should keep clients synchronized under normal load.

### Observability

- Operational errors are logged with sufficient context for root-cause analysis.
- Financial posting outcomes are inspectable via status/error fields.

## 11) Constraints and Dependencies

- Requires MongoDB and tenant API configuration.
- POS frontend must target API origin through `NEXT_PUBLIC_POS_API_ORIGIN`.
- Optional integrations (Razorpay, Redis/BullMQ, email/storage services) depend on env configuration.
- Role and entitlement configuration impacts allowed feature behavior.

## 12) Known Gaps / Risks (Current State)

1. Payment architecture mismatch risk: backend PSP capabilities exist but POS UI settlement is mostly manual flow.
2. Accounting integrity risk: paid status can exist with posting failure metadata (visible but still operationally sensitive).
3. Inventory analytics risk: slow-moving report logic requires validation/fix for movement reason filters.
4. Offline/replay conflict scenarios require dedicated regression validation.

## 13) TestSprite-Oriented Validation Matrix

### Critical Test Suite (P0)

- Tenant isolation across all major modules.
- RBAC deny/allow matrix by role.
- Order lifecycle from create -> kitchen -> paid.
- Payment math validation (split/manual tender consistency).
- Paid-order accounting posting status visibility.
- Stock deduction trigger behavior and one-time deduction guard.

### Important Test Suite (P1)

- Public self-order success/failure paths.
- Realtime event propagation to POS/kitchen clients.
- Entitlement/seat-cap enforcement in org context.
- Error-path UX for failed side effects (accounting/inventory).

### Regression Test Suite (P2)

- Reporting screens and exports availability.
- Procurement and inventory support flows.
- Platform dashboard org management workflows.

## 14) Release Readiness Criteria

- P0 suite passing with no tenant leak or financial integrity blocker.
- No open blocker on order payment and accounting status observability.
- No critical RBAC bypass.
- Core POS service path stable under expected concurrent load.

## 15) Suggested Upload Metadata (for TestSprite)

- **Project Name:** Restaurant POS Multi-Tenant
- **Primary Modules:** POS, Inventory, Accounting, Platform Administration
- **Primary Environments:** Local/staging tenant API + Studio/POS frontend
- **Priority Journeys:** table-service checkout, self-order intake, stock deduction, paid-order accounting visibility

