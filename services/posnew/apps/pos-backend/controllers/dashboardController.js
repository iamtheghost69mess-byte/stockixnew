const {
  getDefaultDashboard,
  getRecentOrders,
  getRecentVoids,
  getDashboardLowStock,
} = require("../services/dashboardService");

/**
 * Authenticated default KPI dashboard (revenue, COGS, profit, QR menu visitors).
 *
 * @type {import("express").RequestHandler}
 */
const defaultDashboard = async (req, res, next) => {
  try {
    const data = await getDefaultDashboard({
      organizationId: req.tenantOrganizationId,
      locationScopeId: req.locationScopeId,
      query: req.query,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  defaultDashboard,
  recentOrders: async (req, res, next) => {
    try {
      const data = await getRecentOrders({
        organizationId: req.tenantOrganizationId,
        locationScopeId: req.locationScopeId,
        limit: req.query.limit,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  recentVoids: async (req, res, next) => {
    try {
      const data = await getRecentVoids({
        organizationId: req.tenantOrganizationId,
        locationScopeId: req.locationScopeId,
        limit: req.query.limit,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  lowStock: async (req, res, next) => {
    try {
      const data = await getDashboardLowStock({
        organizationId: req.tenantOrganizationId,
        locationScopeId: req.locationScopeId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
