const express = require("express");
const { problemJsonMiddleware } = require("../middlewares/problemJson");
const { platformAuthComposite } = require("../middlewares/platformAuthComposite");
const { platformApiRateLimit } = require("../middlewares/tieredRateLimit");
const { platformLoginRateLimit } = require("../middlewares/tieredRateLimit");
const { requirePlatformPermission } = require("../middlewares/platformRbac");
const { requirePlatformUserJwt } = require("../middlewares/requirePlatformUserJwt");
const { P } = require("../constants/platformPermissions");

const {
  login,
  refresh,
  logout,
  createApiKey,
  listApiKeys,
  me,
  revokeApiKey,
} = require("../controllers/platformAuthController");
const {
  listOrgs,
  listOrgsHealthSummary,
  createOrg,
  getOrg,
  getOrgByStockixTenant,
  getOrgObservability,
  getOrgProvisioningStatus,
  patchOrgLifecycle,
  patchOrgLicense,
  patchOrgLocationSupport,
  patchEntitlements,
  deleteOrg,
  resetCredentialRolePin,
  retryProvisioning,
} = require("../controllers/platformOrgController");
const { wireBigcapitalIntegration } = require("../controllers/platformIntegrationController");
const {
  summary,
  kpis,
  analytics,
} = require("../controllers/platformMetricsController");
const { platformSseStream } = require("../controllers/platformStreamController");
const { jobStatus, retryJob, listJobs } = require("../controllers/platformJobsController");
const {
  createEndpoint,
  listEndpoints,
  revokeEndpoint,
  listOutbox,
  enqueueOutbox,
} = require("../controllers/platformWebhookController");
const {
  requestExport,
  requestDeletion,
} = require("../controllers/platformComplianceController");
const { createInvitation, listInvitations } = require("../controllers/platformInvitationController");
const { upsertFlag, evalFlag, listFlags } = require("../controllers/platformFlagsController");
const { createSession } = require("../controllers/platformImpersonationController");
const { listAudits } = require("../controllers/platformAuditController");
const {
  getSystemOwnerSettings,
  patchSystemOwnerSettings,
} = require("../controllers/platformOwnerSettingsController");
const { enqueueBootstrap } = require("../controllers/platformBootstrapController");
const {
  listNotifications,
  markAsRead,
  markAllNotificationsRead,
  getUnreadCount,
} = require("../controllers/platformNotificationsController");
const {
  listGlobalUsers,
  getGlobalUser,
  setGlobalUserStatus,
  triggerGlobalUserPasswordReset,
} = require("../controllers/platformGlobalUserController");
const {
  listDevices,
  pendingCount,
  approveDevice,
  revokeDevice,
  updateNickname,
  deleteDevice,
} = require("../controllers/platformDeviceController");

const router = express.Router();

router.use(problemJsonMiddleware);

router.post(
  "/auth/login",
  platformLoginRateLimit,
  login
);
router.post("/auth/refresh", refresh);
router.post("/auth/logout", logout);

router.use(platformApiRateLimit);

/** Public spec for tooling / Swagger UI; still covered by platform API rate limit. */
router.get("/openapi.json", (_req, res) => {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const fs = require("fs");
    const path = require("path");
    const yaml = require("yaml");
    const p = path.join(__dirname, "..", "openapi", "platform-v1.yaml");
    const doc = yaml.parse(fs.readFileSync(p, "utf8"));
    res.json(doc);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.use(platformAuthComposite);

router.get("/auth/me", requirePlatformUserJwt, me);

router.post(
  "/auth/api-keys",
  requirePlatformUserJwt,
  requirePlatformPermission(P.ORG_WRITE),
  createApiKey
);
router.get(
  "/auth/api-keys",
  requirePlatformPermission(P.ORG_READ),
  listApiKeys
);
router.post(
  "/auth/api-keys/:id/revoke",
  requirePlatformUserJwt,
  requirePlatformPermission(P.ORG_WRITE),
  revokeApiKey
);

router.get("/organizations", requirePlatformPermission(P.ORG_READ), listOrgs);
router.post("/organizations", requirePlatformPermission(P.ORG_WRITE), createOrg);
router.get(
  "/organizations/health-summary",
  requirePlatformPermission(P.ORG_READ),
  listOrgsHealthSummary
);
router.get(
  "/organizations/by-stockix-tenant/:tenantId",
  requirePlatformPermission(P.ORG_READ),
  getOrgByStockixTenant
);
router.get(
  "/organizations/:id/provisioning-status",
  requirePlatformPermission(P.ORG_READ),
  getOrgProvisioningStatus
);
router.post(
  "/organizations/:id/provisioning/retry",
  requirePlatformPermission(P.ORG_WRITE),
  retryProvisioning
);
router.patch(
  "/organizations/:id/credentials/:role/reset-pin",
  requirePlatformPermission(P.ORG_WRITE),
  resetCredentialRolePin
);
router.get(
  "/organizations/:id/observability",
  requirePlatformPermission(P.ORG_READ),
  getOrgObservability
);
router.get("/organizations/:id", requirePlatformPermission(P.ORG_READ), getOrg);
router.put(
  "/organizations/:id/integration/bigcapital",
  requirePlatformPermission(P.ORG_WRITE),
  wireBigcapitalIntegration
);
router.patch(
  "/organizations/:id/lifecycle",
  requirePlatformPermission(P.ORG_WRITE),
  patchOrgLifecycle
);
router.patch(
  "/organizations/:id/license",
  requirePlatformPermission(P.ORG_WRITE),
  patchOrgLicense
);
router.patch(
  "/organizations/:id/support/location",
  requirePlatformPermission(P.ORG_WRITE),
  patchOrgLocationSupport
);
router.patch(
  "/organizations/:id/entitlements",
  requirePlatformPermission(P.ORG_WRITE),
  patchEntitlements
);
router.delete("/organizations/:id", requirePlatformPermission(P.ORG_WRITE), deleteOrg);

router.post(
  "/bootstrap",
  requirePlatformPermission(P.ORG_WRITE),
  enqueueBootstrap
);

router.get(
  "/system-settings",
  requirePlatformPermission(P.ORG_WRITE),
  getSystemOwnerSettings
);
router.patch(
  "/system-settings",
  requirePlatformPermission(P.ORG_WRITE),
  patchSystemOwnerSettings
);

router.get("/metrics/summary", requirePlatformPermission(P.METRICS_READ), summary);
router.get("/metrics/kpis", requirePlatformPermission(P.METRICS_READ), kpis);
router.get("/metrics/analytics", requirePlatformPermission(P.METRICS_READ), analytics);
router.get(
  "/stream",
  requirePlatformPermission(P.AUDIT_READ),
  platformSseStream
);

// Users
router.get("/users/global", requirePlatformPermission(P.ORG_READ), listGlobalUsers);
router.get("/users/global/:id", requirePlatformPermission(P.ORG_READ), getGlobalUser);
router.patch("/users/global/:id/status", requirePlatformPermission(P.ORG_WRITE), setGlobalUserStatus);
router.post("/users/global/:id/reset", requirePlatformPermission(P.ORG_WRITE), triggerGlobalUserPasswordReset);

router.get("/notifications", requirePlatformPermission(P.AUDIT_READ), listNotifications);
router.get("/notifications/unread-count", requirePlatformPermission(P.AUDIT_READ), getUnreadCount);
router.post("/notifications/all/read", requirePlatformPermission(P.AUDIT_READ), markAllNotificationsRead);
router.post("/notifications/:id/read", requirePlatformPermission(P.AUDIT_READ), markAsRead);

router.get("/devices", requirePlatformPermission(P.ORG_READ), listDevices);
router.get("/devices/pending-count", requirePlatformPermission(P.ORG_READ), pendingCount);
router.patch("/devices/:id/approve", requirePlatformPermission(P.ORG_WRITE), approveDevice);
router.patch("/devices/:id/revoke", requirePlatformPermission(P.ORG_WRITE), revokeDevice);
router.patch("/devices/:id/nickname", requirePlatformPermission(P.ORG_WRITE), updateNickname);
router.delete("/devices/:id", requirePlatformPermission(P.ORG_WRITE), deleteDevice);

router.get("/jobs", requirePlatformPermission(P.QUEUE_ADMIN), listJobs);
router.get("/jobs/:queue/:id", requirePlatformPermission(P.QUEUE_ADMIN), jobStatus);
router.post(
  "/jobs/:queue/:id/retry",
  requirePlatformPermission(P.QUEUE_ADMIN),
  retryJob
);

router.post(
  "/webhooks/endpoints",
  requirePlatformPermission(P.WEBHOOK_ADMIN),
  createEndpoint
);
router.get(
  "/webhooks/endpoints",
  requirePlatformPermission(P.WEBHOOK_ADMIN),
  listEndpoints
);
router.delete(
  "/webhooks/endpoints/:id",
  requirePlatformPermission(P.WEBHOOK_ADMIN),
  revokeEndpoint
);
router.get(
  "/webhooks/outbox",
  requirePlatformPermission(P.WEBHOOK_ADMIN),
  listOutbox
);
router.post(
  "/webhooks/outbox",
  requirePlatformPermission(P.WEBHOOK_ADMIN),
  enqueueOutbox
);

router.post(
  "/compliance/export",
  requirePlatformPermission(P.COMPLIANCE_RUN),
  requestExport
);
router.post(
  "/compliance/deletion",
  requirePlatformPermission(P.COMPLIANCE_RUN),
  requestDeletion
);

router.post(
  "/invitations",
  requirePlatformPermission(P.INVITE_ADMIN),
  createInvitation
);
router.get(
  "/invitations",
  requirePlatformPermission(P.INVITE_ADMIN),
  listInvitations
);

router.get("/flags", requirePlatformPermission(P.FLAG_ADMIN), listFlags);
router.put("/flags", requirePlatformPermission(P.FLAG_ADMIN), upsertFlag);
router.get("/flags/evaluate", requirePlatformPermission(P.ORG_READ), evalFlag);

router.post(
  "/impersonation/session",
  requirePlatformUserJwt,
  requirePlatformPermission(P.IMPERSONATE),
  createSession
);

router.get("/audits", requirePlatformPermission(P.AUDIT_READ), listAudits);

module.exports = router;
