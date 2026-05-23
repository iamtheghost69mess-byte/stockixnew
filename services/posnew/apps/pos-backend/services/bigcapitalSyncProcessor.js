const IntegrationConfig = require("../models/integrationConfigModel");
const IntegrationItemMapping = require("../models/integrationItemMappingModel");
const Order = require("../models/orderModel");

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
 * Build receipt line entries from order lines and mapping table.
 * @param {object} order
 * @param {Record<string, { id: number }>} itemMap
 */
function buildMappedEntries(order, itemMap) {
  return order.items
    .filter((item) => item.menuItem && Number(item.quantity) > 0)
    .map((item) => {
      const mapped = itemMap[String(item.menuItem)];
      const qty = Math.max(1, Number(item.quantity) || 1);
      const rate =
        Number(item.pricePerQuantity) ||
        (Number(item.price) > 0 ? Number(item.price) / qty : 0);
      return {
        itemId: mapped?.id ?? null,
        description: `${item.name || "Item"}${modifierSuffix(item)}`,
        quantity: qty,
        rate,
        discount: 0,
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

  const payload = {
    customerId: cfg.defaultWalkInCustomerId,
    receiptDate,
    referenceNo: String(order._id),
    depositAccountId,
    entries,
    closed: true,
    statement: `POS Order #${order.orderNumber || order._id} | ${order.paymentMethod || "cash"}`,
  };

  const fx = Number(order.fxRateToCompany);
  if (order.documentCurrency && fx > 0) {
    payload.exchangeRate = fx;
  }

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
    await IntegrationConfig.findOneAndUpdate(
      { organization: organizationId },
      { "bigcapital.syncStatus": "idle", "bigcapital.lastSyncError": null }
    );
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
  buildMappedEntries,
  resolveDepositAccountId,
  isCardMethodKey,
  postToBigcapital,
  processBigcapitalSyncJob,
  onBigcapitalSyncFailed,
};
