/* global module */
/**
 * Module × action matrix over permission ids (projection of `can[]`).
 * Keep row definitions in sync with `apps/pos-frontend2/src/lib/rbac-matrix.ts`.
 */

/** @typedef {"view"|"add"|"edit"|"delete"|"disable"} RbacMatrixAction */

/**
 * @param {string} pattern
 * @param {string} permId
 * @returns {boolean}
 */
function patternCoversPermission(pattern, permId) {
  if (pattern === "*") return true;
  if (pattern === permId) return true;
  if (typeof pattern !== "string" || typeof permId !== "string") return false;
  if (pattern.endsWith(".*")) {
    const stem = pattern.slice(0, -2);
    return permId === stem || permId.startsWith(`${stem}.`);
  }
  return false;
}

/**
 * @param {string[]|undefined} canList
 * @param {string[]} catalogIds
 * @returns {Set<string>}
 */
function expandCanToIdSet(canList, catalogIds) {
  const set = new Set();
  if (!Array.isArray(canList)) return set;
  for (const id of catalogIds) {
    for (const p of canList) {
      if (patternCoversPermission(p, id)) {
        set.add(id);
        break;
      }
    }
  }
  return set;
}

/**
 * @param {Set<string>} set
 * @returns {string[]}
 */
function idSetToCanArray(set) {
  return Array.from(set).sort((x, y) => x.localeCompare(y));
}

/** @type {readonly { id: string; label: string; actions: Record<RbacMatrixAction, readonly string[] | null> }[]} */
const RBAC_MATRIX_ROWS = [
  {
    id: "tables",
    label: "Tables & floor layout",
    actions: {
      view: ["pos.table.read"],
      add: ["pos.table.write"],
      edit: ["pos.table.write"],
      delete: ["pos.table.write"],
      disable: null,
    },
  },
  {
    id: "catalog",
    label: "Menu & catalog (read)",
    actions: {
      view: ["pos.catalog.read"],
      add: null,
      edit: null,
      delete: null,
      disable: null,
    },
  },
  {
    id: "orders_scope",
    label: "Orders — see all staff checks",
    actions: {
      view: ["pos.order.read_all"],
      add: null,
      edit: null,
      delete: null,
      disable: null,
    },
  },
  {
    id: "orders_ops",
    label: "Orders — create & update",
    actions: {
      view: ["pos.order.read"],
      add: ["pos.order.create"],
      edit: ["pos.order.update"],
      delete: ["pos.order.cancel"],
      disable: ["pos.order.transfer"],
    },
  },
  {
    id: "payments",
    label: "Payments",
    actions: {
      view: null,
      add: ["pos.payment.use"],
      edit: ["pos.payment.use"],
      delete: null,
      disable: null,
    },
  },
  {
    id: "kitchen",
    label: "Kitchen queue",
    actions: {
      view: ["pos.kitchen.read"],
      add: null,
      edit: ["pos.kitchen.write"],
      delete: null,
      disable: null,
    },
  },
  {
    id: "pos_config",
    label: "POS config & printers",
    actions: {
      view: ["pos.config.read", "pos.printer.read"],
      add: null,
      edit: null,
      delete: null,
      disable: null,
    },
  },
  {
    id: "loyalty_use",
    label: "Loyalty — use / redeem",
    actions: {
      view: ["pos.loyalty.use"],
      add: ["pos.loyalty.use"],
      edit: ["pos.loyalty.use"],
      delete: null,
      disable: null,
    },
  },
  {
    id: "backoffice_full",
    label: "Back office (full module)",
    actions: {
      view: ["backoffice.*"],
      add: ["backoffice.*"],
      edit: ["backoffice.*"],
      delete: ["backoffice.*"],
      disable: ["backoffice.*"],
    },
  },
  {
    id: "locations",
    label: "Branch locations",
    actions: {
      view: ["backoffice.location.read"],
      add: ["backoffice.location.write"],
      edit: ["backoffice.location.write"],
      delete: ["backoffice.location.write"],
      disable: null,
    },
  },
  {
    id: "inventory",
    label: "Inventory & stock",
    actions: {
      view: ["backoffice.inventory.read"],
      add: ["backoffice.inventory.write"],
      edit: ["backoffice.inventory.write"],
      delete: ["backoffice.inventory.write"],
      disable: null,
    },
  },
  {
    id: "inventory_cost",
    label: "Inventory — cost / valuation",
    actions: {
      view: ["backoffice.inventory.cost.read"],
      add: null,
      edit: null,
      delete: null,
      disable: null,
    },
  },
  {
    id: "suppliers",
    label: "Suppliers",
    actions: {
      view: ["backoffice.suppliers.manage"],
      add: ["backoffice.suppliers.manage"],
      edit: ["backoffice.suppliers.manage"],
      delete: ["backoffice.suppliers.manage"],
      disable: null,
    },
  },
  {
    id: "accounting_core",
    label: "Accounting — core",
    actions: {
      view: ["backoffice.accounting.read"],
      add: ["backoffice.accounting.write"],
      edit: ["backoffice.accounting.write"],
      delete: ["backoffice.accounting.write"],
      disable: ["backoffice.accounting.periods.write"],
    },
  },
  {
    id: "accounting_ar",
    label: "Accounting — AR",
    actions: {
      view: ["backoffice.accounting.ar.read"],
      add: ["backoffice.accounting.ar.write"],
      edit: ["backoffice.accounting.ar.write"],
      delete: ["backoffice.accounting.ar.write"],
      disable: null,
    },
  },
  {
    id: "accounting_ap",
    label: "Accounting — AP",
    actions: {
      view: ["backoffice.accounting.ap.read"],
      add: ["backoffice.accounting.ap.write"],
      edit: ["backoffice.accounting.ap.write"],
      delete: ["backoffice.accounting.ap.write"],
      disable: null,
    },
  },
  {
    id: "accounting_gl",
    label: "Accounting — GL / journals",
    actions: {
      view: ["backoffice.accounting.gl.read"],
      add: ["backoffice.accounting.gl.write"],
      edit: ["backoffice.accounting.gl.write"],
      delete: ["backoffice.accounting.gl.write"],
      disable: null,
    },
  },
  {
    id: "accounting_bank",
    label: "Accounting — bank",
    actions: {
      view: ["backoffice.accounting.bank.read"],
      add: ["backoffice.accounting.bank.write"],
      edit: ["backoffice.accounting.bank.write"],
      delete: ["backoffice.accounting.bank.write"],
      disable: null,
    },
  },
  {
    id: "rbac_admin",
    label: "Roles & permissions (admin UI)",
    actions: {
      view: ["admin.rbac.manage"],
      add: ["admin.rbac.manage"],
      edit: ["admin.rbac.manage"],
      delete: ["admin.rbac.manage"],
      disable: null,
    },
  },
];

/** @type {readonly RbacMatrixAction[]} */
const RBAC_MATRIX_ACTIONS = ["view", "add", "edit", "delete", "disable"];

/**
 * @param {{ actions: Record<RbacMatrixAction, readonly string[] | null> }} row
 * @param {RbacMatrixAction} action
 * @param {ReadonlySet<string>} granted
 * @returns {boolean}
 */
function matrixCellChecked(row, action, granted) {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => granted.has(id));
}

/**
 * @param {{ actions: Record<RbacMatrixAction, readonly string[] | null> }} row
 * @param {RbacMatrixAction} action
 * @param {boolean} checked
 * @param {Set<string>} granted
 */
function applyMatrixCellToggle(row, action, checked, granted) {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return;
  if (checked) {
    for (const id of ids) granted.add(id);
  } else {
    for (const id of ids) granted.delete(id);
  }
}

/**
 * @param {{ actions: Record<RbacMatrixAction, readonly string[] | null> }} row
 * @param {RbacMatrixAction} action
 * @returns {boolean}
 */
function matrixCellApplicable(row, action) {
  const ids = row.actions[action];
  return Array.isArray(ids) && ids.length > 0;
}

module.exports = {
  RBAC_MATRIX_ROWS,
  RBAC_MATRIX_ACTIONS,
  patternCoversPermission,
  expandCanToIdSet,
  idSetToCanArray,
  matrixCellChecked,
  applyMatrixCellToggle,
  matrixCellApplicable,
};
