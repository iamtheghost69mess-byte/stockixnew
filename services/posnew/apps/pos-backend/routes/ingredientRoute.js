const express = require("express");
const {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} = require("../controllers/ingredientController");
const ingredientSupplierRouter = require("./ingredientSupplierRoute");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router.route("/").get(...authedTenantLocation, allowInventoryRead, listIngredients).post(
  ...authedTenantLocation,
  requireBackofficeStaff,
  allowInventoryWrite,
  createIngredient
);

router
  .route("/:id")
  .put(
    ...authedTenantLocation,
    requireBackofficeStaff,
    allowInventoryWrite,
    updateIngredient
  )
  .delete(
    ...authedTenantLocation,
    requireBackofficeStaff,
    allowInventoryWrite,
    deleteIngredient
  );

router.use("/:ingredientId/supplier-links", ingredientSupplierRouter);

module.exports = router;
