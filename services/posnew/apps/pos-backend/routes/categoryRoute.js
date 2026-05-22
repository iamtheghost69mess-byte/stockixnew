const express = require("express");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenantLocation, requirePermission("pos.catalog.read"), listCategories);

router.post("/", ...authedTenantLocation, requireBackofficeStaff, createCategory);

router.put(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  updateCategory
);
router.patch(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  updateCategory
);

router.delete(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  deleteCategory
);

module.exports = router;
