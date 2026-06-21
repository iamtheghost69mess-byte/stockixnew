import { Request, Response } from "express";
const PlatformAuditLog = require("../models/platformAuditLogModel");
const PlatformNotification = require("../models/platformNotificationModel");

const NOTIFICATION_EVENTS: Record<string, { severity: string; title: string }> = {
  "platform.org.create": { severity: "info", title: "Organization created" },
  "platform.org.provisioning_retry": {
    severity: "warning",
    title: "Provisioning retry requested",
  },
  "platform.org.lifecycle": { severity: "warning", title: "Organization lifecycle updated" },
  "platform.org.entitlements": { severity: "warning", title: "Entitlements updated" },
  "platform.org.delete": { severity: "critical", title: "Organization deleted" },
  "platform.org.credential_role_pin_reset": {
    severity: "warning",
    title: "Default credential PIN reset",
  },
  "platform.compliance.export_requested": {
    severity: "warning",
    title: "Compliance export requested",
  },
  "platform.compliance.deletion_scheduled": {
    severity: "critical",
    title: "Organization deletion scheduled",
  },
  "platform.job.retry": { severity: "warning", title: "Background job retried" },
  "platform.impersonation.start": {
    severity: "warning",
    title: "Impersonation session started",
  },
  "platform.webhook_endpoint.revoke": {
    severity: "warning",
    title: "Webhook endpoint revoked",
  },
  "platform.api_key.revoke": { severity: "warning", title: "API key revoked" },
  "platform.refresh.reuse_suspected": {
    severity: "critical",
    title: "Refresh token reuse suspected",
  },
};

async function writeAudit(entry: any) {
  const doc: any = {
    action: entry.action,
    actorType: entry.actorType || "platform_user",
    organization: entry.organization || null,
    metadata: entry.metadata,
    requestId: entry.requestId || "",
    traceparent: entry.traceparent || "",
  };
  if (entry.actorPlatformUser) {
    doc.actorPlatformUser = entry.actorPlatformUser;
  }
  if (entry.actorApiKeyPrefix) {
    doc.actorApiKeyPrefix = entry.actorApiKeyPrefix;
    doc.actorType = "api_key";
  }
  await PlatformAuditLog.create(doc);

  if (NOTIFICATION_EVENTS[entry.action]) {
    const defaultData = NOTIFICATION_EVENTS[entry.action];
    await PlatformNotification.create({
      title: entry.metadata?.title || defaultData.title,
      body: entry.metadata?.body || `Event generated: ${entry.action}`,
      severity: entry.metadata?.severity || defaultData.severity,
      href: entry.metadata?.href || null,
      readBy: []
    });
  }
}

function auditFromRequest(req: Request, res: Response, extra: any = {}) {
  return {
    requestId: res?.locals?.requestId || "",
    traceparent: res?.locals?.traceparent || "",
    ...extra,
  };
}

export = { writeAudit, auditFromRequest };
