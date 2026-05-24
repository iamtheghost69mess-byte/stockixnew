# POS Role Permissions (Current State)

This file reflects what the codebase enforces now (default built-in RBAC + route guards), not an ideal/target matrix.

## Default login landing

- Staff PIN login now redirects to `/pos` for all roles.
- Setup-complete redirect now also goes to `/pos`.
- `GET /api/dashboard/default` is backoffice-only and will return 403 for waiter/cashier/kitchen/hostess unless RBAC overrides were changed.

## Source of truth in code

- Built-in role defaults: `apps/pos-backend/constants/defaultRbacRoles.js`
- Permission catalog: `apps/pos-backend/constants/permissionsCatalog.js`
- Backoffice dashboard guard: `apps/pos-backend/routes/dashboardRoute.js`
- Role behavior smoke checks: `apps/pos-backend/scripts/rbac-default-roles-test.js`

## Role matrix (current defaults)

### admin

- Effective permissions: `*` (full access).
- Can access POS, backoffice, RBAC admin surface, accounting, inventory, users, dashboard.

### manager

- Effective permissions include:
  - `pos.table.*`
  - `pos.catalog.read`
  - `pos.order.*`
  - `pos.payment.*`
  - `pos.kitchen.*`
  - `pos.config.read`
  - `pos.printer.read`
  - `pos.loyalty.use`
  - `backoffice.*`
- Can access `/api/dashboard/default` and all backoffice pages by default.

### waiter

- Effective permissions include:
  - `pos.table.read_own`
  - `pos.table.write`
  - `pos.catalog.read`
  - `pos.order.read`
  - `pos.order.create`
  - `pos.order.update`
  - `pos.config.read`
  - `pos.printer.read`
  - `pos.loyalty.use`
- Cannot access:
  - `backoffice.*` routes (including default dashboard API)
  - payment APIs (`pos.payment.*`)
  - kitchen queue APIs (`pos.kitchen.*`)
  - order cancel/transfer (`pos.order.cancel`, `pos.order.transfer`)

### cashier

- Effective permissions include waiter order/floor permissions plus:
  - `pos.table.*`
  - `pos.payment.*`
- Cannot access:
  - `backoffice.*` routes by default.

### kitchen

- Effective permissions:
  - `pos.kitchen.read`
  - `pos.kitchen.write`
- Cannot access floor catalog/tables/orders list/backoffice by default.

### hostess

- Effective permissions:
  - `pos.table.*`
  - `pos.catalog.read`
  - `pos.config.read`
  - `pos.printer.read`
- No order/payment/backoffice/kitchen permissions by default.
- Frontend has hostess-specific route guard behavior for dashboard surfaces.

### accountant (template role)

- Effective permissions:
  - `backoffice.accounting.*`
- Not a normal `User.role` staff login title; used as RBAC template/effective role key.

### accountant_readonly (template role)

- Effective permissions:
  - accounting read operations only (AR/AP/GL/bank/expenses approvals consolidated read variants).
- Not a normal `User.role` staff login title; used as RBAC template/effective role key.

## Is this broken or misconfigured?

### What is intentional

- Waiter getting `403` on `/api/dashboard/default` is intentional by current RBAC defaults.
- Backoffice dashboard is explicitly guarded by `requireBackofficeStaff`.

### What was broken for your flow

- Frontend post-login redirected everyone to `/dashboard/default`, which is wrong for non-backoffice roles.
- This caused "Welcome back" then immediate permission denial for waiter/cashier/kitchen/hostess.

### What could still vary by tenant config

- If your organization has RBAC overrides/custom roles (`RbacConfig`), actual effective permissions may differ from defaults in this file.
- If a user has `permissionRole` set, effective RBAC can differ from their job title (`role`).
