const express = require("express");
const {
  listMatches,
  getMatch,
  overrideMatch,
  resolveMatch,
} = require("../controllers/threeWayMatchController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

/**
 * @route GET /api/reconciliation/
 * @desc List all PO-Bill-GRN reconciliation matches
 * @access Private/InventoryRead
 */
router.get("/", ...authedTenant, allowInventoryRead, listMatches);

/**
 * @route GET /api/reconciliation/:id
 * @desc Get detailed 3-way match audit record
 * @access Private/InventoryRead
 */
router.get("/:id", ...authedTenant, allowInventoryRead, getMatch);

/**
 * @route POST /api/reconciliation/:id/override
 * @desc Manually accept a reconciliation mismatch (audited).
 * @access Private/InventoryWrite + admin/manager
 */
router.post(
  "/:id/override",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  overrideMatch
);

/**
 * @route POST /api/reconciliation/:id/resolve
 * @desc Mark a reconciliation record as resolved (diff corrected upstream).
 * @access Private/InventoryWrite + admin/manager
 */
router.post(
  "/:id/resolve",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  resolveMatch
);

module.exports = router;
