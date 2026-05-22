const express = require("express");
const { getUserData } = require("../controllers/userController");
const { login, logout } = require("../controllers/authController");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { loginRateLimiter } = require("../middlewares/loginRateLimiter");
const { deviceAuth } = require("../middlewares/deviceAuth");
const router = express.Router();

router.route("/login").post(loginRateLimiter, deviceAuth, (req, res, next) => {
  res.setHeader("X-Deprecated-Route", "Use /api/auth/login");
  return login(req, res, next);
});
router.route("/logout").post(...authedTenant, (req, res, next) => {
  res.setHeader("X-Deprecated-Route", "Use /api/auth/logout");
  return logout(req, res, next);
});
router.route("/").get(...authedTenant, getUserData);

module.exports = router;
