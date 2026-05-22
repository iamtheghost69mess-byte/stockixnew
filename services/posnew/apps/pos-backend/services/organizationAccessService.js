const createHttpError = require("http-errors");
const config = require("../config/config");
const { getOrganizationAccessState } = require("./licenseWindowService");
const { OrgAccessCache } = require("./orgAccessCache");
const {
  logAccessStateTransitionIfChanged,
  logBlockedRequest,
  emitAccessAuditEvent,
} = require("./accessStateAuditService");

function toAccessInput(organization) {
  return {
    licenseStartDate: organization?.licenseStartDate ?? organization?.licenseStartsAt ?? null,
    licenseEndDate: organization?.licenseEndDate ?? organization?.licenseEndsAt ?? null,
    timezone: organization?.timezone ?? null,
  };
}

async function resolveOrganizationAccessState(orgId, organization, context = {}) {
  const accessState = context.useCache === false
    ? getOrganizationAccessState(organization)
    : await OrgAccessCache.getCachedAccessState(orgId, toAccessInput(organization));
  await logAccessStateTransitionIfChanged(orgId, accessState, {
    actorType: context.actorType || "system",
    actorPlatformUser: context.actorPlatformUser,
    actorApiKeyPrefix: context.actorApiKeyPrefix || "",
    requestId: context.requestId,
    traceparent: context.traceparent,
  });
  return accessState;
}

async function enforceOrganizationAccess(orgId, organization, context = {}) {
  const accessState = await resolveOrganizationAccessState(orgId, organization, context);
  if (!accessState.blocked) return accessState;
  await logBlockedRequest({
    orgId,
    reason: accessState.reason,
    requestId: context.requestId,
    traceparent: context.traceparent,
    route: context.routeKey,
  });
  if (config.licenseEnforcementMode === "shadow") return accessState;
  throw createHttpError(403, accessState.reason);
}

async function logWorkerSkipDueToBlockedOrg(orgId, accessState, context = {}) {
  await emitAccessAuditEvent(
    {
      action: "platform.org.access_blocked",
      eventType: "blocked_request",
      orgId,
      previousState: null,
      newState: "blocked",
      reason: "worker_skip_blocked",
      route: context.workerName || "worker",
    },
    {
      actorType: "system",
      requestId: context.requestId,
      traceparent: context.traceparent,
    }
  );
}

module.exports = {
  toAccessInput,
  resolveOrganizationAccessState,
  enforceOrganizationAccess,
  logWorkerSkipDueToBlockedOrg,
};
