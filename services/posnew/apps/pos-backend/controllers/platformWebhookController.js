const createHttpError = require("http-errors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const WebhookEndpoint = require("../models/webhookEndpointModel");
const WebhookOutbox = require("../models/webhookOutboxModel");
const { addJob } = require("../services/jobQueue");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");

const createEndpoint = async (req, res, next) => {
  try {
    const { organizationId, url, description, eventTypes } = req.body || {};
    if (!organizationId || !url) {
      return next(createHttpError(400, "organizationId and url are required."));
    }
    const secret = crypto.randomBytes(32).toString("hex");
    const doc = await WebhookEndpoint.create({
      organization: organizationId,
      url: String(url),
      description: description || "",
      signingSecretCurrent: secret,
      eventTypes: Array.isArray(eventTypes) ? eventTypes : ["*"],
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.webhook_endpoint.create",
      organization: doc.organization,
      metadata: { endpointId: String(doc._id) },
    });
    res.status(201).json({
      success: true,
      data: { ...doc.toJSON(), signingSecretCurrent: secret },
    });
  } catch (e) {
    next(e);
  }
};

const listEndpoints = async (req, res, next) => {
  try {
    const org = req.query.organizationId;
    const q = org ? { organization: org } : {};
    const rows = await WebhookEndpoint.find(q)
      .select("-signingSecretCurrent -signingSecretPrevious")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const revokeEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return next(createHttpError(400, "Invalid endpoint id."));
    }
    const doc = await WebhookEndpoint.findByIdAndUpdate(
      id,
      { $set: { disabled: true } },
      { new: true }
    )
      .select("-signingSecretCurrent -signingSecretPrevious")
      .lean();
    if (!doc) return next(createHttpError(404, "Endpoint not found."));
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.webhook_endpoint.revoke",
      organization: doc.organization,
      metadata: { endpointId: String(doc._id) },
    });
    res.json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

function previewPayload(payload) {
  if (payload === undefined || payload === null) return "";
  try {
    const s = typeof payload === "string" ? payload : JSON.stringify(payload);
    return s.length > 360 ? `${s.slice(0, 360)}…` : s;
  } catch {
    return "";
  }
}

const listOutbox = async (req, res, next) => {
  try {
    const { organizationId, endpointId, status, limit: limRaw } = req.query;
    const q = {};
    if (organizationId) q.organization = organizationId;
    if (endpointId && mongoose.Types.ObjectId.isValid(String(endpointId))) {
      q.endpoint = endpointId;
    }
    if (status && ["pending", "delivered", "failed"].includes(String(status))) {
      q.status = status;
    }
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limRaw || "50"), 10) || 50));
    const rows = await WebhookOutbox.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    const data = rows.map((r) => ({
      _id: r._id,
      organization: r.organization,
      endpoint: r.endpoint,
      eventType: r.eventType,
      status: r.status,
      attemptCount: r.attemptCount,
      lastError: r.lastError || "",
      nextAttemptAt: r.nextAttemptAt || null,
      idempotencyKey: r.idempotencyKey || "",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      payloadPreview: previewPayload(r.payload),
    }));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const enqueueOutbox = async (req, res, next) => {
  try {
    const { organizationId, endpointId, eventType, payload, idempotencyKey } =
      req.body || {};
    if (!organizationId || !endpointId || !eventType || !payload) {
      return next(
        createHttpError(400, "organizationId, endpointId, eventType, payload required.")
      );
    }
    const row = await WebhookOutbox.create({
      organization: organizationId,
      endpoint: endpointId,
      eventType: String(eventType),
      payload,
      idempotencyKey: idempotencyKey || undefined,
    });
    await addJob("webhooks_out", "deliver", { outboxId: String(row._id) });
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(409, "Duplicate idempotency key."));
    }
    next(e);
  }
};

module.exports = {
  createEndpoint,
  listEndpoints,
  revokeEndpoint,
  listOutbox,
  enqueueOutbox,
};
