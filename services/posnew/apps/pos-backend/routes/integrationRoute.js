const express = require("express");
const { authedTenant } = require("../middlewares/tenantRouteStacks");
const { requireBackofficeStaff } = require("../middlewares/requireRoleOrPermission");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const IntegrationConfig = require("../models/integrationConfigModel");
const IntegrationItemMapping = require("../models/integrationItemMappingModel");
const IntegrationIngredientMapping = require("../models/integrationIngredientMappingModel");
const IntegrationVendorMapping = require("../models/integrationVendorMappingModel");
const AccountingConfig = require("../models/accountingConfigModel");
const { ensureDefaultAccountsAndConfig } = require("../services/accountingService");
const { getQueue, addJob, QUEUE_NAMES } = require("../services/jobQueue");
const AccountingIntegrationOutbox = require("../models/accountingIntegrationOutboxModel");
const { listEventCatalog } = require("../services/accountingIntegrationEvents");
const {
  JOB_NAME_BY_EVENT,
  recordAndDispatchAccountingSync,
} = require("../services/accountingIntegrationOutbox");
const { getIntegrationMappingCoverage } = require("../services/integrationMappingCoverage");

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

router.put("/config/location-mapping", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { locationMapping, defaultWarehouseId } = req.body || {};
    const setFields = {};
    if (Array.isArray(locationMapping)) {
      setFields["bigcapital.locationMapping"] = locationMapping.map((row) => ({
        posLocationId: row.posLocationId,
        bigcapitalBranchId: row.bigcapitalBranchId,
        bigcapitalWarehouseId: row.bigcapitalWarehouseId,
      }));
    }
    if (defaultWarehouseId !== undefined) {
      setFields["bigcapital.defaultWarehouseId"] = defaultWarehouseId;
    }
    const config = await IntegrationConfig.findOneAndUpdate(
      { organization: orgId },
      { $set: setFields },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, data: maskIntegrationConfig(config) });
  } catch (e) {
    next(e);
  }
});

router.post("/config/location-mapping", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { posLocationId, bigcapitalBranchId, bigcapitalWarehouseId } =
      req.body || {};
    if (!posLocationId) {
      return res.status(400).json({
        success: false,
        error: "posLocationId is required",
      });
    }
    const config = await IntegrationConfig.findOne({ organization: orgId });
    const existing = config?.bigcapital?.locationMapping || [];
    const filtered = existing.filter(
      (m) => String(m.posLocationId) !== String(posLocationId)
    );
    filtered.push({
      posLocationId,
      bigcapitalBranchId,
      bigcapitalWarehouseId,
    });
    const updated = await IntegrationConfig.findOneAndUpdate(
      { organization: orgId },
      { $set: { "bigcapital.locationMapping": filtered } },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, data: maskIntegrationConfig(updated) });
  } catch (e) {
    next(e);
  }
});

router.delete(
  "/config/location-mapping/:posLocationId",
  ...scoped,
  async (req, res, next) => {
    try {
      const orgId = assertTenantOrganization(req);
      const config = await IntegrationConfig.findOne({ organization: orgId });
      const existing = config?.bigcapital?.locationMapping || [];
      const filtered = existing.filter(
        (m) => String(m.posLocationId) !== String(req.params.posLocationId)
      );
      const updated = await IntegrationConfig.findOneAndUpdate(
        { organization: orgId },
        { $set: { "bigcapital.locationMapping": filtered } },
        { new: true, upsert: true }
      );
      res.status(200).json({ success: true, data: maskIntegrationConfig(updated) });
    } catch (e) {
      next(e);
    }
  }
);

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

router.get("/ingredient-mappings", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const mappings = await IntegrationIngredientMapping.find({
      organization: orgId,
    }).populate("posIngredientId", "name unit sku");
    res.status(200).json({ success: true, data: mappings });
  } catch (e) {
    next(e);
  }
});

router.post("/ingredient-mappings", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { posIngredientId, bigcapitalItemId, bigcapitalItemName } = req.body;
    const mapping = await IntegrationIngredientMapping.findOneAndUpdate(
      { organization: orgId, posIngredientId },
      {
        $set: {
          organization: orgId,
          posIngredientId,
          bigcapitalItemId,
          bigcapitalItemName,
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

router.delete(
  "/ingredient-mappings/:posIngredientId",
  ...scoped,
  async (req, res, next) => {
    try {
      const orgId = assertTenantOrganization(req);
      await IntegrationIngredientMapping.findOneAndDelete({
        organization: orgId,
        posIngredientId: req.params.posIngredientId,
      });
      res.status(200).json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);

router.get("/vendor-mappings", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const mappings = await IntegrationVendorMapping.find({
      organization: orgId,
    }).populate("posSupplierId", "name code");
    res.status(200).json({ success: true, data: mappings });
  } catch (e) {
    next(e);
  }
});

router.post("/vendor-mappings", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { posSupplierId, bigcapitalVendorId, bigcapitalVendorName } = req.body;
    const mapping = await IntegrationVendorMapping.findOneAndUpdate(
      { organization: orgId, posSupplierId },
      {
        $set: {
          organization: orgId,
          posSupplierId,
          bigcapitalVendorId,
          bigcapitalVendorName,
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

router.delete(
  "/vendor-mappings/:posSupplierId",
  ...scoped,
  async (req, res, next) => {
    try {
      const orgId = assertTenantOrganization(req);
      await IntegrationVendorMapping.findOneAndDelete({
        organization: orgId,
        posSupplierId: req.params.posSupplierId,
      });
      res.status(200).json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);

router.get("/events", ...scoped, async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: listEventCatalog() });
  } catch (e) {
    next(e);
  }
});

router.get("/mapping-coverage", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const data = await getIntegrationMappingCoverage(orgId);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.get("/outbox", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const status = req.query.status ? String(req.query.status) : undefined;
    const filter = { organization: orgId };
    if (status) filter.status = status;

    const rows = await AccountingIntegrationOutbox.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/outbox/:outboxId/retry", ...scoped, async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const row = await AccountingIntegrationOutbox.findOne({
      _id: req.params.outboxId,
      organization: orgId,
    }).lean();
    if (!row) {
      return res.status(404).json({ success: false, error: "Outbox row not found" });
    }
    if (row.status === "completed") {
      return res.status(200).json({ success: true, skipped: true, reason: "already_completed" });
    }

    if (!JOB_NAME_BY_EVENT[row.eventType]) {
      return res.status(400).json({ success: false, error: "Unknown event type" });
    }

    await AccountingIntegrationOutbox.updateOne(
      { _id: row._id },
      { status: "pending", lastError: "", nextAttemptAt: null }
    );

    const result = await recordAndDispatchAccountingSync({
      organizationId: String(orgId),
      resourceId: String(row.orderId),
      orderId: String(row.orderId),
      eventType: row.eventType,
      idempotencyKey: row.idempotencyKey,
      originatedBy: req.body?.originatedBy || "integration.outbox.retry",
      payload: row.payload || {},
    });

    res.status(200).json({ success: true, data: result });
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
