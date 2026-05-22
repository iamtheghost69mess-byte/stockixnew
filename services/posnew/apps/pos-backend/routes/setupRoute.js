const express = require("express");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireAnyPermission } = require("../middlewares/requirePermission");
const {
  getSetupStatus,
  patchSetupStep,
  completeSetup,
} = require("../controllers/setupController");

const router = express.Router();

router.get(
  "/status",
  ...authedTenant,
  requireAnyPermission(["backoffice.*", "pos.config.read"]),
  getSetupStatus
);
router.patch(
  "/step/:stepNumber",
  ...authedTenant,
  requireAnyPermission(["backoffice.*", "pos.config.write"]),
  patchSetupStep
);
router.post(
  "/complete",
  ...authedTenant,
  requireAnyPermission(["backoffice.*", "pos.config.write"]),
  completeSetup
);

module.exports = router;
