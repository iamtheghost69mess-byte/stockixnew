const express = require("express");
const ctrl = require("../controllers/rfqController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.get("/", ...authedTenant, allowInventoryRead, ctrl.listRFQs);
router.get("/:id", ...authedTenant, allowInventoryRead, ctrl.getRFQ);
router.post(
  "/",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.createRFQ
);
router.post(
  "/:id/send",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.sendRFQ
);
router.post(
  "/:id/responses",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.addResponse
);
router.post(
  "/:id/convert-to-po",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.convertToPO
);

module.exports = router;
