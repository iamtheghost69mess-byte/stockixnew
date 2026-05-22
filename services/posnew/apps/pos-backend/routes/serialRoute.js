const express = require("express");
const {
  listSerials,
  getSerialHistory,
  registerSerial,
  consumeSerial,
  transferSerial,
} = require("../controllers/serialNumberController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenant, allowInventoryRead, listSerials);
router.get("/:serial/history", ...authedTenant, allowInventoryRead, getSerialHistory);

/**
 * @route POST /api/serials
 * Register a new serial for an `isSerialTracked` ingredient.
 */
router.post(
  "/",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  registerSerial
);

/**
 * @route POST /api/serials/:serial/consume
 */
router.post(
  "/:serial/consume",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  consumeSerial
);

/**
 * @route POST /api/serials/:serial/transfer
 */
router.post(
  "/:serial/transfer",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  transferSerial
);

module.exports = router;
