const express = require("express");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/ingredientCategoryController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  allowInventoryRead,
  allowInventoryWrite,
} = require("../middlewares/backofficeInventory");

const router = express.Router();

router
  .route("/")
  .get(...authedTenant, allowInventoryRead, listCategories)
  .post(
    ...authedTenant,
    requireBackofficeStaff,
    allowInventoryWrite,
    createCategory
  );

router
  .route("/:id")
  .put(
    ...authedTenant,
    requireBackofficeStaff,
    allowInventoryWrite,
    updateCategory
  )
  .delete(
    ...authedTenant,
    requireBackofficeStaff,
    allowInventoryWrite,
    deleteCategory
  );

module.exports = router;
