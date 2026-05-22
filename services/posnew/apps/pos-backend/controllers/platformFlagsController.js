const createHttpError = require("http-errors");
const FeatureFlag = require("../models/featureFlagModel");
const { evaluateFlag } = require("../services/featureFlagService");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");

const upsertFlag = async (req, res, next) => {
  try {
    const {
      key,
      description,
      defaultEnabled,
      rolloutPercent,
      killSwitch,
      orgOverrides,
    } = req.body || {};
    if (!key) return next(createHttpError(400, "key required"));
    const k = String(key).toLowerCase();
    let row = await FeatureFlag.findOne({ key: k });
    if (!row) row = new FeatureFlag({ key: k });
    if (description !== undefined) row.description = String(description);
    if (defaultEnabled !== undefined) row.defaultEnabled = Boolean(defaultEnabled);
    if (rolloutPercent !== undefined) row.rolloutPercent = Number(rolloutPercent);
    if (killSwitch !== undefined) row.killSwitch = Boolean(killSwitch);
    if (orgOverrides !== undefined) row.orgOverrides = orgOverrides;
    await row.save();
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.feature_flag.upsert",
      metadata: { key: row.key, killSwitch: row.killSwitch },
    });
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
};

const evalFlag = async (req, res, next) => {
  try {
    const { key, organizationId } = req.query;
    if (!key) return next(createHttpError(400, "key required"));
    const enabled = await evaluateFlag(String(key), organizationId || null);
    res.json({ success: true, data: { key, organizationId, enabled } });
  } catch (e) {
    next(e);
  }
};

const listFlags = async (req, res, next) => {
  try {
    const flags = await FeatureFlag.find().sort({ key: 1 }).lean();
    res.json({ success: true, data: flags });
  } catch (e) {
    next(e);
  }
};

module.exports = { upsertFlag, evalFlag, listFlags };
