const createHttpError = require("http-errors");
const { addJob } = require("../services/jobQueue");
const { bootstrapOrganization } = require("../services/orgBootstrapService");

const enqueueBootstrap = async (req, res, next) => {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return next(createHttpError(400, "organizationId required."));
    }
    const queueResult = await addJob("provisioning", "org_bootstrap", {
      organizationId: String(organizationId),
    });
    if (!queueResult?.queued) {
      const syncResult = await bootstrapOrganization({
        organizationId: String(organizationId),
      });
      if (!syncResult.ok) {
        return next(createHttpError(400, "Invalid organizationId."));
      }
      return res.json({ success: true, queued: false, mode: "sync_fallback" });
    }
    res.json({ success: true, queued: true, mode: "queue" });
  } catch (e) {
    next(e);
  }
};

module.exports = { enqueueBootstrap };
