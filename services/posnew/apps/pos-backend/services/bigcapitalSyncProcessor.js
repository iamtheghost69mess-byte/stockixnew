const IntegrationConfig = require("../models/integrationConfigModel");
const IntegrationItemMapping = require("../models/integrationItemMappingModel");
const Order = require("../models/orderModel");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("./backofficeNotificationEvents");

function modifierSuffix(line) {
  const groups = line.selectedModifiers;
  if (!Array.isArray(groups) || !groups.length) return "";
  const names = groups.flatMap(
    (g) => (g.selectedOptions || []).map((o) => o.name).filter(Boolean)
  );
  if (!names.length) return "";
  return ` (${names.join(", ")})`;
}

function isCardMethodKey(methodKey) {
  const k = String(methodKey || "").toLowerCase().trim();
  return k.includes("card") || k === "credit" || k === "debit";
}

/**
 * Pick cash vs card deposit account from payment method or largest split.
 * @param {object} order
 * @param {object} cfg - integrationConfig.bigcapital
 */
function resolveDepositAccountId(order, cfg) {
  const splits = order.paymentSplits;
  if (Array.isArray(splits) && splits.length) {
    const sorted = [...splits].sort(
      (a, b) => Number(b.amount) - Number(a.amount)
    );
    const primary = sorted[0];
    if (primary && isCardMethodKey(primary.methodKey)) {
      return cfg.defaultCardDepositAccountId || cfg.defaultCashDepositAccountId;
    }
    return cfg.defaultCashDepositAccountId || cfg.defaultCardDepositAccountId;
  }
  if (isCardMethodKey(order.paymentMethod)) {
    return cfg.defaultCardDepositAccountId || cfg.defaultCashDepositAccountId;
  }
  return cfg.defaultCashDepositAccountId || cfg.defaultCardDepositAccountId;
}

/**
 * Resolve Bigcapital branch/warehouse from POS order location.
 * @param {object} order
 * @param {object} cfg - integrationConfig.bigcapital
 */
function resolveLocationMapping(order, cfg) {
  const orderLocationId = order.location ? String(order.location) : "";
  const locMapping = (cfg.locationMapping || []).find(
    (m) =>
      m.posLocationId &&
      orderLocationId &&
      String(m.posLocationId) === orderLocationId
  );
  const warehouseId =
    locMapping?.bigcapitalWarehouseId ?? cfg.defaultWarehouseId ?? null;
  const branchId = locMapping?.bigcapitalBranchId ?? null;
  return { warehouseId, branchId };
}

/**
 * Build receipt line entries from order lines and mapping table.
 * @param {object} order
 * @param {Record<string, { id: number }>} itemMap
 */
/**
 * Append service charge / order discount lines when Finance item IDs are configured.
 * @param {object} order
 * @param {object} cfg - integrationConfig.bigcapital
 * @param {Array<{ itemId: number, description: string, quantity: number, rate: number, discount: number }>} entries
 */
function appendFinanceAdjustmentEntries(order, cfg, entries) {
  const serviceChargeAmount = Number(order.bills?.serviceChargeAmount || 0);
  if (serviceChargeAmount > 0 && cfg.serviceChargeItemId) {
    entries.push({
      itemId: cfg.serviceChargeItemId,
      description: "Service Charge",
      quantity: 1,
      rate: serviceChargeAmount,
      discount: 0,
    });
  }

  const discountAmount = Number(order.manualDiscountAmount || 0);
  if (discountAmount > 0 && cfg.discountItemId) {
    entries.push({
      itemId: cfg.discountItemId,
      description: "Order Discount",
      quantity: 1,
      rate: discountAmount,
      discount: discountAmount,
    });
  }
}

function buildMappedEntries(order, itemMap) {
  return order.items
    .filter((item) => item.menuItem && Number(item.quantity) > 0)
    .map((item) => {
      const mapped = itemMap[String(item.menuItem)];
      const qty = Math.max(1, Number(item.quantity) || 1);
      const rate =
        Number(item.pricePerQuantity) ||
        (Number(item.price) > 0 ? Number(item.price) / qty : 0);
      const lineDiscount = Number(item.discount?.amount);
      return {
        itemId: mapped?.id ?? null,
        description: `${item.name || "Item"}${modifierSuffix(item)}`,
        quantity: qty,
        rate,
        discount: lineDiscount > 0 ? lineDiscount : 0,
      };
    })
    .filter((e) => e.itemId != null);
}

/**
 * @param {import('mongoose').Document} order
 * @param {object} integrationConfig
 * @returns {Promise<object|null>}
 */
async function buildSaleReceiptPayload(order, integrationConfig) {
  const orgId = order.organization;
  const cfg = integrationConfig.bigcapital;

  const menuItemIds = order.items
    .filter((i) => i.menuItem && Number(i.quantity) > 0)
    .map((i) => String(i.menuItem));

  if (!menuItemIds.length) return null;

  const mappings = await IntegrationItemMapping.find({
    organization: orgId,
    posMenuItemId: { $in: menuItemIds },
  }).lean();

  const itemMap = Object.fromEntries(
    mappings.map((m) => [
      String(m.posMenuItemId),
      { id: m.bigcapitalItemId, name: m.bigcapitalItemName },
    ])
  );

  const entries = buildMappedEntries(order, itemMap);
  appendFinanceAdjustmentEntries(order, cfg, entries);

  if (!entries.length) return null;

  const depositAccountId = resolveDepositAccountId(order, cfg);

  if (!depositAccountId || !cfg.defaultWalkInCustomerId) {
    throw new Error(
      "Bigcapital default customer or deposit account not configured"
    );
  }

  const receiptDate = order.paidAt
    ? new Date(order.paidAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const serviceChargeAmount = Number(order.bills?.serviceChargeAmount || 0);
  const discountAmount = Number(order.manualDiscountAmount || 0);
  let statement = `POS Order #${order.orderNumber || order._id} | ${order.paymentMethod || "cash"}`;
  if (serviceChargeAmount > 0 && !cfg.serviceChargeItemId) {
    statement += ` | Service charge: ${serviceChargeAmount}`;
  }
  if (discountAmount > 0 && !cfg.discountItemId) {
    statement += ` | Order discount: ${discountAmount}`;
  }

  const payload = {
    customerId: cfg.defaultWalkInCustomerId,
    receiptDate,
    referenceNo: String(order._id),
    depositAccountId,
    entries,
    closed: true,
    statement,
  };

  const fx = Number(order.fxRateToCompany);
  if (order.documentCurrency && fx > 0) {
    payload.exchangeRate = fx;
  }

  const { warehouseId, branchId } = resolveLocationMapping(order, cfg);
  if (warehouseId) payload.warehouseId = warehouseId;
  if (branchId) payload.branchId = branchId;

  return payload;
}

async function postToBigcapital(integrationConfig, payload) {
  const cfg = integrationConfig.bigcapital;
  const base = String(cfg.internalBaseUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("Bigcapital internalBaseUrl not configured");

  const response = await fetch(`${base}/api/internal/pos/receipts`, {
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
    throw new Error(`Bigcapital API ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * BullMQ job processor for bigcapital_sync queue.
 * @param {{ data: { orderId: string, organizationId: string } }} job
 */
async function processBigcapitalSyncJob(job) {
  const { orderId, organizationId } = job.data;

  const [order, integrationConfig] = await Promise.all([
    Order.findById(orderId),
    IntegrationConfig.findOne({ organization: organizationId }),
  ]);

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  if (!integrationConfig?.bigcapital?.enabled) {
    return { skipped: true, reason: "Bigcapital not enabled for org" };
  }

  await IntegrationConfig.findOneAndUpdate(
    { organization: organizationId },
    { "bigcapital.syncStatus": "syncing" }
  );

  const payload = await buildSaleReceiptPayload(order, integrationConfig);

  if (!payload) {
    await notifyUnmappedBigcapitalSync(order, organizationId);
    await IntegrationConfig.findOneAndUpdate(
      { organization: organizationId },
      { "bigcapital.syncStatus": "idle", "bigcapital.lastSyncError": null }
    );
    await Order.findByIdAndUpdate(orderId, {
      accountingSaleStatus: "failed",
      accountingSaleError: "No mapped items — Finance receipt not created",
    }).catch(() => {});
    return {
      skipped: true,
      reason: "No mapped items in order — nothing to push",
    };
  }

  const result = await postToBigcapital(integrationConfig, payload);

  await Order.findByIdAndUpdate(orderId, {
    accountingSaleStatus: "ok",
    accountingSaleError: "",
  });

  await IntegrationConfig.findOneAndUpdate(
    { organization: organizationId },
    {
      "bigcapital.lastSyncedAt": new Date(),
      "bigcapital.lastSyncError": null,
      "bigcapital.syncStatus": "idle",
    }
  );

  return {
    success: true,
    bigcapitalReceiptId: result?.data?.id ?? result?.data?.receipt?.id,
  };
}

/**
 * DELETE Finance sale receipt by POS order id (referenceNo).
 * @param {string} orderId
 * @param {string} organizationId
 */
async function voidFinanceReceipt(orderId, organizationId) {
  const integrationConfig = await IntegrationConfig.findOne({
    organization: organizationId,
  });

  if (!integrationConfig?.bigcapital?.enabled) {
    return { skipped: true, reason: "Bigcapital not enabled for org" };
  }

  const cfg = integrationConfig.bigcapital;
  const baseUrl = String(cfg.internalBaseUrl || "").replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Bigcapital internalBaseUrl is not configured");
  }

  const response = await fetch(
    `${baseUrl}/api/internal/pos/receipts/by-reference/${encodeURIComponent(orderId)}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": cfg.internalSecret || "",
      },
      body: JSON.stringify({ tenantId: cfg.financeTenantId }),
    }
  );

  if (response.status === 404) {
    return { skipped: true, reason: "Receipt not found in Finance" };
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Finance void failed ${response.status}: ${errorText}`);
  }

  await Order.findByIdAndUpdate(orderId, {
    accountingSaleStatus: "skipped",
    accountingSaleError: "",
  }).catch(() => {});

  return { success: true };
}

/**
 * BullMQ job processor for void_receipt jobs.
 * @param {{ data: { orderId: string, organizationId: string } }} job
 */
async function processBigcapitalVoidJob(job) {
  const { orderId, organizationId } = job.data;
  return voidFinanceReceipt(orderId, organizationId);
}

async function onBigcapitalSyncFailed(job, error) {
  console.error("[BigcapitalSync] Job failed:", job?.id, error?.message);

  if (job?.data?.organizationId) {
    await IntegrationConfig.findOneAndUpdate(
      { organization: job.data.organizationId },
      {
        "bigcapital.lastSyncError": error.message,
        "bigcapital.syncStatus": "error",
      }
    ).catch(() => {});
  }

  if (job?.data?.orderId) {
    await Order.findByIdAndUpdate(job.data.orderId, {
      accountingSaleStatus: "failed",
      accountingSaleError: String(error.message || "sync failed").slice(0, 500),
    }).catch(() => {});
  }
}

module.exports = {
  buildSaleReceiptPayload,
  appendFinanceAdjustmentEntries,
  buildMappedEntries,
  resolveDepositAccountId,
  resolveLocationMapping,
  isCardMethodKey,
  postToBigcapital,
  processBigcapitalSyncJob,
  processBigcapitalVoidJob,
  voidFinanceReceipt,
  onBigcapitalSyncFailed,
};
