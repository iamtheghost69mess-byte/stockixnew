const { writeAudit } = require("./platformAuditService");

const lastObservedStateByOrg = new Map();

/**
 * @param {string} orgId
 * @param {{ status: "active" | "expired" | "not_started", reason: string }} accessState
 * @param {{ actorType?: "platform_user" | "api_key" | "system", actorPlatformUser?: any, actorApiKeyPrefix?: string, requestId?: string, traceparent?: string }} [meta]
 */
async function emitAccessAuditEvent(event, meta = {}) {
  await writeAudit({
    action: event.action,
    actorType: meta.actorType || "system",
    actorPlatformUser: meta.actorPlatformUser,
    actorApiKeyPrefix: meta.actorApiKeyPrefix || "",
    organization: event.orgId,
    requestId: meta.requestId || "",
    traceparent: meta.traceparent || "",
    metadata: {
      eventType: event.eventType,
      orgId: String(event.orgId),
      previousState: event.previousState ?? null,
      newState: event.newState,
      reason: event.reason,
      route: event.route || "",
      timestamp: event.timestamp || new Date().toISOString(),
    },
  });
}

async function logAccessStateTransitionIfChanged(orgId, accessState, meta = {}) {
  const key = String(orgId);
  const previousState = lastObservedStateByOrg.get(key) || null;
  const newState = accessState.status;
  if (previousState === newState) return;
  lastObservedStateByOrg.set(key, newState);
  await emitAccessAuditEvent({
    action: "platform.org.access_state_transition",
    eventType: "access_state_transition",
    orgId,
    previousState,
    newState,
    reason: accessState.reason,
  }, meta);
}

async function logLicenseWindowUpdated({
  orgId,
  previousState,
  newState,
  reason,
  actorPlatformUser,
  actorApiKeyPrefix,
  requestId,
  traceparent,
}) {
  await emitAccessAuditEvent({
    action: "platform.org.license_window_updated",
    eventType: "license_window_updated",
    orgId,
    previousState,
    newState,
    reason,
  }, {
    actorType: actorApiKeyPrefix ? "api_key" : "platform_user",
    actorPlatformUser,
    actorApiKeyPrefix,
    requestId,
    traceparent,
  });
}

async function logBlockedRequest({
  orgId,
  reason,
  requestId,
  traceparent,
  route,
}) {
  await emitAccessAuditEvent({
    action: "platform.org.access_blocked",
    eventType: "blocked_request",
    orgId,
    previousState: null,
    newState: "blocked",
    reason,
    route,
  }, {
    actorType: "system",
    requestId,
    traceparent,
  });
}

module.exports = {
  emitAccessAuditEvent,
  logAccessStateTransitionIfChanged,
  logLicenseWindowUpdated,
  logBlockedRequest,
};
