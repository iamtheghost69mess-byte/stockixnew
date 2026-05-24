const express = require("express");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requirePermission } = require("../middlewares/requirePermission");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  getConfig,
  putConfig,
  redeemPreview,
  earnFromOrder,
} = require("../controllers/loyaltyController");

const router = express.Router();

router.get(
  "/config",
  ...authedTenant,
  requirePermission("pos.loyalty.use"),
  getConfig
);
router.put(
  "/config",
  ...authedTenant,
  requireBackofficeStaff,
  putConfig
);
router.post(
  "/redeem",
  ...authedTenant,
  requirePermission("pos.loyalty.use"),
  redeemPreview
);
router.post(
  "/earn",
  ...authedTenant,
  requirePermission("pos.loyalty.use"),
  earnFromOrder
);

module.exports = router;
