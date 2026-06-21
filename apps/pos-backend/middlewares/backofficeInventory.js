const createHttpError = require("http-errors");
const { canAccessOperation } = require("../services/rbacService");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

function orgId(req) {
  return resolveOrganizationIdFromUser(req.user);
}

async function allowInventoryRead(req, res, next) {
  try {
    const rk = rbacRoleKey(req.user);
    if (
      (await canAccessOperation(rk, "backoffice.*", orgId(req))) ||
      (await canAccessOperation(rk, "backoffice.inventory.read", orgId(req)))
    ) {
      return next();
    }
    return next(createHttpError(403, "You do not have permission to view inventory."));
  } catch (e) {
    next(e);
  }
}

async function allowInventoryWrite(req, res, next) {
  try {
    const rk = rbacRoleKey(req.user);
    if (
      (await canAccessOperation(rk, "backoffice.*", orgId(req))) ||
      (await canAccessOperation(rk, "backoffice.inventory.write", orgId(req)))
    ) {
      return next();
    }
    return next(
      createHttpError(403, "You do not have permission to change inventory.")
    );
  } catch (e) {
    next(e);
  }
}

/** Cost-sensitive inventory reporting (valuation, waste cost, price history, etc.). */
async function allowInventoryCostRead(req, res, next) {
  try {
    const rk = rbacRoleKey(req.user);
    if (
      (await canAccessOperation(rk, "backoffice.*", orgId(req))) ||
      (await canAccessOperation(
        rk,
        "backoffice.inventory.cost.read",
        orgId(req)
      ))
    ) {
      return next();
    }
    return next(
      createHttpError(
        403,
        "You do not have permission to view inventory cost or valuation data."
      )
    );
  } catch (e) {
    next(e);
  }
}

async function allowSupplierManage(req, res, next) {
  try {
    const rk = rbacRoleKey(req.user);
    if (
      (await canAccessOperation(rk, "backoffice.*", orgId(req))) ||
      (await canAccessOperation(rk, "backoffice.suppliers.manage", orgId(req)))
    ) {
      return next();
    }
    return next(
      createHttpError(403, "You do not have permission to manage suppliers.")
    );
  } catch (e) {
    next(e);
  }
}

/**
 * Menu availability hints for POS (catalog) and full inventory readers.
 */
async function allowPosCatalogOrInventoryRead(req, res, next) {
  try {
    const rk = rbacRoleKey(req.user);
    if (
      (await canAccessOperation(rk, "backoffice.*", orgId(req))) ||
      (await canAccessOperation(rk, "backoffice.inventory.read", orgId(req))) ||
      (await canAccessOperation(rk, "pos.catalog.read", orgId(req)))
    ) {
      return next();
    }
    return next(
      createHttpError(
        403,
        "You do not have permission to view menu availability."
      )
    );
  } catch (e) {
    next(e);
  }
}

module.exports = {
  allowInventoryRead,
  allowInventoryWrite,
  allowInventoryCostRead,
  allowSupplierManage,
  allowPosCatalogOrInventoryRead,
};
