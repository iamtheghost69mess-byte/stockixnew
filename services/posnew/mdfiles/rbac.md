# RBAC audit — Restaurant POS (`posnew`)

**Scope:** Tenant POS backend (`apps/pos-backend`), tenant dashboard (`apps/pos-frontend2`), shared UI types. Platform console (`apps/saas-dash`) uses a **separate** permission model and is only noted where relevant.  
**Date:** 2026-04-21.

---

## Executive summary

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented and wired |
| ⚠️ | Partially implemented / UX–API gap |
| ❌ | Missing |
| 🔴 | Broken or high-risk inconsistency |
| 🔗 | Not connected (dead code, unused guard, etc.) |
| 🚨 | Security / abuse risk |

**A. RBAC features already added:** Per-organization `RbacConfig` (MongoDB), `@rbac/rbac` evaluation, glob permissions, built-in role defaults + DB overrides, custom roles with inheritance, `permissionRole` on users (custom keys only), `GET /api/user` effective permission list, `GET /api/rbac/me`, catalog + config APIs, matrix-based RBAC settings UI, route middleware for POS + inventory + accounting, org-scoped cache invalidation on config save, unit tests (matrix round-trip, payload validation, org isolation script).

**B. Permissions that exist:** Canonical list in `apps/pos-backend/constants/permissionsCatalog.js` — floor (`pos.*`), broad `backoffice.*`, granular backoffice (locations, inventory read/write/cost, suppliers), full accounting submodule (`backoffice.accounting.*` and fine-grained AR/AP/GL/bank/periods/expenses/approvals/consolidated), `admin.rbac.manage`. Actions map to **strings** (not CRUD enums); many map to “view/create/update” style **verbs in the id** (e.g. `*.read`, `*.write`).

**C. Missing vs your checklist:** No first-class ids for: generic Approve/Export/Print/Refund/Discount override/Price override/Void sale/Shift close **as separate permissions**. Refunds/voids/session close are folded into existing ops (`pos.order.*`, `backoffice.accounting.write`, etc.) or not permission-gated at POS line-item level.

**D. Broken:** Nothing obviously “broken” in RBAC core paths; main issues are **gaps and asymmetry** (frontend route exposure, legacy job-title bypass, no RBAC audit trail for config changes).

**E. Not connected:** `backoffice.accounting.*` appears in accounting middleware but is **not** listed in `PERMISSIONS` catalog (wildcard still validated via stem rule). Several nav entries lack `permission` so sidebar does not hide them. `/dashboard/rbac` page is not wrapped in `AccessGate`.

**F. Before production:** Add page-level guards for sensitive dashboard routes; align sidebar `permission` with accounting subdivisions; document or enforce POS financial actions; add audit logging for RBAC mutations; review Socket.IO and any `authedTenant`-only routes; decide on `requireBackofficeStaff` vs pure RBAC for backoffice mutations.

---

## 1. Current roles

### 1.1 Where roles are defined

| Layer | Location | Notes |
|--------|----------|--------|
| Built-in defaults | `apps/pos-backend/constants/defaultRbacRoles.js` | `admin`, `manager`, `waiter`, `cashier`, `kitchen`, `hostess`, `accountant`, `accountant_readonly` |
| Catalog keys | `apps/pos-backend/constants/permissionsCatalog.js` — `BUILTIN_ROLE_KEYS` | Derived from `Object.keys(defaultRbacRoles)` |
| Runtime effective roles | Built from defaults + `RbacConfig.builtinOverrides` + `RbacConfig.customRoles` | `apps/pos-backend/services/rbacService.js` — `buildRolesFromConfigDoc` |

### 1.2 Staff login titles (`User.role`)

- **Defined in:** `apps/pos-backend/models/userModel.js` — `ROLES = ["admin", "manager", "waiter", "cashier", "kitchen", "hostess"]`.
- **Not in enum:** `accountant` / `accountant_readonly` — they are **RBAC templates only** (comments in `defaultRbacRoles.js` / `permissionsCatalog.js`).

### 1.3 Named roles vs your checklist

| Your label | In codebase | Notes |
|------------|---------------|--------|
| Super Admin | ❌ (tenant) | No tenant “super admin” role. **Platform** users: `apps/pos-backend/models/platformUserModel.js` — `platform_owner`, `platform_support_*`, etc. (different API surface: `/api/platform/v1/...`). |
| Admin | ✅ | `User.role === "admin"` + RBAC `admin` with `can: ["*"]` |
| Manager | ✅ | Job title + default `can` includes `backoffice.*` |
| Cashier | ✅ | Job title; defaults use `pos.payment.*` (glob), routes check `pos.payment.use` |
| Accountant | ⚠️ | Template keys `accountant` / `accountant_readonly` for **custom profiles** and overrides; not a login `role` enum value |
| Inventory Staff | ⚠️ | No dedicated job title; achievable via **custom role** + `backoffice.inventory.*` |
| Custom roles | ✅ | `RbacConfig.customRoles[]` — `key`, `label`, `can[]`, optional `inheritsFrom` |

### 1.4 How roles are assigned / stored / updated

| Concern | Implementation |
|---------|------------------|
| **Assigned** | Primary: `User.role` (enum). Optional: `User.permissionRole` **must** match a **custom** role key (`staffController.js` — `assertValidCustomPermissionRole`). |
| **Stored** | `User` document in MongoDB; org-wide RBAC in `RbacConfig` (`apps/pos-backend/models/rbacConfigModel.js`). |
| **Effective key** | `apps/pos-backend/utils/rbacRoleKey.js` — `permissionRole` if set, else `role`. |
| **Updated** | `PUT /api/rbac/config` (`rbacController.putConfig`) — admin or `admin.rbac.manage`; invalidates in-memory RBAC cache per org. |

---

## 2. Existing permissions vs your checklist

The product uses **hierarchical string permissions** with `*` globs (`@rbac/rbac`), not a separate “actions” dimension table.

| Your concept | Status | How it appears today |
|--------------|--------|----------------------|
| View | ✅ | Many `*.read` ids + `pos.order.read` / `read_all` |
| Create | ⚠️ | Often `*.write` or `pos.order.create` — not a global “create” |
| Edit | ⚠️ | `*.write`, `pos.order.update` |
| Delete | ⚠️ | `pos.order.cancel`, deletes often under `*.write` / `backoffice.*` |
| Approve | ⚠️ | `backoffice.accounting.expenses.approve`, `backoffice.accounting.approvals.write` |
| Export | ⚠️ | Accounting exports use `glRd` / `arRd` etc., not a dedicated `export.*` |
| Print | ❌ | No `pos.print`; uses `pos.printer.read` for print jobs / printers |
| Refund | ⚠️ | Accounting: `POST /api/accounting/refunds/:orderId` under **`backoffice.accounting.write`** — no separate `refund` permission |
| Discount override | ❌ | No distinct permission; likely under `pos.order.update` behavior in controllers |
| Price override | ❌ | No distinct permission |
| Void sale | ⚠️ | Order cancel: `pos.order.cancel`; accounting voids: AR/AP permissions |
| Shift close | ⚠️ | Accounting register: `POST .../sessions/:id/close` uses **`wr`** (`backoffice.accounting.write`), not “shift” id |
| Stock adjustment | ✅ | `backoffice.inventory.write` + route middleware |
| Financial access | ⚠️ | Broad `backoffice.*` or `backoffice.accounting.*` / sub-perms |
| User management | ⚠️ | `staffRoute` — `requireBackofficeStaff` (job title **or** `backoffice.*`) |
| Settings access | ⚠️ | Tax PUT / branding: `requireBackofficeStaff`; tax GET: `pos.config.read` |

**Implemented / dynamic / hardcoded**

- **Implemented & dynamic:** Permission strings from DB-driven role config; validated on save (`rbacPayloadValidation.js`).
- **Hardcoded:** Default role matrices in `defaultRbacRoles.js`; middleware **operation strings** on each route (e.g. `"pos.order.cancel"`).
- **Catalog:** `PERMISSIONS` array is the allowlist for config UI + validation; wildcards like `backoffice.accounting.*` are accepted if they stem-match catalog ids.

---

## 3. Database structure

There are **no** relational `roles` / `permissions` / `role_permissions` / `user_roles` tables. MongoDB shape:

| Concept | Collection / path | FK / integrity |
|---------|-------------------|----------------|
| Org RBAC | `RbacConfig` — `organization` (ObjectId, unique per org), `builtinOverrides` (Mixed), `customRoles[]` | `organization` refs `Organization`; no Mongoose `populate` enforcement on nested `can` strings |
| User | `User.role`, `User.permissionRole`, `User.organization` | `permissionRole` validated in controller against `customRoles` only |

**Issues**

- ⚠️ **Duplicate / parallel logic:** Effective permissions computed in `rbacService.listEffectivePermissionsForKey` (inheritance) **and** delegated to `@rbac/rbac` in `canAccessOperation` — intentional dual path but must stay consistent.
- ⚠️ **`builtinOverrides` as Mixed:** Typos in keys are partially caught by validation; still schemaless.
- ✅ **Partial index** on `organization` in `rbacConfigModel.js` for uniqueness.

---

## 4. Backend enforcement

### 4.1 Mechanisms

| Mechanism | File(s) | Role |
|-----------|---------|------|
| `requirePermission(op)` | `middlewares/requirePermission.js` | Exact RBAC op for POS-style routes |
| `requireRoleOrPermission(roles, op)` | `middlewares/requireRoleOrPermission.js` | **If `req.user.role` ∈ roles → allow**; else RBAC `canAccessOperation(rbacRoleKey, op)` |
| `requireBackofficeStaff` | Same | `["admin","manager"]` **OR** `backoffice.*` |
| `allowInventoryRead/Write/...` | `middlewares/backofficeInventory.js` | Inventory-specific |
| Accounting | `middlewares/backofficeAccounting.js` | Read/write + AR/AP/GL/… + **`backoffice.accounting.*`** glob |
| Order scoping | `controllers/orderController.js` | Extra checks: `pos.order.read_all`, own-waiter scoping, payments |

### 4.2 Coverage highlights

- ✅ **POS:** `orderRoute`, `tableRoute`, `paymentRoute`, `categoryRoute` (GET), `menuItemRoute` (reads + writes split), `configRoute` (GET tax), `printJobRoute`, `loyaltyRoute` (use paths), `printerRoute` (mixed).
- ✅ **Inventory:** `inventoryRoute`, `ingredientRoute`, `warehouseRoute`, `stockTakeRoute`, `purchaseOrderRoute`, etc., use `allowInventory*`; many mutating flows also `requireBackofficeStaff`.
- ✅ **Accounting:** `routes/accountingRoute.js` — granular stacks (`rd`, `wr`, `arRd`, …).
- ✅ **RBAC admin API:** `routes/rbacRoute.js` — catalog/config: `requireTenantRoleOrPermission({ roles: ["admin"], permission: "admin.rbac.manage" })`.

### 4.3 Gaps / risks

| Issue | Module | File | Current behavior | Expected | Recommended fix |
|-------|--------|------|------------------|----------|-------------------|
| 🚨 Job-title bypass | Many backoffice routes | `requireRoleOrPermission.js` | `admin` / `manager` **always pass** without checking effective `can` overrides | Overrides should apply to everyone | Remove role short-circuit **or** resolve “effective job tier” from RBAC only |
| ⚠️ Manager always backoffice | Custom `manager` override | Same + `rbacController` | Stripping `backoffice.*` from manager in DB does not block manager **job title** | Policy-dependent | Document; or gate `requireBackofficeStaff` on RBAC only |
| ⚠️ Socket.IO | Realtime | `app.js` | `printer:register` uses org/location/printer existence, **not** RBAC | Align with REST printer permissions | Verify JWT/socket auth and add permission check if socket is sensitive |
| ⚠️ `pos.payment.*` vs `pos.payment.use` | Payments | `defaultRbacRoles.js` vs `paymentRoute.js` | Glob vs literal | Must match `@rbac/rbac` matching | ✅ covered if glob matches `use`; add automated test if not already |

**Privilege escalation:** Custom role keys cannot collide with built-ins (`putConfig`). `permissionRole` only allows keys present in `customRoles` — cannot point to `admin` as permissionRole (good).

---

## 5. Frontend enforcement

| Mechanism | File | Notes |
|-----------|------|--------|
| `user.permissions` from `GET /api/user` | `userController.js` | Recomputed each request from current `RbacConfig` |
| `posCan()` | `apps/pos-frontend2/src/lib/pos-permissions.ts` | Mirrors glob semantics client-side |
| Sidebar filter | `filter-sidebar-groups.ts` + `app-sidebar.tsx` | Hides items with `permission` prop |
| `AccessGate` | `components/access-gate.tsx` | Used on **some** inventory/vendor pages |
| Per-page checks | Various accounting/inventory pages | `posCan` for read/write |

### 5.1 UI / API gaps

| Issue | Module | File | Current | Expected | Fix |
|-------|--------|------|-----------|----------|-----|
| ⚠️ Sidebar shows unpermissioned entries | Dashboard nav | `sidebar-items.ts` | Many items **no** `permission` (Menu & Catalog, Business, most Accounting — Core/Extended) | Hide or show consistently | Add `permission` per item or group; use least-privilege read perm |
| ⚠️ Deep links | Dashboard | e.g. `/dashboard/accounting/*` | User can open URL; some pages show “no permission” only after logic | `AccessGate` at layout or page | Wrap accounting subtree with `backoffice.accounting.read` or finer gates |
| ⚠️ RBAC settings page | RBAC | `dashboard/rbac/page.tsx` | No `AccessGate`; API returns 403 | Non-admins should not see editor | Wrap with `admin.rbac.manage` or redirect |
| ✅ Hostess | Shell | `hostess-dashboard-route-guard.tsx`, `hostessSidebarItems` | Reduced nav + guard | OK | Keep in sync with `defaultRbacRoles.hostess` |

---

## 6. Module coverage (tenant app)

| Module | Backend | Frontend nav / gates |
|--------|---------|----------------------|
| POS (floor, orders, payments) | ✅ Strong | ⚠️ POS UI uses permissions in hooks like `use-floor.ts`; not fully audited per button |
| Inventory | ✅ | ⚠️ Sidebar uses `backoffice.inventory.read`; write vs read not distinguished in nav |
| Accounting | ✅ Granular API | ⚠️ Many accounting sidebar links lack `permission` |
| Reports | `reportRoute` — `requireBackofficeStaff` | ⚠️ Nav item “Reports” has no permission |
| Customers | `customerRoute` — `requireBackofficeStaff` | ⚠️ No permission on nav |
| Suppliers | Mixed `allowInventoryRead` + `allowSupplierManage` for writes | ⚠️ Nav only `inventory.read` |
| Employees / Staff | `requireBackofficeStaff` | ⚠️ Nav has no permission |
| Settings (tax, branding) | ✅ / ⚠️ | Tax page access depends on route guard patterns |
| Dashboard | `dashboardRoute` — `requireBackofficeStaff` | Default/CRM/Finance links not permission-scoped |
| Mobile | N/A | No `apps/*/mobile` found in repo snapshot |

---

## 7. Custom role system

| Check | Status |
|-------|--------|
| Admin can create custom roles | ✅ Via RBAC UI → `PUT /api/rbac/config` |
| Checkbox / matrix assignment | ✅ `rbac-settings.tsx` + `rbac-matrix.ts` |
| Saves | ✅ Validated; cache invalidated |
| Backend reflects | ✅ Next `canAccessOperation` uses new doc |
| Frontend reflects | ✅ Next `GET /api/user` (or `fetchMe`) |
| `permissionRole` assignment | ✅ Staff create/update validates custom key only |

**⚠️ Inheritance:** Custom roles can inherit from built-ins including `accountant` templates; ensure UI copy explains non-login templates.

---

## 8. Permission consistency

| Check | Finding |
|-------|---------|
| DB ↔ catalog | ✅ `validateRbacPayload` against `PERMISSIONS` |
| Frontend matrix ↔ backend | ✅ `rbac-matrix-roundtrip.test.js` + comment to keep files in sync |
| Role changes immediate | ✅ No long-lived permission JWT; server resolves per request |
| Cache | ✅ Invalidated in `putConfig` |
| Session refresh | ⚠️ Client must call `fetchMe` / revisit `/api/user` — **no automatic websocket push** on RBAC change |

---

## 9. Security risks (condensed)

| Risk | Severity | Detail |
|------|-----------|--------|
| Manager/admin bypass RBAC overrides | 🚨 Medium–High | `requireRoleOrPermission` short-circuits on job title |
| Hidden routes reachable by URL | ⚠️ Medium | Sidebar hides some, but not all pages gated |
| Direct API bypass | ✅ Low | Server enforces; UI hiding is not the security boundary |
| RBAC mutation audit | 🚨 Low–Medium | No dedicated audit entries in `rbacController.putConfig` |
| `permissionRole` only custom | ✅ | Prevents assigning `admin` string as custom |

---

## 10. Missing features (product)

- ❌ Dedicated permissions: discount cap, price override, POS refund, export-all, print-all, shift close (non-accounting), generic “approve”.
- ❌ Tenant-level **security audit** feed for RBAC and staff permission changes.
- ❌ Optional: per-location role restrictions (only `User.location` scoping exists).
- ❌ Server Actions / Next.js: tenant app uses client + REST; no separate Server Actions RBAC layer found.

---

## 11. Issue register (detailed)

### ✅ Implemented RBAC features

- Org-scoped `RbacConfig` with overrides and custom roles (`rbacConfigModel.js`, `rbacService.js`).
- Express middleware enforcement on core REST routers.
- Accounting submodule enforcement (`backofficeAccounting.js`, `accountingRoute.js`).
- `/api/user` expands effective permissions (`userController.js`).
- RBAC admin API + smoke tests (`scripts/rbac-smoke-test.js`, `rbac-default-roles-test.js`).
- Frontend RBAC settings and matrix (`rbac-settings.tsx`, `rbac-matrix.ts`).

### ⚠️ Partially implemented

- Sidebar permission tagging (`sidebar-items.ts`).
- POS-level financial sensitivity (refund/discount) vs coarse `pos.order.update` / accounting write.
- Accountant experience without manager job title (must use custom role + `permissionRole`).

### ❌ Missing

- Relational RBAC schema (by design — Mongo embedded).
- First-class permissions matching your 13-item checklist verbatim.
- RBAC change audit log.
- Full `AccessGate` coverage on dashboard routes.

### 🔴 Broken

- None identified in core RBAC evaluation; **policy bug risk** on manager/admin bypass (see above).

### 🔗 Not connected / weakly connected

- `backoffice.accounting.*` glob: enforced in middleware but omitted from `PERMISSIONS` list (still valid via wildcard validation).
- Some nav entries without `permission` → `filterSidebarGroupsByPermissions` does not filter them.

### 🚨 Security risks

- Job-title short-circuit in `requireRoleOrPermission`.
- Socket printer registration path not RBAC-checked (org match only).
- RBAC PUT without audit trail.

---

## 12. Final answers (section 13)

**A.** Features added: org RBAC config, inheritance, custom roles, permission catalog, API enforcement for POS/inventory/accounting, user permission payload, RBAC UI, tests, cache invalidation.

**B.** Permissions: see `permissionsCatalog.js` (`PERMISSIONS` export) plus implicit wildcard stems accepted by validation.

**C.** Missing: granular business permissions (refund, discount override, void, shift close, export, print as standalone), tenant super-admin, dedicated inventory **job title**, RBAC audit stream.

**D.** Broken: no hard “broken” RBAC engine; **bypass** behavior for admin/manager is the main correctness/policy issue.

**E.** Not connected: partial sidebar permission metadata; RBAC page without `AccessGate`; accounting wildcard vs catalog list.

**F.** Production fixes: (1) decide and implement job-title vs RBAC-only enforcement, (2) add dashboard route gates aligned with API, (3) complete sidebar `permission` metadata, (4) audit log for RBAC + staff permission changes, (5) review Socket.IO authz, (6) add tests for `pos.payment.*` vs `pos.payment.use` and any new fine-grained POS financial perms if introduced.

---

*End of report.*
