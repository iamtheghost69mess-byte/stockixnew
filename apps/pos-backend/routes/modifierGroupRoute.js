const express = require("express");
const {
  listModifierGroups,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
} = require("../controllers/modifierGroupController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const { requirePermission } = require("../middlewares/requirePermission");

const router = express.Router();

router.get(
  "/",
  ...authedTenantLocation,
  requirePermission("pos.catalog.read"),
  listModifierGroups
);
router.post(
  "/",
  ...authedTenantLocation,
  requireBackofficeStaff,
  createModifierGroup
);
router.put(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  updateModifierGroup
);
router.delete(
  "/:id",
  ...authedTenantLocation,
  requireBackofficeStaff,
  deleteModifierGroup
);

module.exports = router;

