const createHttpError = require("http-errors");
const { canAccessOperation } = require("../services/rbacService");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

async function requirePermission(req, res, next, permission) {
  try {
    const role = rbacRoleKey(req.user);
    if (!role) return next(createHttpError(403, "Forbidden"));
    const oid = resolveOrganizationIdFromUser(req.user);
    const ok =
      (await canAccessOperation(role, "backoffice.*", oid)) ||
      (await canAccessOperation(role, "backoffice.accounting.*", oid)) ||
      (await canAccessOperation(role, permission, oid));
    if (!ok) {
      return next(
        createHttpError(403, `Permission denied: ${permission}`)
      );
    }
    next();
  } catch (e) {
    next(e);
  }
}

const requireAccountingRead = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.read");
const requireAccountingWrite = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.write");

const requireArRead = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.ar.read");
const requireArWrite = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.ar.write");
const requireApRead = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.ap.read");
const requireApWrite = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.ap.write");
const requireGlRead = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.gl.read");
const requireGlWrite = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.gl.write");
const requireBankRead = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.bank.read");
const requireBankWrite = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.bank.write");
const requirePeriodsWrite = (req, res, next) => requirePermission(req, res, next, "backoffice.accounting.periods.write");
const requireExpensesRead = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.expenses.read");
const requireExpensesWrite = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.expenses.write");
const requireExpensesApprove = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.expenses.approve");
const requireApprovalsRead = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.approvals.read");
const requireApprovalsWrite = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.approvals.write");
const requireConsolidatedRead = (req, res, next) =>
  requirePermission(req, res, next, "backoffice.accounting.consolidated.read");

/** Order refunds: admin staff role only (not implied by `backoffice.*` or accounting write). */
function requireOrderRefundAdmin(req, res, next) {
  if (String(req.user?.role || "").toLowerCase() !== "admin") {
    return next(
      createHttpError(403, "Permission denied: backoffice.accounting.refund")
    );
  }
  next();
}

module.exports = {
  requireAccountingRead,
  requireAccountingWrite,
  requireOrderRefundAdmin,
  requireArRead,
  requireArWrite,
  requireApRead,
  requireApWrite,
  requireGlRead,
  requireGlWrite,
  requireBankRead,
  requireBankWrite,
  requirePeriodsWrite,
  requireExpensesRead,
  requireExpensesWrite,
  requireExpensesApprove,
  requireApprovalsRead,
  requireApprovalsWrite,
  requireConsolidatedRead,
};
