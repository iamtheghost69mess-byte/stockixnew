const express = require("express");
const {
  lowStock,
  report,
  movements,
  adjust,
  customerReturn,
  bootstrapBalances,
  menuAvailability,
  wasteAnalytics,
  listWastageEntries,
  createWastageEntry,
  wastageReport,
  priceHistory,
  runInventoryAlerts,
  posInventoryPolicy,
  valuationReport,
  slowMovingReport,
  barcodeScan,
  forecastReport,
} = require("../controllers/inventoryController");
const {
  listBalances,
  patchBalancePlanning,
  postTransfer,
} = require("../controllers/stockBalanceController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const {
  allowInventoryRead,
  allowInventoryWrite,
  allowInventoryCostRead,
  allowPosCatalogOrInventoryRead,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.get("/low-stock", ...authedTenantLocation, allowInventoryRead, lowStock);
router.get("/report", ...authedTenantLocation, allowInventoryRead, report);
router.get(
  "/report/valuation",
  ...authedTenantLocation,
  allowInventoryRead,
  allowInventoryCostRead,
  valuationReport
);
router.get(
  "/report/slow-moving",
  ...authedTenantLocation,
  allowInventoryRead,
  allowInventoryCostRead,
  slowMovingReport
);
router.get(
  "/forecast",
  ...authedTenantLocation,
  allowInventoryRead,
  allowInventoryCostRead,
  forecastReport
);
router.get("/scan/:barcode", ...authedTenantLocation, allowInventoryRead, barcodeScan);
router.get("/movements", ...authedTenantLocation, allowInventoryRead, movements);
router.get(
  "/pos-policy",
  ...authedTenantLocation,
  allowPosCatalogOrInventoryRead,
  posInventoryPolicy
);
router.get(
  "/menu-availability",
  ...authedTenantLocation,
  allowPosCatalogOrInventoryRead,
  menuAvailability
);
router.get(
  "/analytics/waste",
  ...authedTenantLocation,
  allowInventoryRead,
  allowInventoryCostRead,
  wasteAnalytics
);
router.get(
  "/wastage",
  ...authedTenantLocation,
  allowInventoryRead,
  listWastageEntries
);
router.post(
  "/wastage",
  ...authedTenantLocation,
  allowInventoryWrite,
  createWastageEntry
);
router.get(
  "/wastage/report",
  ...authedTenantLocation,
  allowInventoryRead,
  allowInventoryCostRead,
  wastageReport
);
router.get(
  "/analytics/price-history",
  ...authedTenantLocation,
  allowInventoryRead,
  allowInventoryCostRead,
  priceHistory
);
router.get("/balances", ...authedTenantLocation, allowInventoryRead, listBalances);

router.post(
  "/adjust",
  ...authedTenantLocation,
  allowInventoryWrite,
  adjust
);
router.post(
  "/returns",
  ...authedTenantLocation,
  allowInventoryWrite,
  customerReturn
);
router.post(
  "/bootstrap-balances",
  ...authedTenantLocation,
  allowInventoryWrite,
  bootstrapBalances
);
router.post(
  "/transfer",
  ...authedTenantLocation,
  allowInventoryWrite,
  postTransfer
);
router.patch(
  "/balances/planning",
  ...authedTenantLocation,
  allowInventoryWrite,
  patchBalancePlanning
);
router.post(
  "/alerts/run",
  ...authedTenantLocation,
  allowInventoryWrite,
  runInventoryAlerts
);

module.exports = router;
