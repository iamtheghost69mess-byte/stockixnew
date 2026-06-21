const defaultRbacRoles = require("./defaultRbacRoles");

/**
 * RBAC alignment (single source of truth for built-in *keys*):
 * - `BUILTIN_ROLE_KEYS` = `Object.keys(defaultRbacRoles)` (includes `hostess` and accounting *templates*).
 * - Staff login titles (`User.role` enum) are a subset: see `apps/pos-backend/models/userModel` `ROLES`.
 * - `accountant` / `accountant_readonly` exist for defaults + custom-role inheritance; they are not staff
 *   login roles—assign via `permissionRole` → custom role, or override builtins in RBAC settings.
 *
 * Canonical permission ids for @rbac/rbac checks (supports * globs).
 * Keep in sync with route middleware.
 */
const PERMISSIONS = [
  { id: "*", label: "Full access", group: "system" },
  { id: "pos.table.read", label: "View tables", group: "floor" },
  {
    id: "pos.table.read_own",
    label: "View Own Tables Only",
    description: "Waiter sees only tables where they are the assigned waiter",
    group: "pos",
  },
  { id: "pos.table.write", label: "Create / update tables", group: "floor" },
  { id: "pos.catalog.read", label: "View menu & categories", group: "floor" },
  { id: "pos.order.read", label: "View orders (scoped: own checks unless read-all)", group: "floor" },
  { id: "pos.order.read_all", label: "View all orders in location (orders list / any order)", group: "floor" },
  { id: "pos.order.create", label: "Create orders", group: "floor" },
  { id: "pos.order.update", label: "Update orders (items, status, pay, submit tickets)", group: "floor" },
  { id: "pos.order.cancel", label: "Cancel / delete open orders", group: "floor" },
  { id: "pos.order.transfer", label: "Transfer order to another table", group: "floor" },
  { id: "pos.payment.use", label: "Payments (create / verify)", group: "floor" },
  { id: "pos.kitchen.read", label: "Kitchen queue (read)", group: "kitchen" },
  { id: "pos.kitchen.write", label: "Kitchen (update line / ticket)", group: "kitchen" },
  { id: "pos.config.read", label: "Read tax / POS config", group: "floor" },
  { id: "pos.printer.read", label: "List printers (printing from POS)", group: "floor" },
  {
    id: "pos.receipt.print",
    label: "Print customer receipts (waiter role; synced from branch setting)",
    group: "floor",
  },
  { id: "pos.loyalty.use", label: "Loyalty preview / redeem / earn at POS", group: "floor" },
  {
    id: "backoffice.accounting.refund",
    label: "Post order refunds (admin staff only; enforced on route)",
    group: "backoffice",
  },
  { id: "backoffice.*", label: "Back office (menu, staff, inventory, reports, accounting…)", group: "backoffice" },
  {
    id: "backoffice.location.read",
    label: "View branch locations",
    group: "backoffice",
  },
  {
    id: "backoffice.location.write",
    label: "Create and edit branch locations",
    group: "backoffice",
  },
  {
    id: "backoffice.inventory.read",
    label: "View ingredients, stock, movements, suppliers (read-only)",
    group: "backoffice",
  },
  {
    id: "backoffice.inventory.write",
    label: "Create/edit ingredients, stock adjustments, transfers, bootstrap",
    group: "backoffice",
  },
  {
    id: "backoffice.inventory.cost.read",
    label: "View ingredient costs & valuation (UI may hide without this)",
    group: "backoffice",
  },
  {
    id: "backoffice.suppliers.manage",
    label: "Create/edit/archive suppliers & ingredient–supplier pricing",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.read",
    label: "View chart, journals, trial balance, sessions",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.write",
    label: "Post journals, open/close accounting sessions, edit mapping",
    group: "backoffice",
  },
  { id: "backoffice.accounting.ar.read", label: "View AR / Customer aging", group: "backoffice" },
  { id: "backoffice.accounting.ar.write", label: "Post AR payments / credits", group: "backoffice" },
  { id: "backoffice.accounting.ap.read", label: "View AP / Vendor bills", group: "backoffice" },
  { id: "backoffice.accounting.ap.write", label: "Post vendor bills / payments", group: "backoffice" },
  { id: "backoffice.accounting.gl.read", label: "View journals / Trial balance", group: "backoffice" },
  { id: "backoffice.accounting.gl.write", label: "Post manual journals", group: "backoffice" },
  { id: "backoffice.accounting.bank.read", label: "View bank statements / reports", group: "backoffice" },
  { id: "backoffice.accounting.bank.write", label: "Reconcile bank statements", group: "backoffice" },
  { id: "backoffice.accounting.periods.write", label: "Close periods / year-end", group: "backoffice" },
  {
    id: "backoffice.accounting.expenses.read",
    label: "View expense reports",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.expenses.write",
    label: "Create and submit expense reports",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.expenses.approve",
    label: "Approve or reject expense reports (direct path)",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.approvals.read",
    label: "View approval requests (inbox)",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.approvals.write",
    label: "Create and resolve approval requests",
    group: "backoffice",
  },
  {
    id: "backoffice.accounting.consolidated.read",
    label: "View consolidated financial reports for child organizations",
    group: "backoffice",
  },
  { id: "admin.rbac.manage", label: "Manage roles & permissions", group: "admin" },
];

/** Built-in role keys: must match `defaultRbacRoles` (includes template keys like accountant). */
const BUILTIN_ROLE_KEYS = Object.keys(defaultRbacRoles);

module.exports = { PERMISSIONS, BUILTIN_ROLE_KEYS };
