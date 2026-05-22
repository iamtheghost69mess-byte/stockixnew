/**
 * Module × action matrix over canonical permission ids (projection of `can[]`).
 * View / Add / Edit / Delete / Disable columns; `null` = not applicable (shown as —).
 *
 * Keep `RBAC_MATRIX_ROWS` in sync with `apps/pos-backend/utils/rbacMatrixProjection.js` (node tests).
 */

export type RbacMatrixAction = "view" | "add" | "edit" | "delete" | "disable";

export type RbacMatrixRow = {
  id: string;
  label: string;
  /** Permission ids toggled when this cell is checked (all must be in set for “checked”). */
  actions: Record<RbacMatrixAction, readonly string[] | null>;
};

/** Rows: logical modules; multiple ids in one cell grant together. */
export const RBAC_MATRIX_ROWS: readonly RbacMatrixRow[] = [
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

const ACTIONS: readonly RbacMatrixAction[] = ["view", "add", "edit", "delete", "disable"];

/** True if every id in the cell is contained in `granted`. */
export function matrixCellChecked(row: RbacMatrixRow, action: RbacMatrixAction, granted: ReadonlySet<string>): boolean {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => granted.has(id));
}

/** Toggle cell: when `checked`, add all cell ids; otherwise remove them. */
export function applyMatrixCellToggle(
  row: RbacMatrixRow,
  action: RbacMatrixAction,
  checked: boolean,
  granted: Set<string>,
): void {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return;
  if (checked) {
    for (const id of ids) granted.add(id);
  } else {
    for (const id of ids) granted.delete(id);
  }
}

/** Whether the cell is applicable in the UI. */
export function matrixCellApplicable(row: RbacMatrixRow, action: RbacMatrixAction): boolean {
  const ids = row.actions[action];
  return Array.isArray(ids) && ids.length > 0;
}

export function matrixActionLabels(): Record<RbacMatrixAction, string> {
  return {
    view: "View",
    add: "Add",
    edit: "Edit",
    delete: "Delete",
    disable: "Disable",
  };
}

function permissionIdsSignature(ids: readonly string[] | null): string | null {
  if (!ids || ids.length === 0) return null;
  return [...ids].sort((a, b) => a.localeCompare(b)).join("\u0000");
}

/** One body cell: not applicable, or a merged permission toggle spanning 1+ action columns. */
export type RbacMatrixCellRun =
  | { kind: "notApplicable" }
  | { kind: "permissions"; actions: RbacMatrixAction[]; ids: readonly string[]; colSpan: number };

/**
 * Builds table runs for one matrix row so consecutive columns that share the same permission ids
 * render as a single checkbox (avoids one toggle checking every duplicate column).
 */
export function buildRbacMatrixRowCellRuns(row: RbacMatrixRow): RbacMatrixCellRun[] {
  const runs: RbacMatrixCellRun[] = [];
  for (const action of ACTIONS) {
    const ids = row.actions[action];
    if (!ids || ids.length === 0) {
      runs.push({ kind: "notApplicable" });
      continue;
    }
    const sig = permissionIdsSignature(ids);
    const prev = runs[runs.length - 1];
    if (prev && prev.kind === "permissions" && permissionIdsSignature(prev.ids) === sig) {
      prev.actions.push(action);
      prev.colSpan += 1;
    } else {
      runs.push({ kind: "permissions", actions: [action], ids, colSpan: 1 });
    }
  }
  return runs;
}

/** Human-readable list of action columns covered by a merged cell (tooltips / aria). */
export function rbacMatrixRunSummary(actions: readonly RbacMatrixAction[]): string {
  const labels = matrixActionLabels();
  return actions.map((a) => labels[a]).join(" · ");
}

export { ACTIONS as RBAC_MATRIX_ACTIONS };
