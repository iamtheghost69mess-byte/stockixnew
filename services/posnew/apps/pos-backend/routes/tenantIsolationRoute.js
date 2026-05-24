const express = require("express");
const Order = require("../models/orderModel");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireTenantOrganization } = require("../middlewares/tenancyScope");
const { tenantDynamicRateLimit } = require("../middlewares/tieredRateLimit");
const { meterTenantApiCall } = require("../middlewares/usageMetering");

const router = express.Router();

/**
 * Scoped reads for isolation tests and future tenant-safe listings.
 * Requires POS user with `organization` set and matching JWT claim.
 */
router.get(
  "/orders",
  ...authedTenant,
  tenantDynamicRateLimit,
  requireTenantOrganization(),
  meterTenantApiCall,
  async (req, res, next) => {
    try {
      const orders = await Order.find({
        organization: req.tenantOrganizationId,
      })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();
      res.json({ success: true, data: orders });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
