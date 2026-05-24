const express = require("express");
const {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  unlockStaffPin,
} = require("../controllers/staffController");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

const canProvision = [requireBackofficeStaff];

router.route("/").get(...authedTenantLocation, ...canProvision, listStaff);
router.route("/").post(...authedTenantLocation, ...canProvision, createStaff);
router.route("/:id").get(...authedTenantLocation, ...canProvision, getStaff);
router.route("/:id").patch(...authedTenantLocation, ...canProvision, updateStaff);
router.route("/:id").delete(...authedTenantLocation, ...canProvision, deleteStaff);
router.post("/:id/unlock-pin", ...authedTenantLocation, ...canProvision, unlockStaffPin);

module.exports = router;
