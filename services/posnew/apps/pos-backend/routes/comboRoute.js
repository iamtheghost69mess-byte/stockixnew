const express = require("express");
const {
  listCombos,
  createCombo,
  updateCombo,
  deleteCombo,
} = require("../controllers/comboController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenantLocation, requirePermission("pos.catalog.read"), listCombos);
router.post("/", ...authedTenantLocation, requireBackofficeStaff, createCombo);
router.put("/:id", ...authedTenantLocation, requireBackofficeStaff, updateCombo);
router.delete("/:id", ...authedTenantLocation, requireBackofficeStaff, deleteCombo);

module.exports = router;

