/**
 * Default RBAC role definitions for @rbac/rbac.
 * Admin may override builtin `can` lists in DB (rbacConfig); custom roles are extra keys.
 *
 * Keys here define `BUILTIN_ROLE_KEYS` (permissionsCatalog). Keys must exist in `userModel` `ROLES`
 * only when the role is a normal staff login title; `accountant*` are template defaults for RBAC
 * inheritance / overrides, not assignable as `User.role`.
 *
 * Aligned with phases/roles.md (built-in roles):
 * - Waiter / Cashier: no pos.order.read_all (GET /orders scoped to own waiter id);
 *   no pos.order.cancel / pos.order.transfer; cashier adds pos.payment.*.
 * - Manager / Admin: pos.order.* (includes read_all, cancel, transfer) + backoffice.*.
 * - Kitchen: queue line updates only (pos.kitchen.*), no catalog/tables/orders list.
 */
module.exports = {
  admin: {
    can: ["*"],
  },
  manager: {
    can: [
      "pos.table.*",
      "pos.catalog.read",
      "pos.order.*",
      "pos.payment.*",
      "pos.kitchen.*",
      "pos.config.read",
      "pos.printer.read",
      "pos.loyalty.use",
      "backoffice.*",
    ],
  },
  /** Floor: tables + menu + orders, no kitchen queue APIs, no payments */
  waiter: {
    can: [
      "pos.table.read_own",
      "pos.table.write",
      "pos.catalog.read",
      "pos.order.read",
      "pos.order.create",
      "pos.order.update",
      "pos.config.read",
      "pos.printer.read",
      "pos.loyalty.use",
    ],
  },
  /** Waiter + payments */
  cashier: {
    can: [
      "pos.table.*",
      "pos.catalog.read",
      "pos.order.read",
      "pos.order.create",
      "pos.order.update",
      "pos.payment.*",
      "pos.config.read",
      "pos.printer.read",
      "pos.loyalty.use",
    ],
  },
  /** Kitchen display only */
  kitchen: {
    can: ["pos.kitchen.read", "pos.kitchen.write"],
  },
  /** Floor: tables and catalog read; no orders or payments */
  hostess: {
    can: [
      "pos.table.*",
      "pos.catalog.read",
      "pos.config.read",
      "pos.printer.read",
    ],
  },
  /** Back office GL: read + post (no full backoffice.*) */
  accountant: {
    can: ["backoffice.accounting.*"],
  },
  /** View journals/reports only (explicit ids for validation / tooling) */
  accountant_readonly: {
    can: [
      "backoffice.accounting.read",
      "backoffice.accounting.ar.read",
      "backoffice.accounting.ap.read",
      "backoffice.accounting.gl.read",
      "backoffice.accounting.bank.read",
      "backoffice.accounting.expenses.read",
      "backoffice.accounting.approvals.read",
      "backoffice.accounting.consolidated.read",
    ],
  },
};
