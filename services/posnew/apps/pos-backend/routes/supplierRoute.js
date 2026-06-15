const express = require("express");
const {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require("../controllers/supplierController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowSupplierManage,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router
  .route("/")
  .get(...authedTenant, allowInventoryRead, listSuppliers)
  .post(
    ...authedTenant,
    requireBackofficeStaff,
    allowSupplierManage,
    createSupplier
  );

router
  .route("/:id")
  .put(
    ...authedTenant,
    requireBackofficeStaff,
    allowSupplierManage,
    updateSupplier
  )
  .delete(
    ...authedTenant,
    requireBackofficeStaff,
    allowSupplierManage,
    deleteSupplier
  );

module.exports = router;
