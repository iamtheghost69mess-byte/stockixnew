const { consumeWithinLimit } = require("../services/entitlementService");
const { recordTenantApiRequest } = require("../services/tenantApiUsageService");

/**
 * Best-effort API call metering for tenant routes (after tenant org is known).
 */
function meterTenantApiCall(req, res, next) {
  const orgId = req.tenantOrganizationId || req.user?.organization;
  if (!orgId) return next();
  const id = orgId._id || orgId;
  const endpointKey = `${req.baseUrl || ""}${req.route?.path || req.path || ""}` || req.originalUrl;
  const method = req.method || "GET";
  const removeListener = () => {
    res.removeListener("finish", onFinish);
  };
  const onFinish = () => {
    Promise.allSettled([
      recordTenantApiRequest({
        organizationId: id,
        method,
        endpointKey,
        statusCode: res.statusCode,
      }),
    ]).then((results) => {
      const failed = results.find((r) => r.status === "rejected");
      if (failed) {
        // eslint-disable-next-line no-console
        console.warn("[usage-metering] post-response telemetry failed");
      }
    }).catch(() => {});
    removeListener();
  };

  consumeWithinLimit(id, "apiCalls", 1)
    .then(() => {
      res.on("finish", onFinish);
      next();
    })
    .catch((e) => {
      if (e.status) return next(e);
      next();
    });
}

module.exports = { meterTenantApiCall };
