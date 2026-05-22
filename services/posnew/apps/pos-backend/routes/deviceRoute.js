const express = require("express");
const {
  listDevices,
  approveDevice,
  revokeDevice,
  updateDeviceNickname,
  deleteDevice,
} = require("../controllers/deviceController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");

const router = express.Router();

router.get("/", ...authedTenant, requireBackofficeStaff, listDevices);
router.patch(
  "/:id/approve",
  ...authedTenant,
  requireBackofficeStaff,
  approveDevice
);
router.patch("/:id/revoke", ...authedTenant, requireBackofficeStaff, revokeDevice);
router.patch(
  "/:id/nickname",
  ...authedTenant,
  requireBackofficeStaff,
  updateDeviceNickname
);
router.delete("/:id", ...authedTenant, requireBackofficeStaff, deleteDevice);

module.exports = router;
