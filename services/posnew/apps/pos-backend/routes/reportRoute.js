const express = require("express");
const {
  authedTenantLocation,
  authedTenant,
  locationScope,
  locationMiddleware,
} = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const {
  sales,
  topItems,
  paymentMethods,
  foodCost,
  staff,
  tables,
  discountAuditList,
  posAuditList,
  vatReport,
  vatReportPdf,
  branchComparison,
  voidsReport,
  salesByCategory,
  expenses,
} = require("../controllers/reportController");

const router = express.Router();

const mgr = [...authedTenantLocation, requireBackofficeStaff];
const compareMode = [
  ...authedTenant,
  locationScope,
  (req, _res, next) => {
    const wantsAll = String(req.get("X-Location-Id") || "")
      .trim()
      .toLowerCase() === "all";
    const role = String(req.user?.role || "").toLowerCase();
    req.allowAllLocations = wantsAll && (role === "admin" || role === "manager");
    return next();
  },
  locationMiddleware,
  requireBackofficeStaff,
];

router.get("/sales", ...mgr, sales);
router.get("/top-items", ...mgr, topItems);
router.get("/payment-methods", ...mgr, paymentMethods);
router.get("/food-cost", ...mgr, foodCost);
router.get("/staff", ...mgr, staff);
router.get("/tables", ...mgr, tables);
router.get("/discount-audit", ...mgr, discountAuditList);
router.get("/pos-audit", ...mgr, posAuditList);
router.get("/vat", ...mgr, vatReport);
router.get("/vat/pdf", ...mgr, vatReportPdf);
router.get("/voids", ...mgr, voidsReport);
router.get("/sales-by-category", ...mgr, salesByCategory);
router.get("/expenses", ...mgr, expenses);
router.get("/branch-comparison", ...compareMode, branchComparison);

module.exports = router;
