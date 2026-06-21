const IntegrationConfig = require("../models/integrationConfigModel");
const IntegrationIngredientMapping = require("../models/integrationIngredientMappingModel");
const IntegrationVendorMapping = require("../models/integrationVendorMappingModel");
const GoodsReceiptNote = require("../models/goodsReceiptNoteModel");
const StockTakeSession = require("../models/stockTakeSessionModel");
const { resolveLocationMapping } = require("./bigcapitalSyncProcessor");

async function postToFinance(integrationConfig, path, payload) {
  const cfg = integrationConfig.bigcapital;
  const base = String(cfg.internalBaseUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("Bigcapital internalBaseUrl not configured");

  const response = await fetch(`${base}/api/internal/pos/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": cfg.internalSecret || "",
    },
    body: JSON.stringify({
      tenantId: cfg.financeTenantId,
      payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Finance API ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function resolveVendorId(orgId, supplierId, cfg) {
  if (supplierId) {
    const mapped = await IntegrationVendorMapping.findOne({
      organization: orgId,
      posSupplierId: supplierId,
    }).lean();
    if (mapped?.bigcapitalVendorId) return mapped.bigcapitalVendorId;
  }
  return cfg.defaultVendorId || null;
}

async function loadIngredientItemMap(orgId, ingredientIds) {
  const mappings = await IntegrationIngredientMapping.find({
    organization: orgId,
    posIngredientId: { $in: ingredientIds },
  }).lean();
  return Object.fromEntries(
    mappings.map((m) => [String(m.posIngredientId), m.bigcapitalItemId])
  );
}

/**
 * @param {import('mongoose').Document} grn
 * @param {object} integrationConfig
 */
async function buildGrnBillPayload(grn, integrationConfig) {
  const orgId = grn.organization;
  const cfg = integrationConfig.bigcapital;
  const vendorId = await resolveVendorId(orgId, grn.supplier, cfg);
  if (!vendorId) {
    throw new Error(
      "Finance vendor not configured — map supplier or set defaultVendorId on integration"
    );
  }

  const lines = (grn.lines || []).filter(
    (l) => (Number(l.quantityReceived) || 0) > 0 && l.ingredient
  );
  const ingIds = lines.map((l) => String(l.ingredient._id || l.ingredient));
  const itemMap = await loadIngredientItemMap(orgId, ingIds);

  const entries = [];
  for (const line of lines) {
    const ingId = String(line.ingredient._id || line.ingredient);
    const itemId = itemMap[ingId];
    if (!itemId) continue;
    const qty = Number(line.quantityReceived) || 0;
    const rate = Number(line.unitCost) || 0;
    entries.push({
      itemId,
      quantity: qty,
      rate,
      description: line.ingredient?.name
        ? `GRN ${ingId.slice(-8)} · ${line.ingredient.name}`
        : `GRN line ${ingId.slice(-8)}`,
    });
  }

  if (!entries.length) return null;

  const receiptDate = grn.receivedAt
    ? new Date(grn.receivedAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const fakeOrder = { location: grn.location };
  const { warehouseId, branchId } = resolveLocationMapping(fakeOrder, cfg);

  const payload = {
    referenceNo: `pos-grn-${grn._id}`,
    billDate: receiptDate,
    vendorId,
    entries,
    note: `POS GRN ${grn._id}`,
  };
  if (warehouseId) payload.warehouseId = warehouseId;
  if (branchId) payload.branchId = branchId;

  return payload;
}

/**
 * @param {{ data: { grnId: string, organizationId: string } }} job
 */
async function processGrnBillJob(job) {
  const { grnId, organizationId } = job.data;

  const [grn, integrationConfig] = await Promise.all([
    GoodsReceiptNote.findById(grnId).populate("lines.ingredient", "name"),
    IntegrationConfig.findOne({ organization: organizationId }),
  ]);

  if (!grn) throw new Error(`GRN ${grnId} not found`);
  if (!integrationConfig?.bigcapital?.enabled) {
    return { skipped: true, reason: "Bigcapital not enabled for org" };
  }

  const payload = await buildGrnBillPayload(grn, integrationConfig);
  if (!payload) {
    return {
      skipped: true,
      reason: "No mapped ingredients on GRN — Finance bill not created",
    };
  }

  const result = await postToFinance(
    integrationConfig,
    "inventory/grn-bill",
    payload
  );
  return { success: true, billId: result?.data?.id ?? result?.data?.bill?.id };
}

/**
 * @param {{ data: object }} job
 */
async function processInventoryAdjustJob(job) {
  const {
    organizationId,
    ingredientId,
    delta,
    unitCost,
    reason,
    referenceNo,
    description,
  } = job.data;

  const integrationConfig = await IntegrationConfig.findOne({
    organization: organizationId,
  });
  if (!integrationConfig?.bigcapital?.enabled) {
    return { skipped: true, reason: "Bigcapital not enabled for org" };
  }

  const itemMap = await loadIngredientItemMap(organizationId, [ingredientId]);
  const itemId = itemMap[String(ingredientId)];
  if (!itemId) {
    return {
      skipped: true,
      reason: "Ingredient not mapped to Finance item",
    };
  }

  const qty = Number(delta);
  const uc = Number(unitCost) || 0;
  if (!qty || uc < 0) {
    return { skipped: true, reason: "invalid_adjustment" };
  }

  const cfg = integrationConfig.bigcapital;
  const payload = {
    referenceNo: referenceNo || `pos-adjust-${ingredientId}-${Date.now()}`,
    journalDate: new Date().toISOString().split("T")[0],
    lines: [
      {
        itemId,
        quantity: qty,
        unitCost: uc,
        description: description || `POS ${reason || "adjustment"}`,
      },
    ],
    description: `POS inventory ${reason || "adjustment"}`,
  };
  if (cfg.inventoryAccountId) {
    payload.inventoryAccountId = cfg.inventoryAccountId;
  }
  if (cfg.inventoryVarianceAccountId) {
    payload.varianceAccountId = cfg.inventoryVarianceAccountId;
  }

  const result = await postToFinance(
    integrationConfig,
    "inventory/variance-journal",
    payload
  );
  return { success: true, journal: result?.data };
}

/**
 * @param {{ data: { stockTakeSessionId: string, organizationId: string } }} job
 */
async function processStockTakeVarianceJob(job) {
  const { stockTakeSessionId, organizationId } = job.data;

  const [session, integrationConfig] = await Promise.all([
    StockTakeSession.findById(stockTakeSessionId).populate(
      "lines.ingredient",
      "name averageUnitCost unitCost"
    ),
    IntegrationConfig.findOne({ organization: organizationId }),
  ]);

  if (!session) throw new Error(`Stock take ${stockTakeSessionId} not found`);
  if (!integrationConfig?.bigcapital?.enabled) {
    return { skipped: true, reason: "Bigcapital not enabled for org" };
  }

  const ingIds = (session.lines || [])
    .filter((l) => Math.abs(Number(l.varianceQty) || 0) > 1e-9)
    .map((l) => String(l.ingredient?._id || l.ingredient));

  const itemMap = await loadIngredientItemMap(organizationId, ingIds);
  const journalLines = [];

  for (const line of session.lines || []) {
    const delta = Number(line.varianceQty) || 0;
    if (Math.abs(delta) < 1e-9) continue;
    const ingId = String(line.ingredient?._id || line.ingredient);
    const itemId = itemMap[ingId];
    if (!itemId) continue;
    const uc =
      Number(line.ingredient?.averageUnitCost) ||
      Number(line.ingredient?.unitCost) ||
      (Math.abs(delta) > 1e-9
        ? Math.abs(Number(line.varianceValue) / delta)
        : 0) ||
      0;
    journalLines.push({
      itemId,
      quantity: delta,
      unitCost: uc,
      description: line.ingredient?.name
        ? `Stock take · ${line.ingredient.name}`
        : `Stock take line`,
    });
  }

  if (!journalLines.length) {
    return {
      skipped: true,
      reason: "No mapped variance lines for Finance",
    };
  }

  const cfg = integrationConfig.bigcapital;
  const payload = {
    referenceNo: `pos-stocktake-${session._id}`,
    journalDate: (session.postedAt
      ? new Date(session.postedAt)
      : new Date()
    )
      .toISOString()
      .split("T")[0],
    lines: journalLines,
    description: `POS stock take ${session._id}`,
  };
  if (cfg.inventoryAccountId) payload.inventoryAccountId = cfg.inventoryAccountId;
  if (cfg.inventoryVarianceAccountId) {
    payload.varianceAccountId = cfg.inventoryVarianceAccountId;
  }

  const result = await postToFinance(
    integrationConfig,
    "inventory/variance-journal",
    payload
  );
  return { success: true, journal: result?.data };
}

module.exports = {
  buildGrnBillPayload,
  processGrnBillJob,
  processInventoryAdjustJob,
  processStockTakeVarianceJob,
  postToFinance,
};
