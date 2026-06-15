const express = require("express");
const {
  listForIngredient,
  upsertLink,
  removeLink,
} = require("../controllers/ingredientSupplierController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router({ mergeParams: true });

router
  .route("/")
  .get(...authedTenant, allowInventoryRead, listForIngredient)
  .post(
    ...authedTenant,
    requireBackofficeStaff,
    allowInventoryWrite,
    upsertLink
  );

router.delete(
  "/:supplierId",
  ...authedTenant,
  requireBackofficeStaff,
  allowInventoryWrite,
  removeLink
);

module.exports = router;
