const express = require("express");
const ctrl = require("../controllers/warehouseController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.get("/zones", ...authedTenant, allowInventoryRead, ctrl.listZones);
router.post("/zones", ...authedTenant, allowInventoryWrite, ctrl.createZone);
router.patch("/zones/:id", ...authedTenant, allowInventoryWrite, ctrl.patchZone);
router.get("/bins", ...authedTenant, allowInventoryRead, ctrl.listBins);
router.post("/bins", ...authedTenant, allowInventoryWrite, ctrl.createBin);
router.patch("/bins/:id", ...authedTenant, allowInventoryWrite, ctrl.patchBin);

module.exports = router;
