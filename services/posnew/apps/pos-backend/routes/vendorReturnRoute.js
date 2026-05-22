const express = require("express");
const router = express.Router();
const vendorReturnController = require("../controllers/vendorReturnController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

router.post(
  "/",
  ...authedTenant,
  allowInventoryWrite,
  vendorReturnController.createReturn
);
router.get("/", ...authedTenant, allowInventoryRead, vendorReturnController.listReturns);
router.get("/:id", ...authedTenant, allowInventoryRead, vendorReturnController.getReturn);
router.put(
  "/:id/lines",
  ...authedTenant,
  allowInventoryWrite,
  vendorReturnController.updateLines
);
router.post(
  "/:id/post",
  ...authedTenant,
  allowInventoryWrite,
  vendorReturnController.postReturn
);

module.exports = router;
