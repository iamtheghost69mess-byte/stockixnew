const { recordEvent } = require("../services/productEventService");

function routeTag(req) {
  const p = req.baseUrl || req.path || "";
  if (p.includes("/inventory")) return "inventory";
  if (p.includes("/order")) return "order";
  return "tenant";
}

/**
 * Records a lightweight product event for mutating requests (inventory + orders).
 */
function productEventMutation(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }
  const orgId = req.tenantOrganizationId;
  if (!orgId) return next();
  const actorKind = req.user ? "user" : "system";
  const actorId = req.user?._id ? String(req.user._id) : "";
  const tag = routeTag(req);
  void recordEvent({
    eventType: `${tag}.${req.method.toLowerCase()}.${(req.route?.path || req.path || "").replace(/^\//, "").slice(0, 80) || "mutation"}`,
    organizationId: orgId,
    actor: { kind: actorKind, id: actorId },
    payload: { method: req.method, path: req.originalUrl || req.url },
    correlationId: res.locals?.requestId,
  }).catch(() => {
    /* never block request */
  });
  next();
}

module.exports = { productEventMutation };
