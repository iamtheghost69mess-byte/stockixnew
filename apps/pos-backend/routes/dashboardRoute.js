const express = require("express");
const { authedTenant, locationScope, locationMiddleware } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  defaultDashboard,
  recentOrders,
  recentVoids,
  lowStock,
} = require("../controllers/dashboardController");

const router = express.Router();

function allowAllLocationsForAdminOnly(req, _res, next) {
  if (String(req.get("X-Location-Id") || "").trim().toLowerCase() !== "all") {
    req.allowAllLocations = false;
    return next();
  }
  const role = String(req.user?.role || "").toLowerCase();
  req.allowAllLocations = role === "admin" || role === "manager";
  return next();
}

const mgr = [
  ...authedTenant,
  locationScope,
  allowAllLocationsForAdminOnly,
  locationMiddleware,
  requireBackofficeStaff,
];

router.get("/default", ...mgr, defaultDashboard);
router.get("/recent-orders", ...mgr, recentOrders);
router.get("/recent-voids", ...mgr, recentVoids);
router.get("/low-stock", ...mgr, lowStock);

module.exports = router;
