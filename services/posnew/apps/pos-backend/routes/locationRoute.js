const express = require("express");
const {
  authedTenant,
  locationScope,
  locationMiddleware,
} = require("../middlewares/tenantRouteStacks");
const {
  requireAnyPermission,
} = require("../middlewares/requirePermission");
const { requireAnyRoleOrPermission } = require("../middlewares/requireRoleOrPermission");
const {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  getReceiptConfig,
  updateReceiptConfig,
} = require("../controllers/locationController");

const router = express.Router();

router.get(
  "/",
  ...authedTenant,
  requireAnyPermission([
    "backoffice.*",
    "backoffice.location.read",
    "pos.table.read",
    "pos.table.read_own",
  ]),
  listLocations
);
const locationWrite = requireAnyRoleOrPermission(
  ["admin", "manager"],
  ["backoffice.*", "backoffice.location.write"]
);
const receiptConfigRead = requireAnyPermission([
  "backoffice.*",
  "backoffice.location.read",
]);
const receiptConfigWrite = requireAnyPermission([
  "backoffice.*",
  "backoffice.location.write",
]);

router.post("/", ...authedTenant, locationWrite, createLocation);
router.put("/:id", ...authedTenant, locationWrite, updateLocation);
router.delete("/:id", ...authedTenant, locationWrite, deleteLocation);
router.get(
  "/receipt-config",
  ...authedTenant,
  locationScope,
  locationMiddleware,
  receiptConfigRead,
  getReceiptConfig
);
router.put(
  "/receipt-config",
  ...authedTenant,
  locationScope,
  locationMiddleware,
  receiptConfigWrite,
  updateReceiptConfig
);

module.exports = router;
