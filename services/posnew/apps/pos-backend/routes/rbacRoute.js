const express = require("express");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const {
  requireBackofficeStaff,
  requireTenantRoleOrPermission,
} = require("../middlewares/requireRoleOrPermission");
const {
  getCatalog,
  getConfig,
  putConfig,
  getMe,
  listCustomRoles,
} = require("../controllers/rbacController");

const router = express.Router();

const adminRbac = [
  ...authedTenant,
  requireTenantRoleOrPermission({ roles: ["admin"], permission: "admin.rbac.manage" }),
];

router.get("/me", ...authedTenant, getMe);
router.get(
  "/custom-roles",
  ...authedTenant,
  requireBackofficeStaff,
  listCustomRoles
);
router.get("/catalog", ...adminRbac, getCatalog);
router.get("/config", ...adminRbac, getConfig);
router.put("/config", ...adminRbac, putConfig);

module.exports = router;
