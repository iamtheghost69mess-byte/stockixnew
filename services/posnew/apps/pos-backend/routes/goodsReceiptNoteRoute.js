const express = require("express");
const ctrl = require("../controllers/goodsReceiptNoteController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.get("/", ...authedTenant, allowInventoryRead, ctrl.listGRNs);
router.get("/:id", ...authedTenant, allowInventoryRead, ctrl.getGRN);
router.post(
  "/",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.createGRN
);
router.patch(
  "/:id",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.updateGRN
);
router.post(
  "/:id/confirm",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.confirmGRN
);
router.post(
  "/:id/qc",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  ctrl.transitionQc
);

module.exports = router;
