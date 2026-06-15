const express = require("express");
const {
  listMenuItems,
  listMenuItemVariants,
  createMenuItemVariant,
  updateMenuItemVariant,
  deleteMenuItemVariant,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  patchAvailability,
  deleteMenuItem,
  attachModifierGroupsToMenuItem,
} = require("../controllers/menuItemController");
const { authedTenant, authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenantLocation, requirePermission("pos.catalog.read"), listMenuItems);
router.get(
  "/:menuItemId/variants",
  ...authedTenantLocation,
  requirePermission("pos.catalog.read"),
  listMenuItemVariants
);
router.post(
  "/:menuItemId/variants",
  ...authedTenantLocation,
  requireBackofficeStaff,
  createMenuItemVariant
);
router.put(
  "/variants/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  updateMenuItemVariant
);
router.delete(
  "/variants/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  deleteMenuItemVariant
);

router.get(
  "/:id",
  ...authedTenantLocation,
  requirePermission("pos.catalog.read"),
  getMenuItem
);

router.post(
  "/",
  ...authedTenantLocation,
  requireBackofficeStaff,
  createMenuItem
);

router.put(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  updateMenuItem
);

router.patch(
  "/:id/modifier-groups",
  ...authedTenantLocation,
  requireBackofficeStaff,
  attachModifierGroupsToMenuItem
);

router.patch(
  "/:id/availability",
  ...authedTenantLocation,
  requireBackofficeStaff,
  patchAvailability
);

router.delete(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  deleteMenuItem
);

module.exports = router;
