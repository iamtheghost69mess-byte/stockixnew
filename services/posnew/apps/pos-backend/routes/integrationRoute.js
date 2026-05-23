const express = require("express");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const IntegrationConfig = require("../models/integrationConfigModel");
const IntegrationItemMapping = require("../models/integrationItemMappingModel");
const AccountingConfig = require("../models/accountingConfigModel");
const { ensureDefaultAccountsAndConfig } = require("../services/accountingService");
const { getQueue, addJob, QUEUE_NAMES } = require("../services/jobQueue");

const router = express.Router();
const scoped = [...authedTenant, requireBackofficeStaff];

const QUEUE_NAME = "bigcapital_sync";

function maskIntegrationConfig(doc) {
  const safe = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  if (safe.bigcapital?.internalSecret) {
    safe.bigcapital.internalSecret = "***";
  }
  return safe;
}

router.get("/config", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const config = await IntegrationConfig.findOne({ organization: orgId });
    res.status(200).json({ success: true, data: maskIntegrationConfig(config) });
  } catch (e) {
    next(e);
  }
});

router.put("/config", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const incoming = req.body?.bigcapital || {};
    const existing = await IntegrationConfig.findOne({ organization: orgId });

    const merged = {
      ...(existing?.bigcapital?.toObject?.() || existing?.bigcapital || {}),
      ...incoming,
    };

    if (
      incoming.internalSecret === "***" ||
      incoming.internalSecret === ""
    ) {
      delete merged.internalSecret;
      if (existing?.bigcapital?.internalSecret) {
        merged.internalSecret = existing.bigcapital.internalSecret;
      }
    }

    const config = await IntegrationConfig.findOneAndUpdate(
      { organization: orgId },
      { $set: { bigcapital: merged } },
      { new: true, upsert: true }
    );

    if (typeof merged.enabled === "boolean") {
      await ensureDefaultAccountsAndConfig(orgId);
      await AccountingConfig.findOneAndUpdate(
        { organization: orgId },
        { $set: { bigcapitalIntegrationEnabled: merged.enabled } }
      );
    }

    res.status(200).json({ success: true, data: maskIntegrationConfig(config) });
  } catch (e) {
    next(e);
  }
});

router.post("/test-connection", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const config = await IntegrationConfig.findOne({ organization: orgId });

    if (!config?.bigcapital?.internalBaseUrl) {
      return res.status(400).json({
        success: false,
        error: "Bigcapital integration is not configured",
      });
    }

    const base = String(config.bigcapital.internalBaseUrl).replace(/\/$/, "");
    const response = await fetch(`${base}/api/ping`, {
      headers: {
        "x-internal-secret": config.bigcapital.internalSecret || "",
      },
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    res.status(200).json({ success: true, message: "Connected to Bigcapital" });
  } catch (e) {
    res.status(200).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.get("/item-mappings", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const mappings = await IntegrationItemMapping.find({
      organization: orgId,
    }).populate("posMenuItemId", "name price");

    res.status(200).json({ success: true, data: mappings });
  } catch (e) {
    next(e);
  }
});

router.post("/item-mappings", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { posMenuItemId, bigcapitalItemId, bigcapitalItemName, bigcapitalCostPrice } =
      req.body;

    const mapping = await IntegrationItemMapping.findOneAndUpdate(
      { organization: orgId, posMenuItemId },
      {
        $set: {
          organization: orgId,
          posMenuItemId,
          bigcapitalItemId,
          bigcapitalItemName,
          bigcapitalCostPrice,
          syncedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, data: mapping });
  } catch (e) {
    next(e);
  }
});

router.delete("/item-mappings/:posMenuItemId", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    await IntegrationItemMapping.findOneAndDelete({
      organization: orgId,
      posMenuItemId: req.params.posMenuItemId,
    });
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get("/sync/status", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const config = await IntegrationConfig.findOne({ organization: orgId });
    const q = getQueue(QUEUE_NAME);

    let waiting = 0;
    let failed = 0;
    let active = 0;
    if (q) {
      [waiting, failed, active] = await Promise.all([
        q.getWaitingCount(),
        q.getFailedCount(),
        q.getActiveCount(),
      ]);
    }

    res.status(200).json({
      success: true,
      data: {
        enabled: config?.bigcapital?.enabled ?? false,
        lastSyncedAt: config?.bigcapital?.lastSyncedAt,
        lastSyncError: config?.bigcapital?.lastSyncError,
        syncStatus: config?.bigcapital?.syncStatus ?? "idle",
        queue: { waiting, failed, active },
        queueAvailable: Boolean(q),
        queueNames: QUEUE_NAMES,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/sync/replay/:orderId", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const result = await addJob(
      QUEUE_NAME,
      "sync_paid_order",
      {
        orderId: req.params.orderId,
        organizationId: String(orgId),
      },
      {
        jobId: `bigcapital_replay_${req.params.orderId}_${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    if (!result.queued) {
      return res.status(503).json({
        success: false,
        error: result.reason || "Queue unavailable",
      });
    }

    res.status(200).json({ success: true, message: "Replay queued", jobId: result.jobId });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
