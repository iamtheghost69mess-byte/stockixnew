const express = require("express");
const {
  listRecipes,
  getRecipeByMenuItem,
  upsertRecipe,
  deleteRecipe,
} = require("../controllers/recipeController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenant, requireBackofficeStaff, listRecipes);
router.get(
  "/by-menu-item/:menuItemId",
  ...authedTenant,
  requireBackofficeStaff,
  getRecipeByMenuItem
);

router.post(
  "/",
  ...authedTenant,
  requireBackofficeStaff,
  upsertRecipe
);

router.delete(
  "/by-menu-item/:menuItemId",
  ...authedTenant,
  requireBackofficeStaff,
  deleteRecipe
);

module.exports = router;
