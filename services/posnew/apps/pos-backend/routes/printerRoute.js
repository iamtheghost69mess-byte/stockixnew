const express = require("express");
const {
  listPrinters,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  testPrint,
  printerStatus,
  discoverPrinters,
} = require("../controllers/printerController");
const {
  authedTenant,
  authedTenantLocation,
} = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get(
  "/:id/status",
  ...authedTenant,
  requirePermission("pos.printer.read"),
  printerStatus
);
router.post(
  "/:id/test",
  ...authedTenant,
  requireBackofficeStaff,
  testPrint
);
router.get(
  "/discover",
  ...authedTenant,
  requirePermission("pos.printer.read"),
  discoverPrinters
);

router
  .route("/")
  .get(
    ...authedTenantLocation,
    requirePermission("pos.printer.read"),
    listPrinters
  )
  .post(
    ...authedTenantLocation,
    requireBackofficeStaff,
    createPrinter
  );

router
  .route("/:id")
  .get(...authedTenant, requirePermission("pos.printer.read"), getPrinterById)
  .put(
    ...authedTenant,
    requireBackofficeStaff,
    updatePrinter
  )
  .delete(
    ...authedTenant,
    requireBackofficeStaff,
    deletePrinter
  );

module.exports = router;
