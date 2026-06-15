const express = require("express");
const {
  addTable,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  getTableQr,
} = require("../controllers/tableController");
const router = express.Router();
const {
  authedTenant,
  authedTenantLocation,
} = require("../middlewares/tenantRouteStacks");
const { requireAnyPermission, requirePermission } = require("../middlewares/requirePermission");

const scopedRead = [
  ...authedTenantLocation,
  requireAnyPermission(["pos.table.read", "pos.table.read_own"]),
];
const scopedWrite = [
  ...authedTenantLocation,
  requirePermission("pos.table.write"),
];

router.route("/").post(...scopedWrite, addTable);
router.route("/").get(...scopedRead, getTables);
router.get(
  "/:id/qr",
  ...authedTenant,
  requireAnyPermission(["pos.table.read", "pos.table.read_own"]),
  getTableQr
);
router
  .route("/:id")
  .get(
    ...authedTenant,
    requireAnyPermission(["pos.table.read", "pos.table.read_own"]),
    getTableById
  )
  .put(...authedTenant, requirePermission("pos.table.write"), updateTable)
  .delete(...authedTenant, requirePermission("pos.table.write"), deleteTable);

module.exports = router;
