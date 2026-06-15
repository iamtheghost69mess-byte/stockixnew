const express = require("express");
const {
  register,
  login,
  refresh,
  logout,
  session,
  acceptInvitation,
} = require("../controllers/authController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireTenantRoleOrPermission } = require("../middlewares/requireRoleOrPermission");
const { loginRateLimiter } = require("../middlewares/loginRateLimiter");
const { deviceAuth } = require("../middlewares/deviceAuth");

const router = express.Router();

/** Admin job title or effective RBAC with back-office access (custom permissionRole). */
router.post(
  "/register",
  ...authedTenant,
  requireTenantRoleOrPermission({ roles: ["admin"], permission: "backoffice.*" }),
  register
);
router.get("/session", session);
router.post("/login", loginRateLimiter, deviceAuth, login);
router.post("/invitations/accept", loginRateLimiter, acceptInvitation);
router.post("/refresh", refresh);
router.post("/logout", ...authedTenant, logout);

module.exports = router;
